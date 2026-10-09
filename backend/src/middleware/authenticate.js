import { User } from '../models/User.js';
import { ShowRunnerProfile } from '../models/ShowRunnerProfile.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_STATUS, ERROR_CODES, ROLES } from '../constants/index.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../utils/tokens.js';

function readToken(req) {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;
  // Bearer is accepted so the gate-scanner client and API tooling can
  // authenticate without a browser cookie jar.
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

async function resolveUser(token) {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    throw error.name === 'TokenExpiredError'
      ? ApiError.unauthenticated('Session expired', ERROR_CODES.TOKEN_EXPIRED)
      : ApiError.unauthenticated('Invalid session', ERROR_CODES.TOKEN_INVALID);
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthenticated('Invalid session', ERROR_CODES.TOKEN_INVALID);

  // A token minted before a logout-all, password change, suspension or role
  // change is refused here rather than at its natural expiry.
  if ((user.tokenVersion ?? 0) !== (payload.tv ?? 0)) {
    throw ApiError.unauthenticated('Session is no longer valid', ERROR_CODES.TOKEN_INVALID);
  }

  if (user.accountStatus !== ACCOUNT_STATUS.ACTIVE) {
    throw new ApiError(
      403,
      ERROR_CODES.ACCOUNT_SUSPENDED,
      `This account is ${user.accountStatus}`,
    );
  }

  return user;
}

/**
 * Requires a signed-in user. Role, account status and the show-runner profile
 * are read from the database on every request — the token is only an identity
 * claim, never an authorization one.
 */
export async function authenticate(req, _res, next) {
  try {
    const token = readToken(req);
    if (!token) throw ApiError.unauthenticated();

    const user = await resolveUser(token);
    req.user = user;

    if (user.role === ROLES.SHOW_RUNNER) {
      req.showRunnerProfile = await ShowRunnerProfile.findOne({ userId: user._id });
    }

    next();
  } catch (error) {
    next(error);
  }
}

/** Attaches the user when a valid session exists, but never refuses the request. */
export async function optionalAuthenticate(req, _res, next) {
  try {
    const token = readToken(req);
    if (token) req.user = await resolveUser(token);
  } catch {
    req.user = undefined;
  }
  next();
}
