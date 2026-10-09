import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { SeatHold } from '../models/SeatHold.js';
import { BOOKING_STATUS, HOLD_STATUS, PAYMENT_ATTEMPT_STATUS } from '../constants/index.js';
import { processPendingRefunds } from '../modules/refunds/refunds.service.js';
import { flushOutbox } from '../services/notifications/notificationService.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

let timer = null;
let running = false;

/**
 * Closes out bookings whose hold lapsed before anyone paid.
 *
 * Only ever touches bookings with no verified payment: anything that was paid
 * for is left for the refund path, because expiring a paid booking would hide
 * money that is owed.
 */
export async function expireAbandonedBookings({ limit = 100 } = {}) {
  const stale = await Booking.find({
    status: { $in: [BOOKING_STATUS.PENDING_PAYMENT, BOOKING_STATUS.PAYMENT_FAILED] },
  })
    .select('_id holdId')
    .limit(limit);

  let expired = 0;

  for (const booking of stale) {
    const hold = await SeatHold.findById(booking.holdId).select('status expiresAt');
    const holdGone =
      !hold || hold.status !== HOLD_STATUS.ACTIVE || hold.expiresAt <= new Date();
    if (!holdGone) continue;

    // A verified payment means money moved; that is a refund case, not an
    // expiry.
    const paid = await Payment.exists({
      bookingId: booking._id,
      signatureVerified: true,
      status: { $in: [PAYMENT_ATTEMPT_STATUS.AUTHORIZED, PAYMENT_ATTEMPT_STATUS.CAPTURED] },
    });
    if (paid) continue;

    const updated = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: { $in: [BOOKING_STATUS.PENDING_PAYMENT, BOOKING_STATUS.PAYMENT_FAILED] },
      },
      { status: BOOKING_STATUS.EXPIRED, expiredAt: new Date() },
      { new: true },
    );
    if (updated) expired += 1;
  }

  return { examined: stale.length, expired };
}

/**
 * Periodic clean-up: abandoned bookings, pending refunds, and the notification
 * outbox. Every step is individually safe to repeat, so a missed run costs
 * nothing but a delay.
 */
export function startReconcileJob({ intervalMs = env.RECONCILE_INTERVAL_MS } = {}) {
  if (timer) return timer;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const [bookings, refunds, notifications] = await Promise.all([
        expireAbandonedBookings(),
        processPendingRefunds(),
        flushOutbox(),
      ]);

      if (bookings.expired || refunds.completed || refunds.failed) {
        logger.info(
          {
            bookingsExpired: bookings.expired,
            refundsCompleted: refunds.completed,
            refundsFailed: refunds.failed,
            notificationsSent: notifications.delivered,
          },
          'Reconciliation pass complete',
        );
      }
    } catch (error) {
      logger.error({ err: error }, 'Reconciliation pass failed');
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  timer.unref?.();

  logger.info({ intervalMs }, 'Reconciliation job started');
  return timer;
}

export function stopReconcileJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
