import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/index.js';
import { isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Translates driver and ODM failures into the API's own error vocabulary, so a
 * duplicate-key error never reaches a client as a 500 with an index name in it.
 */
function normalize(error) {
  if (error instanceof ApiError) return error;

  if (error?.name === 'ValidationError' && error.errors) {
    const details = Object.entries(error.errors).map(([field, issue]) => ({
      field,
      message: issue.message,
    }));
    return ApiError.badRequest('Request validation failed', details);
  }

  if (error?.name === 'CastError') {
    return ApiError.badRequest('Malformed identifier', [
      { field: error.path, message: 'Not a valid id' },
    ]);
  }

  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern ?? {})[0] ?? 'value';
    const code =
      field === 'email'
        ? ERROR_CODES.EMAIL_IN_USE
        : error.message?.includes('one_pending_application')
          ? ERROR_CODES.DUPLICATE_APPLICATION
          : ERROR_CODES.CONFLICT;
    return ApiError.conflict('That record already exists', code, [
      { field, message: 'Already in use' },
    ]);
  }

  if (error?.type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body is not valid JSON');
  }

  return null;
}

// eslint-disable-next-line no-unused-vars -- Express identifies the handler by arity
export function errorHandler(error, req, res, _next) {
  const normalized = normalize(error);

  if (!normalized) {
    // Unexpected: log everything, tell the client nothing.
    logger.error({ err: error, requestId: req.id, path: req.originalUrl }, 'Unhandled error');
    return res.status(500).json({
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Something went wrong',
        requestId: req.id,
      },
    });
  }

  if (normalized.statusCode >= 500) {
    logger.error({ err: error, requestId: req.id }, normalized.message);
  } else {
    logger.debug({ code: normalized.code, requestId: req.id }, normalized.message);
  }

  const body = {
    error: {
      code: normalized.code,
      message: normalized.message,
      requestId: req.id,
    },
  };
  if (normalized.details) body.error.details = normalized.details;
  if (!isProduction && normalized.statusCode >= 500) body.error.stack = error.stack;

  return res.status(normalized.statusCode).json(body);
}
