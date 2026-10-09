import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES, ROLES, SHOW_RUNNER_STATUS } from '../constants/index.js';

/**
 * Gate 1: the role. Always combined with authenticate(), which has already
 * enforced gate 2 (account status) against the database.
 */
export function requireRole(...roles) {
  const allowed = new Set(roles.flat());
  return function roleGuard(req, _res, next) {
    if (!req.user) return next(ApiError.unauthenticated());
    if (!allowed.has(req.user.role)) {
      return next(ApiError.forbidden('Your account cannot perform this action'));
    }
    next();
  };
}

export const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN);

/**
 * Gate 3: an active show-runner profile. Holding the role is not enough — a
 * suspended or revoked runner is refused here even though the role remains, and
 * a super admin passes through for support and oversight work.
 */
export function requireActiveShowRunner(req, _res, next) {
  if (!req.user) return next(ApiError.unauthenticated());
  if (req.user.role === ROLES.SUPER_ADMIN) return next();

  if (req.user.role !== ROLES.SHOW_RUNNER) {
    return next(ApiError.forbidden('Your account cannot perform this action'));
  }

  const profile = req.showRunnerProfile;
  if (!profile) {
    return next(
      ApiError.forbidden(
        'No show runner profile found for this account',
        ERROR_CODES.SHOW_RUNNER_NOT_ACTIVE,
      ),
    );
  }
  if (profile.status !== SHOW_RUNNER_STATUS.ACTIVE) {
    return next(
      ApiError.forbidden(
        `Show runner access is ${profile.status}`,
        ERROR_CODES.SHOW_RUNNER_NOT_ACTIVE,
      ),
    );
  }

  next();
}

/**
 * Gate 4 (venue ownership) arrives with theaters in Phase 3. It will resolve
 * the theater from the database and check its managers list, never an id the
 * client supplied alongside the resource.
 */
