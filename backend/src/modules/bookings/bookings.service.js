import crypto from 'node:crypto';
import { Booking } from '../../models/Booking.js';
import { Payment } from '../../models/Payment.js';
import { Show } from '../../models/Show.js';
import { Movie } from '../../models/Movie.js';
import { Theater } from '../../models/Theater.js';
import { Screen } from '../../models/Screen.js';
import { ShowSeat } from '../../models/ShowSeat.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  AUDIT_ACTIONS,
  BOOKING_STATUS,
  BOOKING_TRANSITIONS,
  ERROR_CODES,
  NOTIFICATION_TYPES,
  PAYMENT_ATTEMPT_STATUS,
  PAYMENT_STATUS,
} from '../../constants/index.js';
import { recordAudit } from '../../services/auditService.js';
import { enqueueNotification } from '../../services/notifications/notificationService.js';
import { withTransaction, withSession } from '../../utils/withTransaction.js';
import { resolvePagination, paginated } from '../../utils/pagination.js';
import { getLiveHold, convertHold } from '../seat-holds/seatHolds.service.js';
import { createTicketToken, renderTicketQr } from '../../services/ticketService.js';
import { logger } from '../../utils/logger.js';

/**
 * Refuses a transition the state machine does not allow. This is what stops a
 * late webhook reopening an expired booking, or a confirmed one sliding back
 * to pending.
 */
export function assertTransition(from, to) {
  const allowed = BOOKING_TRANSITIONS[from] ?? [];
  if (from === to) return;
  if (!allowed.includes(to)) {
    throw ApiError.conflict(
      `A booking cannot go from ${from} to ${to}`,
      ERROR_CODES.INVALID_TRANSITION,
    );
  }
}

/** Short, non-sequential, easy to read aloud. */
function generateReference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return `CR${code}`;
}

/**
 * Opens a booking against a live hold.
 *
 * The amount comes from the hold's own price snapshot, taken when the seats
 * were claimed. Nothing the client sends influences it.
 */
export async function createBooking(user, { holdId }, req) {
  const hold = await getLiveHold(user, holdId);

  // One booking per hold: a second attempt returns the first.
  const existing = await Booking.findOne({
    holdId: hold._id,
    status: { $nin: [BOOKING_STATUS.EXPIRED] },
  });
  if (existing) return { booking: existing, reused: true };

  const show = await Show.findById(hold.showId);
  if (!show) throw ApiError.notFound('Show not found');

  const [movie, theater, screen, seats] = await Promise.all([
    Movie.findById(show.movieId).select('title slug poster certification'),
    Theater.findById(show.theaterId).select('name addressLine1 addressLine2 cityLabel'),
    Screen.findById(show.screenId).select('name'),
    ShowSeat.find({ showId: show._id, seatId: { $in: hold.seatIds } }).select(
      'seatId label row number category pricePaise',
    ),
  ]);

  const booking = await Booking.create({
    reference: generateReference(),
    userId: user._id,
    showId: show._id,
    holdId: hold._id,
    snapshot: {
      movieTitle: movie.title,
      movieSlug: movie.slug,
      posterUrl: movie.poster?.url,
      certification: movie.certification,
      theaterName: theater.name,
      theaterAddress: [theater.addressLine1, theater.addressLine2].filter(Boolean).join(', '),
      city: theater.cityLabel,
      screenName: screen.name,
      language: show.language,
      format: show.format,
      startAt: show.startAt,
      endAt: show.endAt,
      timezone: show.timezone,
    },
    seats: seats.map((seat) => ({
      seatId: seat.seatId,
      label: seat.label,
      row: seat.row,
      number: seat.number,
      category: seat.category,
      pricePaise: seat.pricePaise,
    })),
    layoutVersion: show.layoutVersion,
    pricing: hold.pricingSnapshot,
    amountPaise: hold.pricingSnapshot.totalPaise,
    currency: hold.pricingSnapshot.currency ?? 'INR',
    status: BOOKING_STATUS.PENDING_PAYMENT,
    paymentStatus: PAYMENT_STATUS.PENDING,
  });

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.BOOKING_CREATED,
    resourceType: 'Booking',
    resourceId: booking._id,
    after: { reference: booking.reference, amountPaise: booking.amountPaise },
    req,
  });

  return { booking, reused: false };
}

/**
 * Turns a verified payment into a ticket.
 *
 * Everything happens in one transaction: the hold converts, the seats become
 * booked, the payment is marked captured and the booking is confirmed. If the
 * hold lapsed in the meantime, convertHold throws and nothing is written —
 * the caller then handles it as an unfulfillable payment rather than issuing a
 * ticket for seats someone else now owns.
 *
 * Both the browser verification call and the webhook land here, so a duplicate
 * finds the booking already confirmed and does nothing.
 */
export async function confirmBooking({ booking, payment, via, actor = null, req = null }) {
  if (booking.status === BOOKING_STATUS.CONFIRMED) {
    return { booking, alreadyConfirmed: true };
  }

  assertTransition(booking.status, BOOKING_STATUS.CONFIRMED);

  const hold = await (await import('../../models/SeatHold.js')).SeatHold.findById(booking.holdId);
  if (!hold) throw ApiError.notFound('The hold for this booking no longer exists');

  const confirmed = await withTransaction(
    async (session) => {
      // Claims the seats permanently. Throws if the hold has lapsed.
      await convertHold(hold, booking._id, session);

      const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, status: { $ne: BOOKING_STATUS.CONFIRMED } },
        {
          status: BOOKING_STATUS.CONFIRMED,
          paymentStatus: PAYMENT_STATUS.PAID,
          confirmedAt: new Date(),
          ticketToken: createTicketToken(String(booking._id)),
        },
        { new: true, ...withSession(session) },
      );

      // Another path confirmed it between our check and this write.
      if (!updated) return null;

      await Payment.updateOne(
        { _id: payment._id },
        {
          status: PAYMENT_ATTEMPT_STATUS.CAPTURED,
          capturedAt: new Date(),
          confirmedVia: via,
        },
        withSession(session),
      );

      await Show.updateOne(
        { _id: booking.showId },
        { $inc: { bookedSeatCount: updated.seats.length } },
        withSession(session),
      );

      await recordAudit(
        {
          actor: actor ?? { _id: booking.userId },
          action: AUDIT_ACTIONS.BOOKING_CONFIRMED,
          resourceType: 'Booking',
          resourceId: booking._id,
          after: { reference: updated.reference, via, amountPaise: updated.amountPaise },
          req,
        },
        session,
      );

      return updated;
    },
    { required: true },
  );

  if (!confirmed) {
    return { booking: await Booking.findById(booking._id), alreadyConfirmed: true };
  }

  await enqueueNotification({
    userId: confirmed.userId,
    type: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
    to: (await (await import('../../models/User.js')).User.findById(confirmed.userId))?.email,
    data: {
      reference: confirmed.reference,
      movieTitle: confirmed.snapshot.movieTitle,
      theaterName: confirmed.snapshot.theaterName,
      startAt: confirmed.snapshot.startAt,
      seats: confirmed.seats.map((seat) => seat.label).join(', '),
    },
  });

  return { booking: confirmed, alreadyConfirmed: false };
}

/**
 * Payment arrived, but the seats are gone — the hold lapsed and someone else
 * took them. The booking is never confirmed over that customer; the money is
 * marked for return instead.
 */
export async function markUnfulfillable({ booking, payment, reason, req = null }) {
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: { $nin: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED] } },
    {
      status: BOOKING_STATUS.UNFULFILLABLE,
      paymentStatus: PAYMENT_STATUS.REFUND_PENDING,
      unfulfillableReason: reason,
    },
    { new: true },
  );

  if (!updated) return Booking.findById(booking._id);

  await recordAudit({
    actor: { _id: booking.userId },
    action: AUDIT_ACTIONS.BOOKING_UNFULFILLABLE,
    resourceType: 'Booking',
    resourceId: booking._id,
    after: { reason, paymentId: payment ? String(payment._id) : null },
    req,
  });

  logger.warn(
    { bookingId: String(booking._id), reference: updated.reference, reason },
    'Booking cannot be fulfilled; refund owed',
  );

  return updated;
}

export async function markPaymentFailed({ booking, payment, reason, req = null }) {
  if (booking.status === BOOKING_STATUS.CONFIRMED) return booking;

  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: BOOKING_STATUS.PENDING_PAYMENT },
    { status: BOOKING_STATUS.PAYMENT_FAILED, paymentStatus: PAYMENT_STATUS.FAILED },
    { new: true },
  );

  if (payment) {
    await Payment.updateOne(
      { _id: payment._id },
      {
        status: PAYMENT_ATTEMPT_STATUS.FAILED,
        failedAt: new Date(),
        failureReason: reason,
      },
    );
  }

  await recordAudit({
    actor: { _id: booking.userId },
    action: AUDIT_ACTIONS.PAYMENT_FAILED,
    resourceType: 'Booking',
    resourceId: booking._id,
    after: { reason },
    req,
  });

  return updated ?? booking;
}

// --- Reading ----------------------------------------------------------------

export async function getOwnBooking(user, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, userId: user._id });
  if (!booking) throw ApiError.notFound('Booking not found', ERROR_CODES.BOOKING_NOT_FOUND);
  return booking;
}

export async function listOwnBookings(user, query) {
  const { page, limit, skip } = resolvePagination(query);
  const filter = { userId: user._id };

  const now = new Date();
  if (query.scope === 'upcoming') {
    /**
     * Includes bookings that have not been paid for yet. A customer who closed
     * the payment window needs to find that booking again to finish it, and
     * hiding it until it is confirmed is how people lose their seats.
     */
    filter.status = {
      $in: [
        BOOKING_STATUS.CONFIRMED,
        BOOKING_STATUS.PENDING_PAYMENT,
        BOOKING_STATUS.PAYMENT_FAILED,
      ],
    };
    filter['snapshot.startAt'] = { $gt: now };
  } else if (query.scope === 'past') {
    filter.status = BOOKING_STATUS.CONFIRMED;
    filter['snapshot.startAt'] = { $lte: now };
  } else if (query.status) {
    filter.status = query.status;
  }

  const [items, total] = await Promise.all([
    Booking.find(filter).sort({ 'snapshot.startAt': -1 }).skip(skip).limit(limit),
    Booking.countDocuments(filter),
  ]);

  return paginated(
    items.map((booking) => booking.toPublicJSON()),
    { page, limit, total },
  );
}

/**
 * The ticket. Only ever produced for a confirmed booking — a pending or failed
 * one must not yield something that looks valid at a gate.
 */
export async function getTicket(user, bookingId) {
  const booking = await getOwnBooking(user, bookingId);

  if (booking.status !== BOOKING_STATUS.CONFIRMED) {
    throw ApiError.conflict(
      `This booking is ${booking.status}; no ticket has been issued`,
      ERROR_CODES.PAYMENT_NOT_CONFIRMED,
    );
  }
  if (!booking.ticketToken) {
    throw ApiError.conflict('This booking has no ticket token', ERROR_CODES.TICKET_INVALID);
  }

  return {
    booking: booking.toPublicJSON(),
    ticket: {
      token: booking.ticketToken,
      qrDataUrl: await renderTicketQr(booking.ticketToken),
      admittedAt: booking.admittedAt ?? null,
    },
  };
}
