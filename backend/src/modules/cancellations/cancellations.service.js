import { Booking } from '../../models/Booking.js';
import { Cancellation } from '../../models/Cancellation.js';
import { Payment } from '../../models/Payment.js';
import { ShowSeat } from '../../models/ShowSeat.js';
import { Show } from '../../models/Show.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  AUDIT_ACTIONS,
  BOOKING_STATUS,
  CANCELLATION_STATUS,
  ERROR_CODES,
  HOLD_STATUS,
  NOTIFICATION_TYPES,
  PAYMENT_STATUS,
  REFUND_STATUS,
  SEAT_STATE,
} from '../../constants/index.js';
import { Refund } from '../../models/Refund.js';
import { SeatHold } from '../../models/SeatHold.js';
import { User } from '../../models/User.js';
import { enqueueNotification } from '../../services/notifications/notificationService.js';
import { recordAudit } from '../../services/auditService.js';
import { withTransaction, withSession } from '../../utils/withTransaction.js';
import { evaluateCancellation } from '../../services/cancellationPolicy.js';
import { createRefundForBooking } from '../refunds/refunds.service.js';
import { assertTransition } from '../bookings/bookings.service.js';

/** A quote, so the customer sees what they would get back before committing. */
export async function quoteCancellation(user, bookingId, seatIds = null) {
  const booking = await Booking.findOne({ _id: bookingId, userId: user._id });
  if (!booking) throw ApiError.notFound('Booking not found', ERROR_CODES.BOOKING_NOT_FOUND);

  if (booking.status !== BOOKING_STATUS.CONFIRMED) {
    return { eligible: false, reason: `This booking is ${booking.status}` };
  }

  return evaluateCancellation({ booking, seatIds });
}

/**
 * Cancels a booking, or some of its seats.
 *
 * Seats go back to the pool and the entitlement is settled here, in one
 * transaction. The money is only *recorded* as owed; it moves afterwards, so a
 * gateway failure cannot undo a cancellation the customer has been told about.
 */
export async function cancelBooking(user, bookingId, { seatIds = null, reason }, req) {
  const booking = await Booking.findOne({ _id: bookingId, userId: user._id });
  if (!booking) throw ApiError.notFound('Booking not found', ERROR_CODES.BOOKING_NOT_FOUND);

  if (booking.status !== BOOKING_STATUS.CONFIRMED) {
    throw ApiError.conflict(
      `This booking is ${booking.status} and cannot be cancelled`,
      ERROR_CODES.CANCELLATION_NOT_ELIGIBLE,
    );
  }

  const decision = await evaluateCancellation({ booking, seatIds });
  if (!decision.eligible) {
    throw ApiError.conflict(decision.reason, ERROR_CODES.CANCELLATION_NOT_ELIGIBLE);
  }

  const payment = await Payment.findOne({
    bookingId: booking._id,
    signatureVerified: true,
  }).sort({ createdAt: -1 });

  const result = await withTransaction(
    async (session) => {
      const now = new Date();

      const cancellation = await Cancellation.create(
        [
          {
            bookingId: booking._id,
            requestedBy: user._id,
            seatIds: decision.seatIds,
            isPartial: !decision.isWholeBooking,
            status: CANCELLATION_STATUS.COMPLETED,
            policyApplied: decision.policyApplied,
            cancelledSeatsValuePaise: decision.seatsValuePaise,
            refundablePaise: decision.refundablePaise,
            reason,
            decidedAt: now,
          },
        ],
        withSession(session),
      );

      // Seats return to the pool for this show.
      const released = await ShowSeat.updateMany(
        {
          showId: booking.showId,
          seatId: { $in: decision.seatIds },
          bookingId: booking._id,
          state: SEAT_STATE.BOOKED,
        },
        {
          $set: { state: SEAT_STATE.AVAILABLE },
          $unset: { bookingId: '', holdId: '', holdExpiresAt: '' },
        },
        withSession(session),
      );

      // Mark the cancelled seats on the booking itself, so a partial
      // cancellation leaves a ticket that still shows what remains valid.
      const updatedSeats = booking.seats.map((seat) =>
        decision.seatIds.includes(seat.seatId) && !seat.cancelledAt
          ? { ...seat.toObject(), cancelledAt: now }
          : seat.toObject(),
      );

      const nextStatus = decision.isWholeBooking
        ? BOOKING_STATUS.CANCELLED
        : BOOKING_STATUS.CONFIRMED;
      assertTransition(booking.status, nextStatus);

      const update = {
        seats: updatedSeats,
        paymentStatus:
          decision.refundablePaise > 0 ? PAYMENT_STATUS.REFUND_PENDING : booking.paymentStatus,
      };
      if (decision.isWholeBooking) {
        update.status = BOOKING_STATUS.CANCELLED;
        update.cancelledAt = now;
        update.cancellationReason = reason;
        // A cancelled booking must not pass at the gate, by QR or by code.
        update.ticketToken = undefined;
        update.entryCode = undefined;
      }

      const updatedBooking = await Booking.findOneAndUpdate(
        { _id: booking._id, status: BOOKING_STATUS.CONFIRMED },
        decision.isWholeBooking
          ? { ...update, $unset: { ticketToken: '', entryCode: '' } }
          : update,
        { new: true, ...withSession(session) },
      );

      if (!updatedBooking) {
        throw ApiError.conflict(
          'This booking changed while being cancelled. Try again.',
          ERROR_CODES.CONFLICT,
        );
      }

      await Show.updateOne(
        { _id: booking.showId },
        { $inc: { bookedSeatCount: -released.modifiedCount } },
        withSession(session),
      );

      const refund = await createRefundForBooking(
        {
          booking: updatedBooking,
          payment,
          amountPaise: decision.refundablePaise,
          reason: 'cancellation',
          cancellationId: cancellation[0]._id,
          notes: decision.policyApplied.label,
        },
        session,
      );

      if (refund) {
        await Cancellation.updateOne(
          { _id: cancellation[0]._id },
          { refundId: refund._id },
          withSession(session),
        );
      }

      await recordAudit(
        {
          actor: user,
          action: AUDIT_ACTIONS.CANCELLATION_COMPLETED,
          resourceType: 'Booking',
          resourceId: booking._id,
          before: { status: booking.status, seats: booking.seats.length },
          after: {
            status: updatedBooking.status,
            cancelledSeats: decision.seatIds,
            refundablePaise: decision.refundablePaise,
            policy: decision.policyApplied.label,
          },
          reason,
          req,
        },
        session,
      );

      return { booking: updatedBooking, cancellation: cancellation[0], refund };
    },
    { required: true },
  );

  /**
   * The money moves after the transaction has committed, so a gateway problem
   * cannot reverse a cancellation the customer has already been shown.
   *
   * Awaited rather than fired and forgotten: the response then states the real
   * refund status instead of a guess, and a failure here leaves the refund
   * `pending` for the reconciliation job to retry.
   */
  if (result.refund) {
    const { processRefund } = await import('../refunds/refunds.service.js');
    try {
      await processRefund(result.refund._id);
    } catch {
      // Already logged and recorded on the refund; the job will retry.
    }
    result.refund = await (await import('../../models/Refund.js')).Refund.findById(
      result.refund._id,
    );
  }

  return result;
}

export async function listCancellations(user, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, userId: user._id }).select('_id');
  if (!booking) throw ApiError.notFound('Booking not found', ERROR_CODES.BOOKING_NOT_FOUND);
  return Cancellation.find({ bookingId: booking._id }).sort({ createdAt: -1 });
}

/**
 * Everything that has to happen to a show's customers when the venue cancels
 * the show. Runs inside the caller's transaction, so the show is never marked
 * cancelled while its customers are left holding confirmed bookings.
 *
 *   - Every confirmed booking is cancelled and refunded in full — whatever is
 *     left after any earlier partial cancellation, fees included, because the
 *     customer did nothing wrong. Its QR token and entry code are removed, so
 *     neither passes at the gate.
 *   - Unpaid bookings can never be completed now, so they expire. A payment
 *     that lands for one of them afterwards is refunded by the payment
 *     settlement rather than confirmed.
 *   - Active seat holds are released.
 *
 * The refunds are created pending; the reconciliation job sends them to the
 * gateway, exactly as for any other refund.
 */
export async function cancelBookingsForShow(actor, show, reason, req, session = undefined) {
  const now = new Date();
  const confirmed = await Booking.find({
    showId: show._id,
    status: BOOKING_STATUS.CONFIRMED,
  }).session(session ?? null);

  let cancelledBookings = 0;
  let refundsCreated = 0;
  let refundPaise = 0;

  for (const booking of confirmed) {
    // What has already gone back through earlier partial cancellations.
    const [already] = await Refund.aggregate([
      { $match: { bookingId: booking._id, status: { $ne: REFUND_STATUS.FAILED } } },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]).session(session ?? null);
    const owed = Math.max(0, booking.amountPaise - (already?.total ?? 0));

    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: BOOKING_STATUS.CONFIRMED },
      {
        status: BOOKING_STATUS.CANCELLED,
        cancelledAt: now,
        cancellationReason: `Show cancelled by the venue: ${reason}`,
        ...(owed > 0 ? { paymentStatus: PAYMENT_STATUS.REFUND_PENDING } : {}),
        $unset: { ticketToken: '', entryCode: '' },
      },
      { new: true, ...withSession(session) },
    );
    if (!updated) continue;
    cancelledBookings += 1;

    const refund = await createRefundForBooking(
      {
        booking: updated,
        amountPaise: owed,
        reason: 'show_cancelled',
        notes: `Show cancelled: ${reason}`,
      },
      session,
    );
    if (refund) {
      refundsCreated += 1;
      refundPaise += owed;
    }

    await recordAudit(
      {
        actor,
        action: AUDIT_ACTIONS.CANCELLATION_COMPLETED,
        resourceType: 'Booking',
        resourceId: updated._id,
        before: { status: BOOKING_STATUS.CONFIRMED },
        after: { status: BOOKING_STATUS.CANCELLED, refundPaise: owed, cause: 'show_cancelled' },
        reason,
        req,
      },
      session,
    );

    const customer = await User.findById(updated.userId).select('email').session(session ?? null);
    await enqueueNotification(
      {
        userId: updated.userId,
        type: NOTIFICATION_TYPES.BOOKING_CANCELLED,
        to: customer?.email,
        data: { reference: updated.reference, refundPaise: owed },
      },
      session,
    );
  }

  const unpaid = await Booking.updateMany(
    {
      showId: show._id,
      status: { $in: [BOOKING_STATUS.PENDING_PAYMENT, BOOKING_STATUS.PAYMENT_FAILED] },
    },
    { status: BOOKING_STATUS.EXPIRED, expiredAt: now },
    withSession(session),
  );

  await SeatHold.updateMany(
    { showId: show._id, status: HOLD_STATUS.ACTIVE },
    { status: HOLD_STATUS.RELEASED, releasedAt: now },
    withSession(session),
  );

  return {
    cancelledBookings,
    refundsCreated,
    refundPaise,
    expiredUnpaidBookings: unpaid.modifiedCount ?? 0,
  };
}
