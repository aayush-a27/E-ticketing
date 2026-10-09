import { Show } from '../../models/Show.js';
import { Movie } from '../../models/Movie.js';
import { Screen } from '../../models/Screen.js';
import { Theater } from '../../models/Theater.js';
import { SeatLayout } from '../../models/SeatLayout.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  MOVIE_STATUS,
  ROLES,
  SEAT_KINDS,
  SHOW_STATUS,
  THEATER_STATUS,
} from '../../constants/index.js';
import { recordAudit } from '../../services/auditService.js';
import { resolvePagination, paginated } from '../../utils/pagination.js';
import { managedTheaterIds } from '../../middleware/requireTheaterAccess.js';
import { getActiveLayout, getLayout } from '../theaters/theaters.service.js';
import { calculatePricing } from '../../services/pricingService.js';
import { withTransaction, withSession } from '../../utils/withTransaction.js';
import { generateInventory, getSeatAvailability } from '../inventory/inventory.service.js';

const DEFAULT_CLEANUP_MINUTES = 15;

/**
 * Two shows clash when their occupied windows intersect. The window runs from
 * the start to the end of the film plus the cleanup gap, so a show cannot be
 * scheduled into the turnaround of the one before it.
 *
 * The check is a query rather than an in-memory scan, and it ignores cancelled
 * shows, which free their slot.
 */
export async function findOverlappingShow({ screenId, startAt, endAt, excludeShowId = null }) {
  const filter = {
    screenId,
    status: { $ne: SHOW_STATUS.CANCELLED },
    // Classic interval intersection: existing.start < new.end AND
    // existing.end > new.start.
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
  };
  if (excludeShowId) filter._id = { $ne: excludeShowId };

  return Show.findOne(filter).select('_id startAt endAt status');
}

/**
 * Validates everything a show depends on, then returns the resolved documents
 * so the caller does not fetch them again.
 */
async function resolveShowContext({ movieId, screenId, format }) {
  const [movie, screen] = await Promise.all([Movie.findById(movieId), Screen.findById(screenId)]);

  if (!movie) throw ApiError.notFound('Movie not found');
  if (movie.status !== MOVIE_STATUS.PUBLISHED) {
    throw ApiError.badRequest(
      'Only a published movie can be scheduled',
      [{ field: 'movieId', message: `This movie is ${movie.status}` }],
      ERROR_CODES.MOVIE_NOT_PUBLISHED,
    );
  }

  if (!screen) throw ApiError.notFound('Screen not found');
  if (!screen.isActive) {
    throw ApiError.badRequest(
      'This screen is not active',
      [{ field: 'screenId', message: 'Screen is inactive' }],
      ERROR_CODES.SCREEN_INACTIVE,
    );
  }

  if (format && !screen.formats.includes(format)) {
    throw ApiError.badRequest(
      `This screen does not support ${format}`,
      [{ field: 'format', message: `Supported: ${screen.formats.join(', ')}` }],
    );
  }

  const theater = await Theater.findById(screen.theaterId);
  if (!theater) throw ApiError.notFound('Theater not found');
  if (theater.status !== THEATER_STATUS.ACTIVE) {
    throw ApiError.badRequest('This theater is not active', [
      { field: 'theaterId', message: `Theater is ${theater.status}` },
    ]);
  }

  const layout = await getActiveLayout(screen);

  return { movie, screen, theater, layout };
}

/**
 * Every bookable category in the layout must carry a price, and no price may
 * name a category the layout does not have. Without this a customer could pick
 * a seat the server cannot price.
 */
function assertPricingCoversLayout(pricing, layout) {
  const layoutCategories = new Set(
    layout.seats
      .filter((seat) => seat.kind === SEAT_KINDS.SEAT && seat.isActive)
      .map((seat) => seat.category),
  );
  const pricedCategories = new Set(pricing.map((item) => item.category));

  const unpriced = [...layoutCategories].filter((category) => !pricedCategories.has(category));
  if (unpriced.length) {
    throw ApiError.badRequest(
      'Every seat category in this screen needs a price',
      unpriced.map((category) => ({ field: 'pricing', message: `No price for "${category}"` })),
      ERROR_CODES.PRICING_INCOMPLETE,
    );
  }

  const unknown = [...pricedCategories].filter((category) => !layoutCategories.has(category));
  if (unknown.length) {
    throw ApiError.badRequest(
      'Priced a category this screen does not have',
      unknown.map((category) => ({ field: 'pricing', message: `Unknown category "${category}"` })),
      ERROR_CODES.PRICING_INCOMPLETE,
    );
  }
}

export async function createShow(actor, payload, req) {
  const { movie, screen, theater, layout } = await resolveShowContext(payload);

  // Gate 4, checked against the theater the screen actually belongs to — not
  // against any id the client sent.
  if (actor.role !== ROLES.SUPER_ADMIN && !theater.isManagedBy(actor._id)) {
    throw ApiError.forbidden('You do not manage this theater', ERROR_CODES.NOT_THEATER_MANAGER);
  }

  assertPricingCoversLayout(payload.pricing, layout);

  const cleanupMinutes = payload.cleanupMinutes ?? DEFAULT_CLEANUP_MINUTES;
  const endAt = new Date(
    payload.startAt.getTime() + (movie.runtimeMinutes + cleanupMinutes) * 60_000,
  );

  const clash = await findOverlappingShow({ screenId: screen._id, startAt: payload.startAt, endAt });
  if (clash) {
    throw ApiError.conflict(
      'Another show already occupies this screen at that time',
      ERROR_CODES.SHOW_OVERLAP,
      [
        {
          field: 'startAt',
          message: `Conflicts with a show running ${clash.startAt.toISOString()} to ${clash.endAt.toISOString()}`,
        },
      ],
    );
  }

  const show = await Show.create({
    movieId: movie._id,
    theaterId: theater._id,
    screenId: screen._id,
    city: theater.city,
    startAt: payload.startAt,
    endAt,
    language: payload.language,
    format: payload.format,
    layoutVersion: layout.version,
    pricing: payload.pricing,
    bookingOpensAt: payload.bookingOpensAt,
    bookingClosesAt: payload.bookingClosesAt,
    status: SHOW_STATUS.DRAFT,
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.SHOW_CREATED,
    resourceType: 'Show',
    resourceId: show._id,
    after: {
      movieId: String(movie._id),
      screenId: String(screen._id),
      startAt: show.startAt,
    },
    req,
  });

  return show;
}

async function loadShowForWrite(actor, id) {
  const show = await Show.findById(id);
  if (!show) throw ApiError.notFound('Show not found');

  const theater = await Theater.findById(show.theaterId);
  if (!theater) throw ApiError.notFound('Theater not found');

  if (actor.role !== ROLES.SUPER_ADMIN && !theater.isManagedBy(actor._id)) {
    throw ApiError.forbidden('You do not manage this theater', ERROR_CODES.NOT_THEATER_MANAGER);
  }

  return { show, theater };
}

/**
 * Once a seat has been sold, the things a ticket holder relied on are frozen:
 * the time, the price and the seat map. Only the booking window may still be
 * adjusted, and the show can still be cancelled outright.
 */
export async function updateShow(actor, id, payload, req) {
  const { show } = await loadShowForWrite(actor, id);

  if (show.status === SHOW_STATUS.CANCELLED) {
    throw ApiError.conflict('This show is cancelled', ERROR_CODES.SHOW_NOT_EDITABLE);
  }

  const hasSales = show.bookedSeatCount > 0;
  if (hasSales) {
    const frozen = ['startAt', 'pricing', 'format', 'language', 'cleanupMinutes'].filter(
      (field) => payload[field] !== undefined,
    );
    if (frozen.length) {
      throw ApiError.conflict(
        `This show has ${show.bookedSeatCount} seat(s) sold. ${frozen.join(', ')} can no longer change.`,
        ERROR_CODES.SHOW_NOT_EDITABLE,
        frozen.map((field) => ({ field, message: 'Locked once tickets are sold' })),
      );
    }
  }

  const before = { startAt: show.startAt, pricing: show.pricing, status: show.status };

  if (payload.pricing) {
    const screen = await Screen.findById(show.screenId);
    const layout = await getLayout(screen._id, show.layoutVersion);
    assertPricingCoversLayout(payload.pricing, layout);
    show.pricing = payload.pricing;
  }

  if (payload.startAt || payload.cleanupMinutes !== undefined) {
    const movie = await Movie.findById(show.movieId);
    const startAt = payload.startAt ?? show.startAt;
    const cleanupMinutes = payload.cleanupMinutes ?? DEFAULT_CLEANUP_MINUTES;
    const endAt = new Date(startAt.getTime() + (movie.runtimeMinutes + cleanupMinutes) * 60_000);

    const clash = await findOverlappingShow({
      screenId: show.screenId,
      startAt,
      endAt,
      excludeShowId: show._id,
    });
    if (clash) {
      throw ApiError.conflict(
        'Another show already occupies this screen at that time',
        ERROR_CODES.SHOW_OVERLAP,
      );
    }

    show.startAt = startAt;
    show.endAt = endAt;
  }

  for (const field of ['language', 'format', 'bookingOpensAt', 'bookingClosesAt']) {
    if (payload[field] !== undefined) show[field] = payload[field];
  }

  if (payload.format) {
    const screen = await Screen.findById(show.screenId);
    if (!screen.formats.includes(payload.format)) {
      throw ApiError.badRequest(`This screen does not support ${payload.format}`);
    }
  }

  show.updatedBy = actor._id;
  await show.save();

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.SHOW_UPDATED,
    resourceType: 'Show',
    resourceId: show._id,
    before,
    after: { startAt: show.startAt, pricing: show.pricing },
    req,
  });

  return show;
}

/**
 * Publishing makes a show visible and bookable. Seat inventory generation hangs
 * off this transition and arrives in Phase 4.
 */
export async function publishShow(actor, id, req) {
  const { show } = await loadShowForWrite(actor, id);

  if (show.status === SHOW_STATUS.PUBLISHED) return { show, unchanged: true };
  if (show.status === SHOW_STATUS.CANCELLED) {
    throw ApiError.conflict('A cancelled show cannot be published', ERROR_CODES.SHOW_NOT_EDITABLE);
  }
  if (show.startAt <= new Date()) {
    throw ApiError.badRequest('This show has already started');
  }

  const movie = await Movie.findById(show.movieId);
  if (movie.status !== MOVIE_STATUS.PUBLISHED) {
    throw ApiError.badRequest(
      'The movie is not published',
      [{ field: 'movieId', message: `Movie is ${movie.status}` }],
      ERROR_CODES.MOVIE_NOT_PUBLISHED,
    );
  }

  /**
   * Publishing is what brings a show's seat inventory into existence, and the
   * two must land together: a published show with no ShowSeat records would be
   * bookable with nothing to book.
   */
  const inventory = await withTransaction(
    async (session) => {
      show.status = SHOW_STATUS.PUBLISHED;
      show.publishedAt = new Date();
      show.updatedBy = actor._id;
      await show.save({ ...withSession(session) });

      const generated = await generateInventory(show, { session, actor, req });

      await recordAudit(
        {
          actor,
          action: AUDIT_ACTIONS.SHOW_PUBLISHED,
          resourceType: 'Show',
          resourceId: show._id,
          after: { status: show.status, seatsGenerated: generated.inserted },
          req,
        },
        session,
      );

      return generated;
    },
    { required: true },
  );

  return { show, unchanged: false, inventory };
}

export async function cancelShow(actor, id, { reason }, req) {
  const { show } = await loadShowForWrite(actor, id);

  if (show.status === SHOW_STATUS.CANCELLED) return { show, unchanged: true };

  show.status = SHOW_STATUS.CANCELLED;
  show.cancelledAt = new Date();
  show.cancellationReason = reason;
  show.updatedBy = actor._id;
  await show.save();

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.SHOW_CANCELLED,
    resourceType: 'Show',
    resourceId: show._id,
    after: { status: show.status, bookedSeatCount: show.bookedSeatCount },
    reason,
    req,
  });

  // Refunding anyone already holding a ticket is Phase 5's job; the audit entry
  // records how many seats are affected.
  return { show, unchanged: false, seatsToRefund: show.bookedSeatCount };
}

// --- Reading ----------------------------------------------------------------

function dayRange(dateString, timezoneOffsetMinutes = 330) {
  // Interprets YYYY-MM-DD as a local day in the platform's timezone
  // (IST, UTC+5:30 by default) and converts it to a UTC window.
  const [year, month, day] = dateString.split('-').map(Number);
  const startUtcMs = Date.UTC(year, month - 1, day) - timezoneOffsetMinutes * 60_000;
  return {
    from: new Date(startUtcMs),
    to: new Date(startUtcMs + 86_400_000),
  };
}

/**
 * The public shape of a show. Internal fields — who created it, its draft
 * status, and `bookedSeatCount`, which is commercial data — never leave the
 * platform. Handles a populated or a bare reference, so one serializer covers
 * both the list and the detail query.
 */
function publicShowJSON(show) {
  const ref = (value, project) =>
    value && typeof value === 'object' && value._id ? project(value) : null;

  const pricing = show.pricing.map((item) => ({
    category: item.category,
    basePaise: item.basePaise,
  }));

  return {
    id: String(show._id),
    startAt: show.startAt,
    endAt: show.endAt,
    timezone: show.timezone,
    language: show.language,
    format: show.format,
    layoutVersion: show.layoutVersion,
    pricing,
    // Saves every client re-deriving "from ₹150" for a listing card.
    startingPricePaise: pricing.length ? Math.min(...pricing.map((item) => item.basePaise)) : null,
    bookingOpensAt: show.bookingOpensAt ?? null,
    bookingClosesAt: show.bookingClosesAt ?? null,
    isBookable: show.isBookable,

    movieId: String(show.movieId?._id ?? show.movieId),
    theaterId: String(show.theaterId?._id ?? show.theaterId),
    screenId: String(show.screenId?._id ?? show.screenId),

    movie: ref(show.movieId, (movie) => ({
      id: String(movie._id),
      title: movie.title,
      slug: movie.slug,
      poster: movie.poster ? { url: movie.poster.url } : null,
      synopsis: movie.synopsis ?? undefined,
      runtimeMinutes: movie.runtimeMinutes,
      certification: movie.certification,
      languages: movie.languages ?? undefined,
    })),
    theater: ref(show.theaterId, (theater) => ({
      id: String(theater._id),
      name: theater.name,
      city: theater.cityLabel,
      address: [theater.addressLine1, theater.addressLine2].filter(Boolean).join(', '),
    })),
    screen: ref(show.screenId, (screen) => ({
      id: String(screen._id),
      name: screen.name,
      formats: screen.formats,
    })),
  };
}

export async function listShows(query, { user = null, publicOnly = false } = {}) {
  const { page, limit, skip } = resolvePagination(query);
  const filter = {};

  if (publicOnly) {
    filter.status = SHOW_STATUS.PUBLISHED;
    // Customers never see a show that has already started.
    filter.startAt = { $gt: new Date() };
  } else if (query.status) {
    filter.status = query.status;
  }

  if (query.city) filter.city = query.city.toLowerCase();
  if (query.movieId) filter.movieId = query.movieId;
  if (query.theaterId) filter.theaterId = query.theaterId;
  if (query.screenId) filter.screenId = query.screenId;
  if (query.language) filter.language = query.language;
  if (query.format) filter.format = query.format;

  if (query.date) {
    const { from, to } = dayRange(query.date);
    filter.startAt = publicOnly
      ? { $gt: new Date(Math.max(from.getTime(), Date.now())), $lt: to }
      : { $gte: from, $lt: to };
  }

  if (user) {
    const ids = await managedTheaterIds(user);
    if (ids !== null) filter.theaterId = { $in: ids };
  }

  const [items, total] = await Promise.all([
    Show.find(filter)
      .sort({ startAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('movieId', 'title slug poster runtimeMinutes certification')
      .populate('theaterId', 'name cityLabel addressLine1')
      .populate('screenId', 'name formats'),
    Show.countDocuments(filter),
  ]);

  return paginated(
    items.map((show) => (publicOnly ? publicShowJSON(show) : show)),
    { page, limit, total },
  );
}

export async function getShow(id, { publicOnly = false } = {}) {
  const filter = { _id: id };
  if (publicOnly) filter.status = SHOW_STATUS.PUBLISHED;

  const show = await Show.findOne(filter)
    .populate('movieId', 'title slug poster synopsis runtimeMinutes certification languages')
    .populate('theaterId', 'name cityLabel addressLine1 addressLine2')
    .populate('screenId', 'name formats');

  if (!show) throw ApiError.notFound('Show not found');
  return publicOnly ? publicShowJSON(show) : show;
}

/**
 * The seat map for a show: the layout version it was scheduled with, plus the
 * price for each category. Live availability joins this in Phase 4; until then
 * every seat reads as available.
 */
export async function getSeatMap(showId, { publicOnly = true, userId = null } = {}) {
  const filter = { _id: showId };
  if (publicOnly) filter.status = SHOW_STATUS.PUBLISHED;

  const show = await Show.findOne(filter);
  if (!show) throw ApiError.notFound('Show not found');

  // Live state per seat, read from inventory rather than inferred.
  return getSeatAvailability(show, { userId });
}

/**
 * A price quote for a set of seats, computed entirely on the server from the
 * show's own price table. The client never sends an amount.
 */
export async function quotePrice(showId, seatIds) {
  const show = await Show.findOne({ _id: showId, status: SHOW_STATUS.PUBLISHED });
  if (!show) throw ApiError.notFound('Show not found');

  const layout = await SeatLayout.findOne({
    screenId: show.screenId,
    version: show.layoutVersion,
  });
  if (!layout) throw ApiError.notFound('Seat layout not found for this show');

  const seatsById = new Map(layout.seats.map((seat) => [seat.seatId, seat]));
  const seats = [];

  for (const seatId of seatIds) {
    const seat = seatsById.get(seatId);
    if (!seat) {
      throw ApiError.badRequest('That seat is not part of this show', [
        { field: 'seatIds', message: `Unknown seat "${seatId}"` },
      ]);
    }
    if (seat.kind !== SEAT_KINDS.SEAT || !seat.isActive) {
      throw ApiError.badRequest('That position cannot be booked', [
        { field: 'seatIds', message: `"${seatId}" is not a bookable seat` },
      ]);
    }
    seats.push({ seatId: seat.seatId, label: seat.label, category: seat.category });
  }

  if (new Set(seatIds).size !== seatIds.length) {
    throw ApiError.badRequest('The same seat was listed twice');
  }

  return calculatePricing({ show, seats });
}
