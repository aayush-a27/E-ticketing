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
export async function enqueueNotification(
  { userId, type, to, channel = 'email', data = {} },
  session = undefined,
) {
  const { subject, body } = renderTemplate(type, data);
  const docs = await Notification.create(
    [{ userId, type, to, channel, subject, body, payload: data }],
    session ? { session } : {},
  );
  return docs[0];
}

/** Attempts delivery of one notification and records the outcome. */
export async function deliverNotification(notification) {
  const transport = getTransport(env.NOTIFICATION_TRANSPORT);
  try {
    await transport.send(notification);
    notification.status = NOTIFICATION_STATUS.SENT;
    notification.sentAt = new Date();
    notification.lastError = undefined;
  } catch (error) {
    notification.status = NOTIFICATION_STATUS.FAILED;
    notification.lastError = error.message?.slice(0, 500);
    logger.warn({ err: error, type: notification.type }, 'Notification delivery failed');
  }
  notification.attempts += 1;
  notification.lastAttemptAt = new Date();
  await notification.save();
  return notification;
}

/**
 * Drains pending notifications. Called by the outbox job in Phase 5; exported
 * now so the auth flows have working delivery in development.
 */
export async function flushOutbox({ limit = 50, maxAttempts = 5 } = {}) {
  const pending = await Notification.find({
    status: NOTIFICATION_STATUS.PENDING,
    attempts: { $lt: maxAttempts },
  })
    .sort({ createdAt: 1 })
    .limit(limit);

  const results = await Promise.allSettled(pending.map((item) => deliverNotification(item)));
  return {
    attempted: pending.length,
    delivered: results.filter(
      (result) => result.status === 'fulfilled' && result.value.status === NOTIFICATION_STATUS.SENT,
    ).length,
  };
}
