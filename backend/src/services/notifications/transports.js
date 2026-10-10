import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * A transport takes a notification document and delivers it. Adding a real
 * email provider later means implementing this one method and registering it
 * below — no caller changes.
 *
 *   async send({ to, subject, body, type, payload }) -> void (throw to fail)
 */

export const consoleTransport = {
  name: 'console',
  async send(notification) {
    logger.info(
      {
        notification: {
          type: notification.type,
          to: notification.to,
          subject: notification.subject,
        },
      },
      `[notification] ${notification.subject}\n${notification.body}`,
    );
  },
};

export const noopTransport = {
  name: 'noop',
  async send() {},
};

/**
 * Real email through any SMTP account. Free options that work:
 *
 *   Gmail   smtp.gmail.com:587, your address, an app password
 *           (Google account > Security > App passwords; needs 2-step sign-in)
 *   Brevo   smtp-relay.brevo.com:587, the SMTP login and key from the
 *           dashboard; 300 emails a day on the free plan
 *
 * Plain-text messages, which every client renders and spam filters trust.
 */
export function createSmtpTransport({ host, port, secure, user, pass, from, name = 'smtp', tls }) {
  let client = null;
  return {
    name,
    async send(notification) {
      client ??= nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
        ...(tls ? { tls } : {}),
      });

      await client.sendMail({
        from,
        to: notification.to,
        subject: notification.subject,
        text: notification.body,
      });
    },
  };
}

export const smtpTransport = createSmtpTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  user: env.SMTP_USER,
  pass: env.SMTP_PASS,
  from: env.SMTP_FROM,
});

const registry = new Map([
  [consoleTransport.name, consoleTransport],
  [noopTransport.name, noopTransport],
  [smtpTransport.name, smtpTransport],
]);

export function getTransport(name) {
  const transport = registry.get(name);
  if (!transport) throw new Error(`Unknown notification transport: ${name}`);
  return transport;
}

export function registerTransport(transport) {
  registry.set(transport.name, transport);
}
