import { Notification } from '../../models/Notification.js';
import { NOTIFICATION_STATUS } from '../../constants/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { getTransport } from './transports.js';
import { renderTemplate } from './templates.js';

/**
 * Writes a notification to the outbox. Safe to call inside a transaction: pass
 * the session and the row commits with the change that caused it.
 *
 * Delivery is deliberately a separate step. Nothing about whether a booking or
 * an approval succeeded may depend on an email going out.
 */
/** After this many failed attempts a notification stops being retried. */
export const MAX_DELIVERY_ATTEMPTS = 5;

/** How long a claim on a notification lasts while it is being sent. */
const CLAIM_MS = 60_000;

export async function enqueueNotification(
  { userId, type, to, channel = 'email', data = {} },
  session = undefined,
) {
  const { subject, body } = renderTemplate(type, data);
  const docs = await Notification.create(
    [{ userId, type, to, channel, subject, body, payload: data }],
    session ? { session } : {},
  );
  const notification = docs[0];

  /**
   * Sent straight away rather than at the next outbox sweep — a password
   * reset link that arrives a minute later is a broken experience. Inside a
   * transaction the document does not exist until the caller commits, so
   * those wait for the sweep, which is never more than a minute behind.
   */
  if (!session && env.NOTIFICATION_DELIVER_IMMEDIATELY) {
    setImmediate(() => {
      deliverById(notification._id).catch((error) =>
        logger.warn({ err: error }, 'Immediate notification delivery failed; the outbox will retry'),
      );
    });
  }

  return notification;
}

/**
 * Claims one notification and sends it. Returns null when someone else holds
 * it, or it is no longer pending — so the immediate send and the outbox sweep
 * can never both deliver the same email.
 */
export async function deliverById(id) {
  const now = new Date();
  const claimed = await Notification.findOneAndUpdate(
    {
      _id: id,
      status: NOTIFICATION_STATUS.PENDING,
      $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
    },
    { lockedUntil: new Date(now.getTime() + CLAIM_MS) },
    { new: true },
  );
  if (!claimed) return null;
  return deliverNotification(claimed);
}

/**
 * Sends a claimed notification and records the result.
 *
 * A failure keeps it pending, so the outbox tries again — after 1, 2, 4 and 8
 * minutes — until it has failed MAX_DELIVERY_ATTEMPTS times. It used to be
 * marked failed after the first error, and the outbox only picks up pending
 * ones, so a single SMTP hiccup lost the email for good.
 */
export async function deliverNotification(notification) {
  const transport = getTransport(env.NOTIFICATION_TRANSPORT);
  notification.attempts += 1;
  notification.lastAttemptAt = new Date();

  try {
    await transport.send(notification);
    notification.status = NOTIFICATION_STATUS.SENT;
    notification.sentAt = new Date();
    notification.lastError = undefined;
    notification.lockedUntil = null;
  } catch (error) {
    notification.lastError = error.message?.slice(0, 500);
    if (notification.attempts >= MAX_DELIVERY_ATTEMPTS) {
      notification.status = NOTIFICATION_STATUS.FAILED;
      notification.lockedUntil = null;
    } else {
      const backoffMs = 60_000 * 2 ** (notification.attempts - 1);
      notification.lockedUntil = new Date(Date.now() + backoffMs);
    }
    logger.warn(
      { err: error, type: notification.type, attempts: notification.attempts },
      'Notification delivery failed',
    );
  }

  await notification.save();
  return notification;
}

export async function flushOutbox({ limit = 50 } = {}) {
  const now = new Date();
  const pending = await Notification.find({
    status: NOTIFICATION_STATUS.PENDING,
    attempts: { $lt: MAX_DELIVERY_ATTEMPTS },
    $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .select('_id');

  const results = await Promise.allSettled(pending.map((item) => deliverById(item._id)));
  return {
    attempted: pending.length,
    delivered: results.filter(
      (result) => result.status === 'fulfilled' && result.value?.status === NOTIFICATION_STATUS.SENT,
    ).length,
  };
}
