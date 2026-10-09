import pino from 'pino';
import { env, isProduction } from '../config/env.js';

/**
 * Anything listed here is replaced with [redacted] before it reaches a log
 * sink. Passwords, tokens and signatures must never be recoverable from logs.
 */
const redactPaths = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'resetToken',
  '*.password',
  '*.passwordHash',
  '*.token',
];

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[redacted]' },
  base: undefined,
  transport: isProduction
    ? undefined
    : { target: 'pino/file', options: { destination: 1 } },
});
