import { Theater } from '../models/Theater.js';
import { Screen } from '../models/Screen.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES, ROLES } from '../constants/index.js';

/**
 * Gate 4: venue assignment.
 *
 * The theater is loaded from the database and its managers list is checked.
 * The client's claim about which theater it owns is never consulted — only the
 * id it is asking about, which is then verified. This is what stops a show
 * runner from editing another runner's venue by changing an id in the URL.
 *
 * A super admin passes, and the loaded theater is attached either way so the
 * handler does not fetch it twice.
 */
export function requireTheaterAccess(paramName = 'theaterId') {
  return async function theaterGuard(req, _res, next) {
    try {
      const theaterId = req.params[paramName] ?? req.body?.theaterId;
      if (!theaterId) throw ApiError.badRequest('A theater id is required');

      const theater = await Theater.findById(theaterId);
      if (!theater) throw ApiError.notFound('Theater not found');

      if (req.user.role !== ROLES.SUPER_ADMIN && !theater.isManagedBy(req.user._id)) {
        // Deliberately the same message a super admin would see for a missing
        // theater would differ — but here the resource exists and the answer is
        // simply no, which is not a secret worth hiding from an approved runner.
        throw ApiError.forbidden(
          'You do not manage this theater',
          ERROR_CODES.NOT_THEATER_MANAGER,
        );
      }

      req.theater = theater;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Same check, reached through a screen. Resolves the screen, then its theater,
 * so screen and layout routes do not have to carry a theater id in the path.
 */
export function requireScreenAccess(paramName = 'screenId') {
  return async function screenGuard(req, _res, next) {
    try {
      const screen = await Screen.findById(req.params[paramName]);
      if (!screen) throw ApiError.notFound('Screen not found');

      const theater = await Theater.findById(screen.theaterId);
      if (!theater) throw ApiError.notFound('Theater not found');

      if (req.user.role !== ROLES.SUPER_ADMIN && !theater.isManagedBy(req.user._id)) {
        throw ApiError.forbidden(
          'You do not manage this theater',
          ERROR_CODES.NOT_THEATER_MANAGER,
        );
      }

      req.screen = screen;
      req.theater = theater;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** The theater ids a user may act on; a super admin is not restricted. */
export async function managedTheaterIds(user) {
  if (user.role === ROLES.SUPER_ADMIN) return null;
  const theaters = await Theater.find({ managers: user._id }).select('_id');
  return theaters.map((theater) => theater._id);
}
