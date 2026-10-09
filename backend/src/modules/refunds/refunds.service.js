import { Refund } from '../../models/Refund.js';
import { Booking } from '../../models/Booking.js';
import { Payment } from '../../models/Payment.js';
import {
  AUDIT_ACTIONS,
  NOTIFICATION_TYPES,
  PAYMENT_STATUS,
  REFUND_STATUS,
} from '../../constants/index.js';
import { recordAudit } from '../../services/auditService.js';
import { enqueueNotification } from '../../services/notifications/notificationService.js';
import { getPaymentProvider } from '../../services/payments/providers.js';
import { withSession } from '../../utils/withTransaction.js';
import { logger } from '../../utils/logger.js';
import { User } from '../../models/User.js';

/**
 * Records that money is owed. Deliberately does not call the gateway: the
 * record is created inside the caller's transaction, and the money moves
 * afterwards, so a gateway timeout can never roll back a cancellation.
 */
export async function createRefundForBooking(
  { booking, payment, amountPaise, reason, cancellationId = null, notes = null },
  session = null,
) {
  if (amountPaise <= 0) return null;

  const resolvedPayment =
    payment ?? (await Payment.findOne({ bookingId: booking._id, signatureVerified: true }));

  if (!resolvedPayment) {
    logger.warn(
      { bookingId: String(booking._id) },
      'Refund owed but no verified payment exists; needs manual reconciliation',
    );
    return null;
  }

  const [refund] = await Refund.create(
    [
      {
        bookingId: booking._id,
        paymentId: resolvedPayment._id,
        cancellationId,
        amountPaise,
        currency: booking.currency,
        provider: resolvedPayment.provider,
        status: REFUND_STATUS.PENDING,
        reason,
        notes,
      },
    ],
    withSession(session),
  );

  await recordAudit(
    {
      actor: { _id: booking.userId },
      action: AUDIT_ACTIONS.REFUND_INITIATED,
      resourceType: 'Refund',
      resourceId: refund._id,
      after: { bookingId: String(booking._id), amountPaise, reason },
    },
    session,
  );

  return refund;
}

/**
 * Sends one pending refund to the gateway.
 *
 * The status moves to `processing` under a conditional update first, so two
 * workers cannot both submit the same refund. `providerRefundId` is uniquely
 * indexed as a second line of defence.
 */
export async function processRefund(refundId) {
  const claimed = await Refund.findOneAndUpdate(
    { _id: refundId, status: REFUND_STATUS.PENDING },
    { status: REFUND_STATUS.PROCESSING, $inc: { attempts: 1 } },
    { new: true },
  );
  if (!claimed) return { skipped: true };

  const payment = await Payment.findById(claimed.paymentId);
  if (!payment?.providerPaymentId) {
    await Refund.updateOne(
      { _id: claimed._id },
      {
        status: REFUND_STATUS.FAILED,
        failedAt: new Date(),
        failureReason: 'No gateway payment id to refund against',
      },
    );
    return { skipped: false, failed: true };
  }

  try {
    const provider = getPaymentProvider();
    const result = await provider.refund({
      paymentId: payment.providerPaymentId,
      amountPaise: claimed.amountPaise,
      notes: { bookingId: String(claimed.bookingId), reason: claimed.reason },
    });

    await Refund.updateOne(
      { _id: claimed._id },
      {
        status: REFUND_STATUS.COMPLETED,
        providerRefundId: result.refundId,
        processedAt: new Date(),
      },
    );

    await Payment.updateOne(
      { _id: payment._id },
      { $inc: { refundedPaise: claimed.amountPaise } },
    );

    await settleBookingRefundStatus(claimed.bookingId);

    const booking = await Booking.findById(claimed.bookingId);
    const user = await User.findById(booking.userId).select('email name');
    if (user) {
      await enqueueNotification({
        userId: booking.userId,
        type: NOTIFICATION_TYPES.REFUND_COMPLETED,
        to: user.email,
        data: {
          name: user.name,
          reference: booking.reference,
          amountPaise: claimed.amountPaise,
        },
      });
    }

    await recordAudit({
      actor: { _id: booking.userId },
      action: AUDIT_ACTIONS.REFUND_COMPLETED,
      resourceType: 'Refund',
      resourceId: claimed._id,
      after: { providerRefundId: result.refundId, amountPaise: claimed.amountPaise },
    });

    return { skipped: false, completed: true };
  } catch (error) {
    await Refund.updateOne(
      { _id: claimed._id },
      {
        // Back to pending so the job can retry, unless it has tried too often.
        status: claimed.attempts >= 5 ? REFUND_STATUS.FAILED : REFUND_STATUS.PENDING,
        failedAt: new Date(),
        failureReason: error.message?.slice(0, 500),
      },
    );

    await recordAudit({
      actor: { _id: claimed.bookingId },
      action: AUDIT_ACTIONS.REFUND_FAILED,
      resourceType: 'Refund',
      resourceId: claimed._id,
      after: { attempts: claimed.attempts, error: error.message?.slice(0, 200) },
    });

    logger.error({ err: error, refundId: String(claimed._id) }, 'Refund failed at the gateway');
    return { skipped: false, failed: true };
  }
}

/** Reflects completed refunds on the booking: partial, full, or still owed. */
async function settleBookingRefundStatus(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return;

  const refunds = await Refund.find({ bookingId, status: REFUND_STATUS.COMPLETED });
  const refunded = refunds.reduce((sum, refund) => sum + refund.amountPaise, 0);

  const paymentStatus =
    refunded >= booking.amountPaise
      ? PAYMENT_STATUS.REFUNDED
      : refunded > 0
        ? PAYMENT_STATUS.PARTIALLY_REFUNDED
        : booking.paymentStatus;

  await Booking.updateOne({ _id: bookingId }, { paymentStatus });
}

export async function listRefundsForBooking(bookingId) {
  return Refund.find({ bookingId }).sort({ createdAt: -1 });
}

/** Drains pending refunds; called by the reconciliation job. */
export async function processPendingRefunds({ limit = 25 } = {}) {
  const pending = await Refund.find({ status: REFUND_STATUS.PENDING, attempts: { $lt: 5 } })
    .select('_id')
    .limit(limit);

  let completed = 0;
  let failed = 0;
  for (const refund of pending) {
    const result = await processRefund(refund._id);
    if (result.completed) completed += 1;
    if (result.failed) failed += 1;
  }

  return { examined: pending.length, completed, failed };
}
