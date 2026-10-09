import { User } from '../../models/User.js';
import { ShowRunnerProfile } from '../../models/ShowRunnerProfile.js';
import { AuditLog } from '../../models/AuditLog.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  ACCOUNT_STATUS,
  AUDIT_ACTIONS,
  NOTIFICATION_TYPES,
  ROLES,
  SHOW_RUNNER_STATUS,
} from '../../constants/index.js';
import { recordAudit } from '../../services/auditService.js';
import { enqueueNotification } from '../../services/notifications/notificationService.js';
import { withTransaction, withSession } from '../../utils/withTransaction.js';
import { resolvePagination, paginated } from '../../utils/pagination.js';

export async function listUsers(query) {
  const { page, limit, skip } = resolvePagination(query);
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.accountStatus) filter.accountStatus = query.accountStatus;
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return paginated(
    items.map((user) => user.toPublicJSON()),
    { page, limit, total },
  );
}

export async function getUser(id) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  const profile = await ShowRunnerProfile.findOne({ userId: user._id });
  return { user: user.toPublicJSON(), showRunnerProfile: profile };
}

/**
 * Suspending an account bumps the token version, so every session it already
 * had stops working on the next request rather than at token expiry.
 */
export async function updateUserStatus(admin, id, { accountStatus, reason }, req) {
  if (String(admin._id) === String(id)) {
    throw ApiError.badRequest('You cannot change your own account status');
  }

  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  if (user.role === ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('A super admin account cannot be suspended through the API');
  }
  if (user.accountStatus === accountStatus) {
    return { user: user.toPublicJSON(), unchanged: true };
  }

  const before = user.accountStatus;
  user.accountStatus = accountStatus;
  if (accountStatus !== ACCOUNT_STATUS.ACTIVE) user.tokenVersion += 1;
  await user.save();

  await recordAudit({
    actor: admin,
    action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
    resourceType: 'User',
    resourceId: user._id,
    before: { accountStatus: before },
    after: { accountStatus },
    reason,
    req,
  });

  return { user: user.toPublicJSON(), unchanged: false };
}

/**
 * Suspends or revokes show-runner access without touching the person's ability
 * to use CineReserve as a customer. Historical shows and bookings are left
 * alone — operating rights are what change here.
 */
export async function updateShowRunnerStatus(admin, userId, { status, reason }, req) {
  return withTransaction(async (session) => {
    const profile = await ShowRunnerProfile.findOne({ userId }).session(session ?? null);
    if (!profile) throw ApiError.notFound('This user has no show runner profile');

    const before = profile.status;
    if (before === status) return { profile, unchanged: true };

    profile.status = status;
    profile.statusReason = reason;
    if (status === SHOW_RUNNER_STATUS.SUSPENDED) profile.suspendedAt = new Date();
    if (status === SHOW_RUNNER_STATUS.REVOKED) profile.revokedAt = new Date();
    await profile.save({ ...withSession(session) });

    const user = await User.findById(userId).session(session ?? null);
    if (user) {
      // Revocation drops the role back to customer; suspension keeps the role
      // but gate 3 refuses every privileged request.
      if (status === SHOW_RUNNER_STATUS.REVOKED && user.role === ROLES.SHOW_RUNNER) {
        user.role = ROLES.CUSTOMER;
      }
      user.tokenVersion += 1;
      await user.save({ ...withSession(session) });
    }

    const action =
      status === SHOW_RUNNER_STATUS.ACTIVE
        ? AUDIT_ACTIONS.SHOW_RUNNER_REINSTATED
        : status === SHOW_RUNNER_STATUS.SUSPENDED
          ? AUDIT_ACTIONS.SHOW_RUNNER_SUSPENDED
          : AUDIT_ACTIONS.SHOW_RUNNER_REVOKED;

    await recordAudit(
      {
        actor: admin,
        action,
        resourceType: 'ShowRunnerProfile',
        resourceId: profile._id,
        before: { status: before },
        after: { status },
        reason,
        req,
      },
      session,
    );

    if (user && status !== SHOW_RUNNER_STATUS.ACTIVE) {
      await enqueueNotification(
        {
          userId: user._id,
          type: NOTIFICATION_TYPES.SHOW_RUNNER_SUSPENDED,
          to: user.email,
          data: { name: user.name, reason },
        },
        session,
      );
    }

    return { profile, unchanged: false };
  });
}

export async function listShowRunners(query) {
  const { page, limit, skip } = resolvePagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    ShowRunnerProfile.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email role accountStatus'),
    ShowRunnerProfile.countDocuments(filter),
  ]);

  return paginated(items, { page, limit, total });
}

export async function listAuditLogs(query) {
  const { page, limit, skip } = resolvePagination(query);
  const filter = {};
  if (query.action) filter.action = query.action;
  if (query.actorId) filter.actorId = query.actorId;
  if (query.resourceType) filter.resourceType = query.resourceType;
  if (query.resourceId) filter.resourceId = query.resourceId;

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actorId', 'name email role'),
    AuditLog.countDocuments(filter),
  ]);

  return paginated(items, { page, limit, total });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
