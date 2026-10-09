/**
 * Wraps an async route handler so a rejected promise reaches Express's error
 * handler instead of hanging the request. Express 4 does not do this itself.
 */
export function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
