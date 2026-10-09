import { Theater } from '../../models/Theater.js';
import { Screen } from '../../models/Screen.js';
import { SeatLayout } from '../../models/SeatLayout.js';
import { Show } from '../../models/Show.js';
import { User } from '../../models/User.js';
import { ShowRunnerProfile } from '../../models/ShowRunnerProfile.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  ROLES,
  SEAT_KINDS,
  SHOW_STATUS,
  SHOW_RUNNER_STATUS,
  THEATER_STATUS,
} from '../../constants/index.js';
import { recordAudit } from '../../services/auditService.js';
import { getMediaProvider } from '../../services/media/providers.js';
import { logger } from '../../utils/logger.js';
import { withTransaction, withSession } from '../../utils/withTransaction.js';
import { resolvePagination, paginated } from '../../utils/pagination.js';
import { managedTheaterIds } from '../../middleware/requireTheaterAccess.js';

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

async function uniqueSlug(base) {
  const root = base || 'theater';
  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? root : `${root}-${suffix + 1}`;
    if (!(await Theater.exists({ slug: candidate }))) return candidate;
  }
  throw ApiError.conflict('Could not derive a unique slug', ERROR_CODES.SLUG_IN_USE);
}

// --- Theaters ---------------------------------------------------------------

export async function createTheater(actor, payload, req) {
  const { coordinates, managerIds, city, ...rest } = payload;

  const theater = await Theater.create({
    ...rest,
    city: city.toLowerCase(),
    cityLabel: city,
    slug: payload.slug ?? (await uniqueSlug(slugify(`${payload.name}-${city}`))),
    location: coordinates ? { type: 'Point', coordinates } : undefined,
    managers: managerIds ?? [],
    createdBy: actor._id,
  });

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.THEATER_CREATED,
    resourceType: 'Theater',
    resourceId: theater._id,
    after: { name: theater.name, city: theater.cityLabel },
    req,
  });

  return theater;
}

export async function updateTheater(actor, theater, payload, req) {
  const before = { name: theater.name, status: theater.status };

  const { coordinates, city, ...rest } = payload;
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) theater[key] = value;
  }
  if (city !== undefined) {
    theater.city = city.toLowerCase();
    theater.cityLabel = city;
  }
  if (coordinates !== undefined) {
    theater.location = { type: 'Point', coordinates };
  }
  await theater.save();

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.THEATER_UPDATED,
    resourceType: 'Theater',
    resourceId: theater._id,
    before,
    after: { name: theater.name, status: theater.status },
    req,
  });

  return theater;
}

/** How many photographs one venue may carry. */
export const MAX_THEATER_IMAGES = 12;

/**
 * Attaches an already-uploaded photograph to a venue.
 *
 * The file never passes through this server. The client uploads it straight to
 * the media provider using a signed ticket from /uploads/signature, then hands
 * back the publicId — which is verified against the provider here before it is
 * stored, so a fabricated id cannot put a dead link on a venue page.
 */
export async function attachTheaterImage(actor, theater, { publicId, caption }, req) {
  if (theater.images.length >= MAX_THEATER_IMAGES) {
    throw ApiError.conflict(
      `A theater may hold ${MAX_THEATER_IMAGES} images. Remove one first.`,
    );
  }
  if (theater.images.some((image) => image.publicId === publicId)) {
    throw ApiError.conflict('That image is already on this theater');
  }

  const asset = await getMediaProvider().getAsset(publicId);
  if (!asset) {
    throw ApiError.badRequest('That upload could not be found with the media provider', [
      { field: 'publicId', message: 'Unknown asset' },
    ]);
  }

  theater.images.push({ url: asset.url, publicId: asset.publicId, caption });
  await theater.save();

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.MEDIA_UPLOADED,
    resourceType: 'Theater',
    resourceId: theater._id,
    after: { kind: 'theater_image', publicId: asset.publicId },
    req,
  });

  return theater;
}

export async function removeTheaterImage(actor, theater, publicId, req) {
  const existing = theater.images.find((image) => image.publicId === publicId);
  if (!existing) throw ApiError.notFound('This theater has no such image');

  theater.images = theater.images.filter((image) => image.publicId !== publicId);
  await theater.save();

  // The record is already updated; failing to delete the remote copy leaves an
  // orphaned file, which is not worth failing the request over.
  try {
    await getMediaProvider().destroy(publicId);
  } catch (error) {
    logger.warn({ err: error, publicId }, 'Could not delete theater image asset');
  }

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.MEDIA_DELETED,
    resourceType: 'Theater',
    resourceId: theater._id,
    before: { kind: 'theater_image', publicId },
    req,
  });

  return theater;
}

/**
 * Only an active show runner may be assigned a venue. Assigning someone whose
 * operating rights are suspended would hand out gate-4 access that gate 3 then
 * silently refuses, which is confusing rather than secure.
 */
export async function assignManager(actor, theaterId, { userId, reason }, req) {
  const theater = await Theater.findById(theaterId);
  if (!theater) throw ApiError.notFound('Theater not found');

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  if (user.role !== ROLES.SHOW_RUNNER) {
    throw ApiError.badRequest(
      'Only an approved show runner can manage a theater',
      [{ field: 'userId', message: `This user is a ${user.role}` }],
    );
  }

  const profile = await ShowRunnerProfile.findOne({ userId: user._id });
  if (!profile || profile.status !== SHOW_RUNNER_STATUS.ACTIVE) {
    throw ApiError.badRequest('That show runner is not active', [
      { field: 'userId', message: `Profile is ${profile?.status ?? 'missing'}` },
    ]);
  }

  if (theater.isManagedBy(user._id)) {
    return { theater, unchanged: true };
  }

  theater.managers.push(user._id);
  await theater.save();

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.THEATER_MANAGER_ASSIGNED,
    resourceType: 'Theater',
    resourceId: theater._id,
    after: { managerId: String(user._id), email: user.email },
    reason,
    req,
  });

  return { theater, unchanged: false };
}

export async function removeManager(actor, theaterId, userId, reason, req) {
  const theater = await Theater.findById(theaterId);
  if (!theater) throw ApiError.notFound('Theater not found');

  if (!theater.isManagedBy(userId)) {
    throw ApiError.notFound('That user does not manage this theater');
  }

  theater.managers = theater.managers.filter((manager) => String(manager) !== String(userId));
  await theater.save();

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.THEATER_MANAGER_REMOVED,
    resourceType: 'Theater',
    resourceId: theater._id,
    before: { managerId: String(userId) },
    reason,
    req,
  });

  return theater;
}

export async function listTheaters(query, { user = null, publicOnly = false } = {}) {
  const { page, limit, skip } = resolvePagination(query);
  const filter = {};

  if (publicOnly) filter.status = THEATER_STATUS.ACTIVE;
  else if (query.status) filter.status = query.status;

  if (query.city) filter.city = query.city.toLowerCase();
  if (query.managerId) filter.managers = query.managerId;
  if (query.search) filter.$text = { $search: query.search };

  // A show runner's list is scoped to what they manage, whatever they ask for.
  if (user) {
    const ids = await managedTheaterIds(user);
    if (ids !== null) filter._id = { $in: ids };
  }

  const [items, total] = await Promise.all([
    Theater.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Theater.countDocuments(filter),
  ]);

  return paginated(
    items.map((theater) => (publicOnly ? theater.toPublicJSON() : theater)),
    { page, limit, total },
  );
}

export async function listCities() {
  const cities = await Theater.aggregate([
    { $match: { status: THEATER_STATUS.ACTIVE } },
    { $group: { _id: '$city', label: { $first: '$cityLabel' }, theaterCount: { $sum: 1 } } },
    { $sort: { label: 1 } },
  ]);

  return cities.map((city) => ({
    city: city._id,
    label: city.label,
    theaterCount: city.theaterCount,
  }));
}

// --- Screens ----------------------------------------------------------------

export async function createScreen(actor, theater, payload, req) {
  const existing = await Screen.findOne({ theaterId: theater._id, name: payload.name });
  if (existing) throw ApiError.conflict('This theater already has a screen with that name');

  const screen = await Screen.create({
    theaterId: theater._id,
    name: payload.name,
    formats: payload.formats,
  });

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.SCREEN_CREATED,
    resourceType: 'Screen',
    resourceId: screen._id,
    after: { theaterId: String(theater._id), name: screen.name },
    req,
  });

  return screen;
}

export async function listScreens(theaterId) {
  return Screen.find({ theaterId }).sort({ name: 1 });
}

/**
 * Deactivating a screen is refused while it still has upcoming published
 * shows: the shows would stay bookable against a screen the venue considers
 * out of service.
 */
export async function updateScreen(actor, screen, payload, req) {
  if (payload.isActive === false && screen.isActive) {
    const upcoming = await Show.countDocuments({
      screenId: screen._id,
      status: SHOW_STATUS.PUBLISHED,
      startAt: { $gt: new Date() },
    });
    if (upcoming > 0) {
      throw ApiError.conflict(
        `This screen has ${upcoming} upcoming published show(s). Cancel them first.`,
        ERROR_CODES.CONFLICT,
      );
    }
  }

  if (payload.name && payload.name !== screen.name) {
    const clash = await Screen.findOne({
      theaterId: screen.theaterId,
      name: payload.name,
      _id: { $ne: screen._id },
    });
    if (clash) throw ApiError.conflict('This theater already has a screen with that name');
  }

  const before = { name: screen.name, isActive: screen.isActive };
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) screen[key] = value;
  }
  await screen.save();

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.SCREEN_UPDATED,
    resourceType: 'Screen',
    resourceId: screen._id,
    before,
    after: { name: screen.name, isActive: screen.isActive },
    req,
  });

  return screen;
}

// --- Seat layouts -----------------------------------------------------------

/**
 * Layouts are versioned, never edited. A new version is created and optionally
 * made active; shows already scheduled keep pointing at the version they were
 * created with, so a seat on a sold ticket always means what it meant when it
 * was sold.
 */
export async function createLayout(actor, screen, payload, req) {
  return withTransaction(async (session) => {
    const latest = await SeatLayout.findOne({ screenId: screen._id })
      .sort({ version: -1 })
      .session(session ?? null);

    const version = (latest?.version ?? 0) + 1;
    const bookable = payload.seats.filter(
      (seat) => (seat.kind ?? SEAT_KINDS.SEAT) === SEAT_KINDS.SEAT && seat.isActive !== false,
    );

    if (bookable.length === 0) {
      throw ApiError.badRequest('A layout needs at least one bookable seat');
    }

    const [layout] = await SeatLayout.create(
      [
        {
          screenId: screen._id,
          theaterId: screen.theaterId,
          version,
          categories: payload.categories,
          seats: payload.seats,
          seatCount: bookable.length,
          rowCount: new Set(bookable.map((seat) => seat.row)).size,
          createdBy: actor._id,
        },
      ],
      withSession(session),
    );

    if (payload.activate) {
      if (latest) {
        await SeatLayout.updateOne(
          { _id: latest._id },
          { retiredAt: new Date() },
          withSession(session),
        );
      }
      screen.activeLayoutVersion = version;
      screen.capacity = bookable.length;
      await screen.save(withSession(session));
    }

    await recordAudit(
      {
        actor,
        action: AUDIT_ACTIONS.SEAT_LAYOUT_CREATED,
        resourceType: 'SeatLayout',
        resourceId: layout._id,
        after: {
          screenId: String(screen._id),
          version,
          seatCount: bookable.length,
          activated: Boolean(payload.activate),
        },
        req,
      },
      session,
    );

    return layout;
  });
}

export async function listLayouts(screenId) {
  return SeatLayout.find({ screenId }).sort({ version: -1 }).select('-seats');
}

export async function getLayout(screenId, version) {
  const layout = await SeatLayout.findOne({ screenId, version });
  if (!layout) throw ApiError.notFound('Seat layout not found');
  return layout;
}

export async function getActiveLayout(screen) {
  if (!screen.activeLayoutVersion) {
    throw ApiError.badRequest(
      'This screen has no seat layout yet',
      [{ field: 'screenId', message: 'Create a seat layout first' }],
      ERROR_CODES.LAYOUT_REQUIRED,
    );
  }
  return getLayout(screen._id, screen.activeLayoutVersion);
}

/**
 * Switching the active layout is refused while upcoming published shows use
 * the current one. Those shows pin the old version and keep working; what is
 * prevented is the venue believing new shows and old shows share a seat map.
 */
export async function activateLayout(actor, screen, version, req) {
  const layout = await SeatLayout.findOne({ screenId: screen._id, version });
  if (!layout) throw ApiError.notFound('Seat layout not found');

  if (screen.activeLayoutVersion === version) {
    return { layout, unchanged: true };
  }

  const upcoming = await Show.countDocuments({
    screenId: screen._id,
    status: SHOW_STATUS.PUBLISHED,
    startAt: { $gt: new Date() },
    layoutVersion: screen.activeLayoutVersion,
  });

  if (upcoming > 0) {
    throw ApiError.conflict(
      `${upcoming} upcoming published show(s) use the current layout. Cancel them before switching.`,
      ERROR_CODES.LAYOUT_IN_USE,
    );
  }

  screen.activeLayoutVersion = version;
  screen.capacity = layout.seatCount;
  await screen.save();

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.SEAT_LAYOUT_ACTIVATED,
    resourceType: 'SeatLayout',
    resourceId: layout._id,
    after: { screenId: String(screen._id), version },
    req,
  });

  return { layout, unchanged: false };
}
