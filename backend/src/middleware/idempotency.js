import crypto from 'node:crypto';
import { IdempotencyKey } from '../models/IdempotencyKey.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/index.js';
import { logger } from '../utils/logger.js';

const KEY_TTL_MS = 24 * 60 * 60 * 1000;

function hashBody(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
}

/**
 * Makes an unsafe POST replay-safe.
 *
 * The key record is inserted before the handler runs, so a duplicate request
 * loses on the unique index rather than doing the work twice. The first
 * response is then replayed. This is what keeps a double-click, or a mobile
 * client retrying a request whose answer it never saw, from taking two sets of
 * seats or creating two payment orders.
 *
 * The request body is hashed: the same key sent with different parameters is a
 * client bug and is reported, not quietly answered with the earlier result.
 */
export function idempotent({ required = false } = {}) {
  return async function idempotencyGuard(req, res, next) {
    const key = req.get('idempotency-key');

    if (!key) {
      if (required) {
        return next(
          ApiError.badRequest('This request requires an Idempotency-Key header', [
            { field: 'Idempotency-Key', message: 'Missing header' },
          ]),
        );
      }
      return next();
    }

    if (key.length > 200) {
      return next(ApiError.badRequest('Idempotency-Key is too long'));
    }

    const route = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`;
    const requestHash = hashBody(req.body);

    let record;
    try {
      record = await IdempotencyKey.create({
        key,
        userId: req.user._id,
        route,
        requestHash,
        expiresAt: new Date(Date.now() + KEY_TTL_MS),
      });
    } catch (error) {
      if (error?.code !== 11000) return next(error);

      const existing = await IdempotencyKey.findOne({ key, userId: req.user._id, route });
      if (!existing) return next(error);

      if (existing.requestHash !== requestHash) {
        return next(
          ApiError.conflict(
            'This Idempotency-Key was already used with different request data',
            ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
          ),
        );
      }

      if (existing.status === 'completed') {
        res.setHeader('idempotent-replay', 'true');
        return res.status(existing.statusCode).json(existing.responseSnapshot);
      }

      // The first request is still running. Telling the client to retry is
      // safer than running the work a second time.
      return next(
        new ApiError(
          409,
          ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROGRESS,
          'An identical request is already being processed. Retry in a moment.',
        ),
      );
    }

    // Capture the response so a later replay can return it verbatim.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const statusCode = res.statusCode;
      if (statusCode >= 200 && statusCode < 300) {
        IdempotencyKey.updateOne(
          { _id: record._id },
          { status: 'completed', statusCode, responseSnapshot: body },
        ).catch((error) => logger.warn({ err: error }, 'Could not store idempotent response'));
      } else {
        // A failure is not a result worth replaying; drop the key so the
        // client may genuinely retry.
        IdempotencyKey.deleteOne({ _id: record._id }).catch(() => {});
      }
      return originalJson(body);
    };

    next();
  };
}
