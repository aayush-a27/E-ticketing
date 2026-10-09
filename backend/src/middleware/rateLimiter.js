import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * In-memory counters. They live in one process and are NOT shared between
 * instances: running two copies of the server doubles every effective limit.
 * See the scaling note in the README before deploying replicas.
 *
 * Rate limiting is a blunt instrument layered on top of authentication,
 * authorization, idempotency keys and database constraints — never instead of
 * them.
 */
function buildLimiter({ max, windowMs = env.RATE_LIMIT_WINDOW_MS, keyPrefix }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // A signed-in user is limited per account; everyone else per IP. The
    // helper normalizes IPv6 into a /64 subnet so a single client cannot walk
    // through addresses to reset its counter.
    keyGenerator: (req) =>
      req.user ? `${keyPrefix}:u:${req.user._id}` : `${keyPrefix}:${ipKeyGenerator(req.ip)}`,
    handler: (_req, _res, next) =>
      next(ApiError.tooManyRequests('Too many requests. Try again in a few minutes.')),
    skip: () => env.NODE_ENV === 'test',
  });
}

/** Browsing endpoints: generous. */
export const publicLimiter = buildLimiter({
  max: env.RATE_LIMIT_PUBLIC_MAX,
  keyPrefix: 'public',
});

/** Login, register, password reset: tight, because these are guessed at. */
export const authLimiter = buildLimiter({
  max: env.RATE_LIMIT_AUTH_MAX,
  keyPrefix: 'auth',
});

/** Applications, seat holds, payment initiation: in between. */
export const sensitiveLimiter = buildLimiter({
  max: env.RATE_LIMIT_SENSITIVE_MAX,
  keyPrefix: 'sensitive',
});
