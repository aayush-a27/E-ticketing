import { User } from '../../models/User.js';
import { ShowRunnerProfile } from '../../models/ShowRunnerProfile.js';
import { Theater } from '../../models/Theater.js';
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
import { getCustomerBookingSummary } from '../operations/operations.service.js';

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

/**
 * One account, with its show-runner profile if it has one and a count of what
 * it has booked. The booking figures come from the operations read model, so
 * the console does not have to fetch a customer's bookings to display a total.
 */
export async function getUser(actor, id) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  const [profile, bookingSummary] = await Promise.all([
    ShowRunnerProfile.findOne({ userId: user._id }),
    getCustomerBookingSummary(actor, user._id, { scoped: false }),
  ]);

  return { user: user.toPublicJSON(), showRunnerProfile: profile, bookingSummary };
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

    /**
     * Revocation ends the relationship, so the venue grants go with it.
     * Leaving them in place would mean that if this person were approved again
     * through a new application, every old theater would come back with them
     * silently — and approval must never grant a venue on its own. Suspension
     * keeps them, because a suspension is meant to be reversible.
     */
    let removedFromTheaters = [];
    if (status === SHOW_RUNNER_STATUS.REVOKED) {
      const held = await Theater.find({ managers: userId })
        .select('_id name')
        .session(session ?? null);
      if (held.length > 0) {
        await Theater.updateMany(
          { managers: userId },
          { $pull: { managers: userId } },
          withSession(session),
        );
        removedFromTheaters = held.map((theater) => ({
          id: String(theater._id),
          name: theater.name,
        }));
        for (const theater of held) {
          await recordAudit(
            {
              actor: admin,
              action: AUDIT_ACTIONS.THEATER_MANAGER_REMOVED,
              resourceType: 'Theater',
              resourceId: theater._id,
              before: { managerId: String(userId) },
              reason: `Show runner access revoked: ${reason}`,
              req,
            },
            session,
          );
        }
      }
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

    return { profile, unchanged: false, removedFromTheaters };
  });
}

/**
 * Show runners, each with the venues they have actually been assigned.
 *
 * Approval and assignment are separate grants, so the two must be visible
 * together: an approved runner with an empty `assignedTheaters` can operate
 * nothing yet, and a console that showed only the profile status would imply
 * otherwise. `assigned=false` lists exactly those waiting for a venue.
 */
export async function listShowRunners(query) {
  const { page, limit, skip } = resolvePagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    filter.businessName = new RegExp(escapeRegex(query.search), 'i');
  }

  /**
   * Resolved before paginating, so the filter narrows the query itself. Doing
   * it to an already-fetched page would leave pages half empty and report a
   * total that did not match what came back.
   */
  if (query.assigned) {
    const managerIds = await Theater.distinct('managers');
    filter.userId = query.assigned === 'true' ? { $in: managerIds } : { $nin: managerIds };
  }

  const [items, total] = await Promise.all([
    ShowRunnerProfile.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email role accountStatus'),
    ShowRunnerProfile.countDocuments(filter),
  ]);

  // One query for the whole page rather than one per runner.
  const userIds = items.map((profile) => profile.userId?._id ?? profile.userId);
  const theaters = await Theater.find({ managers: { $in: userIds } }).select(
    'name slug cityLabel status managers',
  );

  const byManager = new Map();
  for (const theater of theaters) {
    for (const managerId of theater.managers) {
      const key = String(managerId);
      if (!byManager.has(key)) byManager.set(key, []);
      byManager.get(key).push({
        id: String(theater._id),
        name: theater.name,
        slug: theater.slug,
        city: theater.cityLabel,
        status: theater.status,
      });
    }
  }

  const rows = items.map((profile) => {
    const key = String(profile.userId?._id ?? profile.userId);
    const assignedTheaters = byManager.get(key) ?? [];
    return {
      ...profile.toObject(),
      assignedTheaters,
      needsTheaterAssignment: assignedTheaters.length === 0,
    };
  });

  return paginated(rows, { page, limit, total });
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
