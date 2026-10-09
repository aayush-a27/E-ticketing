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
  PAYMENT_STATUS,
  SEAT_STATE,
} from '../../constants/index.js';
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
        // A cancelled booking must not pass at the gate.
        update.ticketToken = undefined;
      }

      const updatedBooking = await Booking.findOneAndUpdate(
        { _id: booking._id, status: BOOKING_STATUS.CONFIRMED },
        decision.isWholeBooking ? { ...update, $unset: { ticketToken: '' } } : update,
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
