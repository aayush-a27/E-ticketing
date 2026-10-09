import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

/**
 * Replaces req.body / req.query / req.params with the parsed result, so
 * handlers only ever see fields the schema declared. Anything else a client
 * sends is dropped here, which is what makes mass assignment and query-operator
 * injection impossible further down.
 */
export function validate(schemas) {
  return function validator(req, _res, next) {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.params) req.params = schemas.params.parse(req.params ?? {});
      if (schemas.query) {
        // req.query is a getter in Express 5 and a plain object in 4; assigning
        // to a private field keeps both working.
        req.validatedQuery = schemas.query.parse(req.query ?? {});
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        }));
        return next(ApiError.badRequest('Request validation failed', details));
      }
      next(error);
    }
  };
}
