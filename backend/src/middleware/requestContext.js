import crypto from 'node:crypto';

/**
 * Gives every request an id that appears in logs, audit rows and error
 * responses, so a user-reported failure can be traced to one request.
 */
export function requestContext(req, res, next) {
  req.id = req.get('x-request-id') ?? crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
