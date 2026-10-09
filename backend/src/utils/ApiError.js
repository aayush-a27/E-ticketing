import { ERROR_CODES } from '../constants/index.js';

/**
 * Every error the API deliberately returns is an ApiError. Anything else that
 * reaches the error handler is treated as a bug and reported as a 500 without
 * leaking its message.
 */
export class ApiError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expected = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message, details, code = ERROR_CODES.VALIDATION_FAILED) {
    return new ApiError(400, code, message, details);
  }

  static unauthenticated(message = 'Authentication required', code = ERROR_CODES.UNAUTHENTICATED) {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'You do not have access to this resource', code = ERROR_CODES.FORBIDDEN) {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Resource not found', code = ERROR_CODES.NOT_FOUND) {
    return new ApiError(404, code, message);
  }

  static conflict(message, code = ERROR_CODES.CONFLICT, details) {
    return new ApiError(409, code, message, details);
  }

  static tooManyRequests(message = 'Too many requests, slow down') {
    return new ApiError(429, ERROR_CODES.RATE_LIMITED, message);
  }

  static internal(message = 'Something went wrong') {
    return new ApiError(500, ERROR_CODES.INTERNAL_ERROR, message);
  }
}
