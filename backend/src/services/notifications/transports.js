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

const registry = new Map([
  [consoleTransport.name, consoleTransport],
  [noopTransport.name, noopTransport],
]);

export function getTransport(name) {
  const transport = registry.get(name);
  if (!transport) throw new Error(`Unknown notification transport: ${name}`);
  return transport;
}

export function registerTransport(transport) {
  registry.set(transport.name, transport);
}
