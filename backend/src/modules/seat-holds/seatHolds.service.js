import { ShowSeat } from '../../models/ShowSeat.js';
import { SeatHold } from '../../models/SeatHold.js';
import { Show } from '../../models/Show.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  HOLD_STATUS,
  SEAT_STATE,
  SHOW_STATUS,
} from '../../constants/index.js';
import { recordAudit } from '../../services/auditService.js';
import { withTransaction, withSession } from '../../utils/withTransaction.js';
import { calculatePricing } from '../../services/pricingService.js';
import { getSettings } from '../../services/settingsService.js';
import { logger } from '../../utils/logger.js';

/**
 * The filter that decides whether a seat can be taken.
 *
 * Two branches. A seat that is plainly available, and a seat still marked held
 * whose hold has already lapsed. The second is what makes expiry self-healing:
 * a lapsed hold is reclaimed at the moment someone wants the seat, so
 * correctness never depends on the cleanup job having run.
 */
/**
 * Thrown to abort the acquisition transaction. Returning a value from the
 * callback would *commit* it, leaving a partial claim behind; only a throw
 * rolls the writes back. The human-readable conflict is built afterwards,
 * outside the transaction.
 */
class SeatConflictError extends Error {
  constructor() {
    super('Seats unavailable');
    this.name = 'SeatConflictError';
  }
}

function claimableFilter(showId, seatIds, now) {
  return {
    showId,
    seatId: { $in: seatIds },
    $or: [
      { state: SEAT_STATE.AVAILABLE },
      { state: SEAT_STATE.HELD, holdExpiresAt: { $lt: now } },
    ],
  };
}

async function loadBookableShow(showId) {
  const show = await Show.findById(showId);
  if (!show) throw ApiError.notFound('Show not found');

  if (show.status !== SHOW_STATUS.PUBLISHED) {
    throw ApiError.conflict('This show is not open for booking', ERROR_CODES.SHOW_NOT_BOOKABLE);
  }
  if (!show.isBookable) {
    const reason =
      show.startAt <= new Date() ? 'This show has already started' : 'Booking is not open yet';
    throw ApiError.conflict(reason, ERROR_CODES.SHOW_NOT_BOOKABLE);
  }

  return show;
}

/**
 * Takes seats for a customer.
 *
 * Everything runs inside one transaction, so a partial acquisition cannot
 * happen and no compensating release is needed — an abort rolls back every
 * seat the attempt touched. Transactions are mandatory here (`required: true`):
 * without them the guarantee this function exists to provide does not hold.
 */
export async function createHold(user, showId, { seatIds }, req) {
  const show = await loadBookableShow(showId);
  const settings = await getSettings();

  const maxSeats = settings.seatHold?.maxSeatsPerBooking ?? 10;
  if (seatIds.length > maxSeats) {
    throw ApiError.badRequest(
      `You can book at most ${maxSeats} seats at a time`,
      [{ field: 'seatIds', message: `Maximum ${maxSeats}` }],
      ERROR_CODES.HOLD_LIMIT_EXCEEDED,
    );
  }

  const unique = [...new Set(seatIds)];
  if (unique.length !== seatIds.length) {
    throw ApiError.badRequest('The same seat was listed twice');
  }

  // Every requested seat must belong to this show's inventory. Checked before
  // the transaction so an unknown seat id reads as a clear 400 rather than a
  // conflict.
  const inventory = await ShowSeat.find({ showId: show._id, seatId: { $in: unique } }).select(
    'seatId label category pricePaise',
  );
  if (inventory.length !== unique.length) {
    const known = new Set(inventory.map((seat) => seat.seatId));
    const missing = unique.filter((seatId) => !known.has(seatId));
    throw ApiError.badRequest(
      'Those seats are not part of this show',
      missing.map((seatId) => ({ field: 'seatIds', message: `Unknown seat "${seatId}"` })),
      ERROR_CODES.SEAT_NOT_IN_SHOW,
    );
  }

  const ttlMinutes = settings.seatHold?.ttlMinutes ?? 10;

  let result;
  try {
    result = await withTransaction(
      async (session) => {
          const now = new Date();
        const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
        const holdId = new SeatHold()._id;

        // One conditional write. Of two concurrent requests for the same seat,
        // exactly one changes the document; the other matches nothing.
        const claim = await ShowSeat.updateMany(
          claimableFilter(show._id, unique, now),
          {
            $set: {
              state: SEAT_STATE.HELD,
              holdId,
              holdExpiresAt: expiresAt,
              bookingId: null,
            },
          },
          withSession(session),
        );

        if (claim.modifiedCount !== unique.length) {
          // Abort: every seat this attempt touched returns to its prior state.
          throw new SeatConflictError();
        }

        const pricing = await calculatePricing({
          show,
          seats: inventory.map((seat) => ({
            seatId: seat.seatId,
            label: seat.label,
            category: seat.category,
          })),
          settings,
        });

        const [hold] = await SeatHold.create(
          [
            {
              _id: holdId,
              showId: show._id,
              userId: user._id,
              seatIds: unique,
              status: HOLD_STATUS.ACTIVE,
              expiresAt,
              pricingSnapshot: pricing,
            },
          ],
          withSession(session),
        );

        return { hold };
      },
      { required: true },
    );
  } catch (error) {
    if (error instanceof SeatConflictError) {
      // The transaction has rolled back; now work out what to tell the user.
      throw await describeConflict(show._id, unique);
    }
    throw error;
  }

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.SEATS_HELD,
    resourceType: 'SeatHold',
    resourceId: result.hold._id,
    after: { showId: String(show._id), seatIds: unique, expiresAt: result.hold.expiresAt },
    req,
  });

  return result.hold;
}

/**
 * Names the seats that caused the failure, so the customer is told which ones
 * to change rather than being asked to guess.
 */
async function describeConflict(showId, seatIds) {
  const now = new Date();
  const taken = await ShowSeat.find({
    showId,
    seatId: { $in: seatIds },
    $nor: [
      { state: SEAT_STATE.AVAILABLE },
      { state: SEAT_STATE.HELD, holdExpiresAt: { $lt: now } },
    ],
  }).select('seatId label state');

  return ApiError.conflict(
    'One or more selected seats are no longer available. Please choose different seats.',
    ERROR_CODES.SEATS_UNAVAILABLE,
    taken.map((seat) => ({
      field: 'seatIds',
      seatId: seat.seatId,
      message: `Seat ${seat.label} is ${seat.state === SEAT_STATE.BOOKED ? 'already booked' : 'taken'}`,
    })),
  );
}

export async function getHold(user, holdId) {
  const hold = await SeatHold.findOne({ _id: holdId, userId: user._id });
  if (!hold) throw ApiError.notFound('Hold not found', ERROR_CODES.HOLD_NOT_FOUND);
  return hold;
}

/**
 * A hold the customer can still pay against. Used by checkout, which must
 * refuse to proceed on anything else.
 */
export async function getLiveHold(user, holdId) {
  const hold = await getHold(user, holdId);

  if (hold.status !== HOLD_STATUS.ACTIVE) {
    throw ApiError.conflict(
      hold.status === HOLD_STATUS.CONVERTED
        ? 'This hold has already been used for a booking'
        : 'This hold is no longer active',
      ERROR_CODES.HOLD_EXPIRED,
    );
  }
  if (hold.expiresAt <= new Date()) {
    throw ApiError.conflict(
      'Your seats were released because the hold expired. Please select seats again.',
      ERROR_CODES.HOLD_EXPIRED,
    );
  }

  return hold;
}

/**
 * Gives the seats back early.
 *
 * The filter pins both the hold id and the held state, so this can never
 * release a seat that now belongs to a newer hold or to a confirmed booking.
 */
export async function releaseHold(user, holdId, req) {
  const hold = await SeatHold.findOne({ _id: holdId, userId: user._id });
  if (!hold) throw ApiError.notFound('Hold not found', ERROR_CODES.HOLD_NOT_FOUND);

  if (hold.status === HOLD_STATUS.CONVERTED) {
    throw ApiError.conflict(
      'This hold has already been used for a booking',
      ERROR_CODES.CONFLICT,
    );
  }
  if (hold.status !== HOLD_STATUS.ACTIVE) {
    return { hold, alreadyReleased: true };
  }

  await withTransaction(
    async (session) => {
      const updated = await SeatHold.findOneAndUpdate(
        { _id: hold._id, status: HOLD_STATUS.ACTIVE },
        { status: HOLD_STATUS.RELEASED, releasedAt: new Date() },
        { new: true, ...withSession(session) },
      );
      if (!updated) return;

      await ShowSeat.updateMany(
        { showId: hold.showId, holdId: hold._id, state: SEAT_STATE.HELD },
        {
          $set: { state: SEAT_STATE.AVAILABLE },
          $unset: { holdId: '', holdExpiresAt: '' },
        },
        withSession(session),
      );
    },
    { required: true },
  );

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.SEATS_RELEASED,
    resourceType: 'SeatHold',
    resourceId: hold._id,
    after: { showId: String(hold.showId), seatIds: hold.seatIds },
    req,
  });

  return { hold: await SeatHold.findById(hold._id), alreadyReleased: false };
}

/**
 * Releases holds whose time has run out.
 *
 * Safe to run on every instance at once and safe to run late: each release is
 * guarded by the hold's own id and the held state, so a delayed pass matches
 * nothing once those seats have moved on. That is why no distributed lock is
 * needed, and why this is a tidy-up rather than the mechanism inventory
 * correctness depends on.
 */
export async function expireHolds({ limit = 100 } = {}) {
  const now = new Date();
  const due = await SeatHold.find({
    status: HOLD_STATUS.ACTIVE,
    expiresAt: { $lte: now },
  })
    .select('_id showId seatIds')
    .limit(limit);

  let expired = 0;
  let seatsReleased = 0;

  for (const hold of due) {
    try {
      const released = await withTransaction(
        async (session) => {
          const claimed = await SeatHold.findOneAndUpdate(
            { _id: hold._id, status: HOLD_STATUS.ACTIVE, expiresAt: { $lte: new Date() } },
            { status: HOLD_STATUS.EXPIRED, releasedAt: new Date() },
            { new: true, ...withSession(session) },
          );
          // null means another pass, or a conversion to a booking, got here
          // first — distinct from claiming it and finding no seats to free.
          if (!claimed) return null;

          const result = await ShowSeat.updateMany(
            { showId: hold.showId, holdId: hold._id, state: SEAT_STATE.HELD },
            {
              $set: { state: SEAT_STATE.AVAILABLE },
              $unset: { holdId: '', holdExpiresAt: '' },
            },
            withSession(session),
          );
          return result.modifiedCount;
        },
        { required: true },
      );

      // Only count holds this pass actually claimed, so running on several
      // instances does not report the same hold expired several times.
      if (released !== null) {
        expired += 1;
        seatsReleased += released;
      }
    } catch (error) {
      // One bad hold must not stop the rest being cleaned up.
      logger.error({ err: error, holdId: String(hold._id) }, 'Failed to expire seat hold');
    }
  }

  if (expired > 0) {
    logger.info({ expired, seatsReleased }, 'Expired seat holds');
  }

  return { examined: due.length, expired, seatsReleased };
}

/**
 * Hands a hold's seats to a booking. Phase 5 calls this inside the same
 * transaction that confirms payment; the guarded filter means a hold that
 * expired a moment earlier cannot be converted behind a customer who has since
 * taken those seats.
 */
export async function convertHold(hold, bookingId, session) {
  const claimed = await SeatHold.findOneAndUpdate(
    { _id: hold._id, status: HOLD_STATUS.ACTIVE, expiresAt: { $gt: new Date() } },
    { status: HOLD_STATUS.CONVERTED, convertedAt: new Date(), bookingId },
    { new: true, ...withSession(session) },
  );

  if (!claimed) {
    throw ApiError.conflict(
      'Your seats were released because the hold expired. Please select seats again.',
      ERROR_CODES.HOLD_EXPIRED,
    );
  }

  const result = await ShowSeat.updateMany(
    { showId: hold.showId, holdId: hold._id, state: SEAT_STATE.HELD },
    { $set: { state: SEAT_STATE.BOOKED, bookingId }, $unset: { holdExpiresAt: '' } },
    withSession(session),
  );

  if (result.modifiedCount !== hold.seatIds.length) {
    // Refuse rather than issue a ticket for seats we do not actually hold.
    throw ApiError.conflict(
      'Those seats are no longer held. Please select seats again.',
      ERROR_CODES.SEATS_UNAVAILABLE,
    );
  }

  return claimed;
}

export async function listMyHolds(user) {
  return SeatHold.find({ userId: user._id, status: HOLD_STATUS.ACTIVE, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .limit(20);
}
