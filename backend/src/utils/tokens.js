import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const ACCESS_COOKIE = 'cr_at';
export const REFRESH_COOKIE = 'cr_rt';

/**
 * The token carries only an identifier and the token version. Role, account
 * status and every ownership fact are read from the database on each request,
 * so a suspension or role change takes effect immediately rather than when the
 * token happens to expire.
 */
export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion ?? 0 }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  });
}

export function signRefreshToken(user) {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion ?? 0 }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_TTL,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

/** Milliseconds for strings like "15m", "30d", "900s", or a bare number. */
export function ttlToMs(ttl) {
  const match = /^(\d+)([smhd])?$/.exec(String(ttl).trim());
  if (!match) throw new Error(`Unsupported TTL format: ${ttl}`);
  const value = Number(match[1]);
  const unit = match[2] ?? 's';
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[unit];
}

/**
 * Password-reset tokens are random, single-use and stored as a SHA-256 hash, so
 * a leaked database row cannot be replayed to take over an account.
 */
export function createResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = hashResetToken(token);
  return { token, hash };
}

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
