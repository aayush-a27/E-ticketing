import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  ACCOUNT_STATUS,
  AUDIT_ACTIONS,
  ERROR_CODES,
  NOTIFICATION_TYPES,
  ROLES,
} from '../../constants/index.js';
import { hashPassword, verifyPassword, fakeVerify } from '../../utils/password.js';
import { createResetToken, hashResetToken } from '../../utils/tokens.js';
import { recordAudit } from '../../services/auditService.js';
import { enqueueNotification } from '../../services/notifications/notificationService.js';
import { logger } from '../../utils/logger.js';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Creates a customer. The role is set here, from a constant — never from the
 * request. There is no code path in the application that registers any other
 * role; the super admin is created by a script and every other promotion goes
 * through an audited admin action.
 */
export async function register({ name, email, password, phone }, req) {
  const existing = await User.findOne({ email }).select('_id');
  if (existing) {
    throw ApiError.conflict('That email is already registered', ERROR_CODES.EMAIL_IN_USE);
  }

  const user = await User.create({
    name,
    email,
    phone,
    passwordHash: await hashPassword(password),
    role: ROLES.CUSTOMER,
    accountStatus: ACCOUNT_STATUS.ACTIVE,
  });

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.USER_REGISTERED,
    resourceType: 'User',
    resourceId: user._id,
    after: { email: user.email, role: user.role },
    req,
  });

  await enqueueNotification({
    userId: user._id,
    type: NOTIFICATION_TYPES.WELCOME,
    to: user.email,
    data: { name: user.name },
  });

  return user;
}

export async function login({ email, password }, req) {
  const user = await User.findOne({ email }).select('+passwordHash');

  // Same work and the same message whether the email exists or the password is
  // wrong, so neither response time nor wording reveals which accounts exist.
  if (!user) {
    await fakeVerify();
    throw new ApiError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Email or password is incorrect');
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new ApiError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Email or password is incorrect');
  }

  if (user.accountStatus !== ACCOUNT_STATUS.ACTIVE) {
    throw new ApiError(403, ERROR_CODES.ACCOUNT_SUSPENDED, `This account is ${user.accountStatus}`);
  }

  user.lastLoginAt = new Date();
  await user.save();

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.USER_LOGGED_IN,
    resourceType: 'User',
    resourceId: user._id,
    req,
  });

  return user;
}

export async function changePassword(user, { currentPassword, newPassword }, req) {
  const withHash = await User.findById(user._id).select('+passwordHash');
  const ok = await verifyPassword(currentPassword, withHash.passwordHash);
  if (!ok) {
    throw new ApiError(400, ERROR_CODES.INVALID_CREDENTIALS, 'Your current password is incorrect');
  }

  withHash.passwordHash = await hashPassword(newPassword);
  withHash.passwordChangedAt = new Date();
  // Signs every other device out.
  withHash.tokenVersion += 1;
  await withHash.save();

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
    resourceType: 'User',
    resourceId: user._id,
    req,
  });

  await enqueueNotification({
    userId: user._id,
    type: NOTIFICATION_TYPES.PASSWORD_CHANGED,
    to: withHash.email,
    data: { name: withHash.name },
  });

  return withHash;
}

/**
 * Always reports success. Telling an anonymous caller whether an address is
 * registered turns this endpoint into an account-enumeration oracle.
 */
export async function requestPasswordReset({ email }) {
  const user = await User.findOne({ email });
  if (!user) {
    logger.debug({ email }, 'Password reset requested for unknown address');
    return;
  }

  const { token, hash } = createResetToken();
  user.passwordResetTokenHash = hash;
  user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();

  await enqueueNotification({
    userId: user._id,
    type: NOTIFICATION_TYPES.PASSWORD_RESET,
    to: user.email,
    data: { name: user.name, token },
  });
}

export async function resetPassword({ token, newPassword }, req) {
  const user = await User.findOne({
    passwordResetTokenHash: hashResetToken(token),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordHash +passwordResetTokenHash +passwordResetExpiresAt');

  if (!user) {
    throw ApiError.badRequest('This reset link is invalid or has expired');
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.tokenVersion += 1;
  await user.save();

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
    resourceType: 'User',
    resourceId: user._id,
    req,
  });

  return user;
}

export async function updateProfile(user, updates) {
  // Only these three fields, whatever else the body contained.
  const allowed = ['name', 'phone', 'preferredCity'];
  for (const field of allowed) {
    if (updates[field] !== undefined) user[field] = updates[field];
  }
  await user.save();
  return user;
}

/** Invalidates every token issued to this user. */
export async function revokeAllSessions(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}
