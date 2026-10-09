import crypto from 'node:crypto';
import { Booking } from '../../models/Booking.js';
import { Payment } from '../../models/Payment.js';
import { WebhookEvent } from '../../models/WebhookEvent.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  AUDIT_ACTIONS,
  BOOKING_STATUS,
  ERROR_CODES,
  PAYMENT_ATTEMPT_STATUS,
} from '../../constants/index.js';
import { recordAudit } from '../../services/auditService.js';
import { getPaymentProvider } from '../../services/payments/providers.js';
import { confirmBooking, markPaymentFailed, markUnfulfillable } from '../bookings/bookings.service.js';
import { logger } from '../../utils/logger.js';

/**
 * Creates a gateway order for a booking.
 *
 * The amount is read from the booking, which took it from the hold's price
 * snapshot, which the server computed. At no point does a client-supplied
 * number reach the gateway.
 *
 * Retries are idempotent: an attempt already open for this booking is returned
 * rather than a second order being created.
 */
export async function initiatePayment(user, bookingId, req) {
  const booking = await Booking.findOne({ _id: bookingId, userId: user._id });
  if (!booking) throw ApiError.notFound('Booking not found', ERROR_CODES.BOOKING_NOT_FOUND);

  if (booking.status === BOOKING_STATUS.CONFIRMED) {
    throw ApiError.conflict('This booking is already paid for', ERROR_CODES.BOOKING_NOT_PAYABLE);
  }
  if (
    ![BOOKING_STATUS.PENDING_PAYMENT, BOOKING_STATUS.PAYMENT_FAILED].includes(booking.status)
  ) {
    throw ApiError.conflict(
      `This booking is ${booking.status} and cannot be paid for`,
      ERROR_CODES.BOOKING_NOT_PAYABLE,
    );
  }

  // The seats must still be ours to sell.
  const { SeatHold } = await import('../../models/SeatHold.js');
  const hold = await SeatHold.findById(booking.holdId);
  if (!hold || hold.expiresAt <= new Date()) {
    throw ApiError.conflict(
      'Your seats were released because the hold expired. Please select seats again.',
      ERROR_CODES.HOLD_EXPIRED,
    );
  }

  const open = await Payment.findOne({
    bookingId: booking._id,
    status: { $in: [PAYMENT_ATTEMPT_STATUS.CREATED, PAYMENT_ATTEMPT_STATUS.AUTHORIZED] },
  });
  if (open) {
    return { payment: open, booking, reused: true, publicKey: getPaymentProvider().publicKey() };
  }

  const provider = getPaymentProvider();
  const order = await provider.createOrder({
    amountPaise: booking.amountPaise,
    currency: booking.currency,
    receipt: booking.reference,
    notes: { bookingId: String(booking._id), reference: booking.reference },
  });

  const payment = await Payment.create({
    bookingId: booking._id,
    userId: user._id,
    provider: provider.name,
    orderId: order.orderId,
    amountPaise: booking.amountPaise,
    currency: booking.currency,
    status: PAYMENT_ATTEMPT_STATUS.CREATED,
  });

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.PAYMENT_INITIATED,
    resourceType: 'Payment',
    resourceId: payment._id,
    after: { bookingId: String(booking._id), orderId: order.orderId, amountPaise: booking.amountPaise },
    req,
  });

  return { payment, booking, reused: false, publicKey: provider.publicKey() };
}

/**
 * The browser's callback, checked properly.
 *
 * The signature is verified on the server before anything is believed. A valid
 * signature is what confirms the booking — not the fact that the browser said
 * so.
 */
export async function verifyPayment(user, bookingId, { orderId, paymentId, signature }, req) {
  const booking = await Booking.findOne({ _id: bookingId, userId: user._id });
  if (!booking) throw ApiError.notFound('Booking not found', ERROR_CODES.BOOKING_NOT_FOUND);

  const payment = await Payment.findOne({ bookingId: booking._id, orderId });
  if (!payment) throw ApiError.notFound('No payment attempt matches that order');

  const provider = getPaymentProvider();
  const valid = provider.verifyPaymentSignature({ orderId, paymentId, signature });

  if (!valid) {
    await markPaymentFailed({ booking, payment, reason: 'Invalid payment signature', req });
    throw new ApiError(
      400,
      ERROR_CODES.SIGNATURE_INVALID,
      'We could not verify that payment. If money has left your account, it will be returned.',
    );
  }

  // The gateway is the authority on the amount, not the callback.
  const remote = await provider.fetchPayment(paymentId);
  if (remote && remote.amountPaise !== booking.amountPaise) {
    await markPaymentFailed({
      booking,
      payment,
      reason: `Amount mismatch: gateway ${remote.amountPaise}, expected ${booking.amountPaise}`,
      req,
    });
    throw new ApiError(
      400,
      ERROR_CODES.AMOUNT_MISMATCH,
      'The amount paid does not match this booking.',
    );
  }

  await Payment.updateOne(
    { _id: payment._id },
    {
      providerPaymentId: paymentId,
      signatureVerified: true,
      verifiedAt: new Date(),
      status: PAYMENT_ATTEMPT_STATUS.AUTHORIZED,
      method: remote?.method,
    },
  );

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.PAYMENT_VERIFIED,
    resourceType: 'Payment',
    resourceId: payment._id,
    after: { bookingId: String(booking._id), providerPaymentId: paymentId },
    req,
  });

  return settleVerifiedPayment({
    booking,
    payment: await Payment.findById(payment._id),
    via: 'verify',
    actor: user,
    req,
  });
}

/**
 * The one place a verified payment becomes an outcome, reached by both the
 * browser callback and the webhook.
 *
 * If the hold lapsed while the customer was paying, the booking is not
 * confirmed over whoever has the seats now — it becomes unfulfillable and the
 * money is queued for return.
 */
export async function settleVerifiedPayment({ booking, payment, via, actor = null, req = null }) {
  try {
    const { booking: confirmed, alreadyConfirmed } = await confirmBooking({
      booking,
      payment,
      via,
      actor,
      req,
    });
    return { booking: confirmed, outcome: alreadyConfirmed ? 'already_confirmed' : 'confirmed' };
  } catch (error) {
    const lostSeats =
      error?.code === ERROR_CODES.HOLD_EXPIRED || error?.code === ERROR_CODES.SEATS_UNAVAILABLE;

    if (!lostSeats) throw error;

    const updated = await markUnfulfillable({
      booking,
      payment,
      reason: 'Payment completed after the seat hold expired',
      req,
    });

    // Queue the money back. The refund job picks this up.
    const { createRefundForBooking } = await import('../refunds/refunds.service.js');
    await createRefundForBooking({
      booking: updated,
      payment,
      amountPaise: payment.amountPaise,
      reason: 'unfulfillable',
      notes: 'Seats were released before payment completed',
    });

    return { booking: updated, outcome: 'unfulfillable' };
  }
}

/**
 * Webhook processing.
 *
 * Three things make this safe against a gateway that retries, reorders or
 * duplicates deliveries: the signature is checked against the raw body, the
 * event id is stored under a unique index before any work happens, and the
 * outcome converges on settleVerifiedPayment, which is idempotent.
 */
export async function handleWebhook({ rawBody, signature, provider: providerName }) {
  const provider = getPaymentProvider();

  if (!provider.verifyWebhookSignature({ rawBody, signature })) {
    logger.warn({ provider: providerName }, 'Rejected webhook with an invalid signature');
    throw new ApiError(400, ERROR_CODES.SIGNATURE_INVALID, 'Invalid webhook signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw ApiError.badRequest('Webhook body is not valid JSON');
  }

  const eventId =
    event.id ??
    event.payload?.payment?.entity?.id ??
    crypto.createHash('sha256').update(rawBody).digest('hex');
  const eventType = event.event ?? 'unknown';
  const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');

  // Wins or loses the race here, before anything is acted on.
  let record;
  try {
    record = await WebhookEvent.create({
      provider: provider.name,
      eventId,
      eventType,
      payloadHash,
      payload: event,
    });
  } catch (error) {
    if (error?.code === 11000) {
      logger.debug({ eventId, eventType }, 'Duplicate webhook ignored');
      return { duplicate: true, eventId, outcome: 'duplicate' };
    }
    throw error;
  }

  try {
    const outcome = await processWebhookEvent(event, eventType, record);
    await WebhookEvent.updateOne(
      { _id: record._id },
      { status: outcome.status, processedAt: new Date(), bookingId: outcome.bookingId },
    );
    return { duplicate: false, eventId, outcome: outcome.outcome };
  } catch (error) {
    await WebhookEvent.updateOne(
      { _id: record._id },
      { status: 'failed', error: error.message?.slice(0, 1000) },
    );
    throw error;
  }
}

async function processWebhookEvent(event, eventType, record) {
  const entity = event.payload?.payment?.entity;
  if (!entity) {
    return { status: 'ignored', outcome: 'no_payment_entity', bookingId: null };
  }

  const orderId = entity.order_id;
  const payment = await Payment.findOne({ orderId });
  if (!payment) {
    logger.warn({ orderId, eventType }, 'Webhook referenced an unknown order');
    return { status: 'ignored', outcome: 'unknown_order', bookingId: null };
  }

  const booking = await Booking.findById(payment.bookingId);
  if (!booking) {
    return { status: 'ignored', outcome: 'unknown_booking', bookingId: null };
  }

  await WebhookEvent.updateOne({ _id: record._id }, { paymentId: payment._id });

  if (eventType === 'payment.failed') {
    await markPaymentFailed({
      booking,
      payment,
      reason: entity.error_description ?? 'Payment failed at the gateway',
    });
    return { status: 'processed', outcome: 'payment_failed', bookingId: booking._id };
  }

  if (eventType === 'payment.captured' || eventType === 'payment.authorized') {
    if (entity.amount !== booking.amountPaise) {
      await markPaymentFailed({
        booking,
        payment,
        reason: `Amount mismatch: webhook ${entity.amount}, expected ${booking.amountPaise}`,
      });
      return { status: 'processed', outcome: 'amount_mismatch', bookingId: booking._id };
    }

    await Payment.updateOne(
      { _id: payment._id },
      {
        providerPaymentId: entity.id,
        signatureVerified: true,
        verifiedAt: payment.verifiedAt ?? new Date(),
        method: entity.method,
        status:
          payment.status === PAYMENT_ATTEMPT_STATUS.CAPTURED
            ? PAYMENT_ATTEMPT_STATUS.CAPTURED
            : PAYMENT_ATTEMPT_STATUS.AUTHORIZED,
      },
    );

    const result = await settleVerifiedPayment({
      booking,
      payment: await Payment.findById(payment._id),
      via: 'webhook',
    });

    return { status: 'processed', outcome: result.outcome, bookingId: booking._id };
  }

  return { status: 'ignored', outcome: `unhandled_${eventType}`, bookingId: booking._id };
}

export async function listPaymentsForBooking(user, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, userId: user._id }).select('_id');
  if (!booking) throw ApiError.notFound('Booking not found', ERROR_CODES.BOOKING_NOT_FOUND);

  const payments = await Payment.find({ bookingId: booking._id }).sort({ createdAt: -1 });
  return payments.map((payment) => payment.toPublicJSON());
}
