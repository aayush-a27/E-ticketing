import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ERROR_CODES, ROLES } from '../../constants/index.js';
import { cookieOptions, env } from '../../config/env.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  signAccessToken,
  signRefreshToken,
  ttlToMs,
  verifyRefreshToken,
} from '../../utils/tokens.js';
import { User } from '../../models/User.js';
import { ShowRunnerProfile } from '../../models/ShowRunnerProfile.js';
import * as authService from './auth.service.js';

function issueSession(res, user) {
  res.cookie(ACCESS_COOKIE, signAccessToken(user), cookieOptions(ttlToMs(env.ACCESS_TOKEN_TTL)));
  res.cookie(REFRESH_COOKIE, signRefreshToken(user), cookieOptions(ttlToMs(env.REFRESH_TOKEN_TTL)));
}

function clearSession(res) {
  res.clearCookie(ACCESS_COOKIE, cookieOptions());
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

export const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body, req);
  issueSession(res, user);
  res.status(201).json({ data: { user: user.toPublicJSON() } });
});

export const login = asyncHandler(async (req, res) => {
  const user = await authService.login(req.body, req);
  issueSession(res, user);
  res.json({ data: { user: user.toPublicJSON() } });
});

export const logout = asyncHandler(async (_req, res) => {
  clearSession(res);
  res.json({ data: { loggedOut: true } });
});

export const logoutAll = asyncHandler(async (req, res) => {
  await authService.revokeAllSessions(req.user._id);
  clearSession(res);
  res.json({ data: { loggedOut: true, allDevices: true } });
});

/**
 * Rotates the session from the refresh cookie. The token version is re-checked
 * against the database, so a refresh token issued before a suspension or a
 * password change cannot mint a fresh access token.
 */
export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthenticated('No refresh token');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (error) {
    clearSession(res);
    throw error.name === 'TokenExpiredError'
      ? ApiError.unauthenticated('Session expired', ERROR_CODES.TOKEN_EXPIRED)
      : ApiError.unauthenticated('Invalid session', ERROR_CODES.TOKEN_INVALID);
  }

  const user = await User.findById(payload.sub);
  if (!user || (user.tokenVersion ?? 0) !== (payload.tv ?? 0)) {
    clearSession(res);
    throw ApiError.unauthenticated('Session is no longer valid', ERROR_CODES.TOKEN_INVALID);
  }
  if (!user.isActive) {
    clearSession(res);
    throw new ApiError(403, ERROR_CODES.ACCOUNT_SUSPENDED, `This account is ${user.accountStatus}`);
  }

  issueSession(res, user);
  res.json({ data: { user: user.toPublicJSON() } });
});

/**
 * The single source of truth the frontends use to decide what to render. It
 * returns the capability facts rather than making the client infer them from
 * the role alone.
 */
export const me = asyncHandler(async (req, res) => {
  const payload = { user: req.user.toPublicJSON(), showRunner: null };

  if (req.user.role === ROLES.SHOW_RUNNER) {
    const profile = req.showRunnerProfile ?? (await ShowRunnerProfile.findOne({ userId: req.user._id }));
    if (profile) {
      payload.showRunner = {
        id: String(profile._id),
        businessName: profile.businessName,
        status: profile.status,
        canOperate: profile.canOperate,
        operatingCities: profile.operatingCities,
        approvedAt: profile.approvedAt,
      };
    }
  }

  res.json({ data: payload });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user, req.body);
  res.json({ data: { user: user.toPublicJSON() } });
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await authService.changePassword(req.user, req.body, req);
  // The old session died with the token version bump; hand back a fresh one so
  // the user is not logged out of the device they just used.
  issueSession(res, user);
  res.json({ data: { passwordChanged: true } });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body);
  res.json({
    data: { message: 'If that email is registered, a reset link is on its way' },
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body, req);
  clearSession(res);
  res.json({ data: { passwordReset: true } });
});
