import { ShowSeat } from '../../models/ShowSeat.js';
import { SeatHold } from '../../models/SeatHold.js';
import { SeatLayout } from '../../models/SeatLayout.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  HOLD_STATUS,
  SEAT_KINDS,
  SEAT_STATE,
} from '../../constants/index.js';
import { recordAudit } from '../../services/auditService.js';
import { withSession } from '../../utils/withTransaction.js';
import { logger } from '../../utils/logger.js';

/**
 * Creates one ShowSeat per bookable seat in the show's pinned layout version.
 *
 * Idempotent by construction: the unique index on (showId, seatId) means a
 * second run inserts nothing, so a retry after a partial failure is safe and a
 * concurrent double-publish cannot produce duplicate inventory.
 */
export async function generateInventory(show, { session = null, actor = null, req = null } = {}) {
  const layout = await SeatLayout.findOne({
    screenId: show.screenId,
    version: show.layoutVersion,
  }).session(session ?? null);

  if (!layout) {
    throw ApiError.notFound('Seat layout not found for this show', ERROR_CODES.INVENTORY_MISSING);
  }

  const priceByCategory = Object.fromEntries(
    show.pricing.map((item) => [item.category, item.basePaise]),
  );

  const bookable = layout.seats.filter(
    (seat) => seat.kind === SEAT_KINDS.SEAT && seat.isActive,
  );

  const documents = bookable.map((seat) => {
    const pricePaise = priceByCategory[seat.category];
    if (pricePaise === undefined) {
      // Scheduling already enforces full coverage; reaching here means the
      // show and its layout disagree, which must not become silent free seats.
      throw ApiError.badRequest(
        `This show has no price for seat category "${seat.category}"`,
        [{ field: 'pricing', message: `Missing price for ${seat.category}` }],
        ERROR_CODES.PRICING_INCOMPLETE,
      );
    }
    return {
      showId: show._id,
      seatId: seat.seatId,
      label: seat.label,
      category: seat.category,
      row: seat.row,
      number: seat.number,
      pricePaise,
      state: SEAT_STATE.AVAILABLE,
    };
  });

  let inserted = 0;
  try {
    // ordered:false so one duplicate does not abort the rest.
    const result = await ShowSeat.insertMany(documents, {
      ordered: false,
      ...withSession(session),
    });
    inserted = result.length;
  } catch (error) {
    if (error?.code === 11000 || error?.writeErrors) {
      inserted = error.result?.insertedCount ?? error.insertedDocs?.length ?? 0;
      logger.debug(
        { showId: String(show._id), inserted },
        'Inventory generation skipped seats that already existed',
      );
    } else {
      throw error;
    }
  }

  if (!show.inventoryGeneratedAt) {
    show.inventoryGeneratedAt = new Date();
    await show.save({ ...withSession(session) });
  }

  if (actor) {
    await recordAudit(
      {
        actor,
        action: AUDIT_ACTIONS.INVENTORY_GENERATED,
        resourceType: 'Show',
        resourceId: show._id,
        after: { seatCount: documents.length, inserted },
        req,
      },
      session,
    );
  }

  return { total: documents.length, inserted };
}

/**
 * The seat map a customer sees: the layout, with each seat's live state from
 * inventory. A hold whose expiry has passed reads as available, matching what
 * the acquisition filter would actually allow, so the map never shows a seat
 * as taken when it could in fact be claimed.
 */
export async function getSeatAvailability(show, { userId = null } = {}) {
  const [layout, seats, ownHold] = await Promise.all([
    SeatLayout.findOne({ screenId: show.screenId, version: show.layoutVersion }),
    ShowSeat.find({ showId: show._id }).select(
      'seatId state holdId holdExpiresAt pricePaise category label row number',
    ),
    // So the caller can tell its own held seats from someone else's without
    // learning anything about who holds the rest.
    userId
      ? SeatHold.findOne({
          showId: show._id,
          userId,
          status: HOLD_STATUS.ACTIVE,
          expiresAt: { $gt: new Date() },
        }).select('_id')
      : null,
  ]);

  if (!layout) throw ApiError.notFound('Seat layout not found for this show');
  const ownHoldId = ownHold ? String(ownHold._id) : null;

  const now = Date.now();
  const inventoryBySeatId = new Map(seats.map((seat) => [seat.seatId, seat]));

  const priceByCategory = Object.fromEntries(
    show.pricing.map((item) => [item.category, item.basePaise]),
  );

  let available = 0;
  const mapped = layout.seats.map((seat) => {
    const record = inventoryBySeatId.get(seat.seatId);
    const isBookableSeat = seat.kind === SEAT_KINDS.SEAT && seat.isActive;

    let state;
    if (!isBookableSeat) {
      state = 'unavailable';
    } else if (!record) {
      // Published shows always have inventory; a draft show has none yet.
      state = 'unavailable';
    } else if (record.state === SEAT_STATE.HELD && record.holdExpiresAt?.getTime() <= now) {
      state = SEAT_STATE.AVAILABLE;
    } else {
      state = record.state;
    }

    if (state === SEAT_STATE.AVAILABLE) available += 1;

    return {
      seatId: seat.seatId,
      row: seat.row,
      number: seat.number,
      label: seat.label,
      category: seat.category,
      x: seat.x,
      y: seat.y,
      kind: seat.kind,
      pricePaise: record?.pricePaise ?? priceByCategory[seat.category] ?? null,
      state,
      // Lets the client keep its own selection highlighted after a refresh
      // without exposing who holds anyone else's seats.
      heldByYou: Boolean(
        ownHoldId && record?.holdId && String(record.holdId) === ownHoldId && state === SEAT_STATE.HELD,
      ),
    };
  });

  return {
    showId: String(show._id),
    layoutVersion: layout.version,
    categories: layout.categories.map((category) => ({
      name: category.name,
      displayOrder: category.displayOrder,
      color: category.color ?? null,
      pricePaise: priceByCategory[category.name] ?? null,
    })),
    seats: mapped,
    summary: {
      total: mapped.filter((seat) => seat.kind === SEAT_KINDS.SEAT).length,
      available,
    },
  };
}

/**
 * Takes a seat out of sale, or puts it back. Only an available seat can be
 * blocked — blocking one that is held or sold would strand a customer who has
 * already paid, so that is refused rather than forced.
 */
export async function setSeatBlocked(actor, show, seatId, { blocked, reason }, req) {
  const filter = {
    showId: show._id,
    seatId,
    state: blocked ? SEAT_STATE.AVAILABLE : SEAT_STATE.BLOCKED,
  };

  const update = blocked
    ? { state: SEAT_STATE.BLOCKED, blockedReason: reason }
    : { state: SEAT_STATE.AVAILABLE, blockedReason: undefined };

  const seat = await ShowSeat.findOneAndUpdate(filter, update, { new: true });

  if (!seat) {
    const current = await ShowSeat.findOne({ showId: show._id, seatId }).select('state');
    if (!current) throw ApiError.notFound('That seat is not part of this show');
    throw ApiError.conflict(
      `Seat ${seatId} is ${current.state} and cannot be ${blocked ? 'blocked' : 'unblocked'}`,
      ERROR_CODES.SEATS_UNAVAILABLE,
    );
  }

  await recordAudit({
    actor,
    action: blocked ? AUDIT_ACTIONS.SEAT_BLOCKED : AUDIT_ACTIONS.SEAT_UNBLOCKED,
    resourceType: 'ShowSeat',
    resourceId: seat._id,
    after: { showId: String(show._id), seatId, state: seat.state },
    reason,
    req,
  });

  return seat;
}

/** Counts by state, for the show-runner's view of how a show is selling. */
export async function getInventorySummary(showId) {
  const counts = await ShowSeat.aggregate([
    { $match: { showId } },
    { $group: { _id: '$state', count: { $sum: 1 } } },
  ]);

  const summary = { available: 0, held: 0, booked: 0, blocked: 0, total: 0 };
  for (const entry of counts) {
    summary[entry._id] = entry.count;
    summary.total += entry.count;
  }
  return summary;
}

/** Used by the show detail endpoint to report "12 seats left". */
export async function countAvailable(showId) {
  const now = new Date();
  return ShowSeat.countDocuments({
    showId,
    $or: [
      { state: SEAT_STATE.AVAILABLE },
      { state: SEAT_STATE.HELD, holdExpiresAt: { $lt: now } },
    ],
  });
}
