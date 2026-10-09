import { OrganizerApplication } from '../../models/OrganizerApplication.js';
import { ShowRunnerProfile } from '../../models/ShowRunnerProfile.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  APPLICATION_STATUS,
  AUDIT_ACTIONS,
  ERROR_CODES,
  NOTIFICATION_TYPES,
  ROLES,
  SHOW_RUNNER_STATUS,
} from '../../constants/index.js';
import { recordAudit } from '../../services/auditService.js';
import { enqueueNotification } from '../../services/notifications/notificationService.js';
import { withTransaction, withSession } from '../../utils/withTransaction.js';
import { resolvePagination, paginated } from '../../utils/pagination.js';

export async function submitApplication(applicant, payload, req) {
  if (applicant.role === ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('A platform administrator does not need an organizer application');
  }

  const existingProfile = await ShowRunnerProfile.findOne({ userId: applicant._id });
  if (existingProfile && existingProfile.status === SHOW_RUNNER_STATUS.ACTIVE) {
    throw ApiError.conflict('You are already an approved show runner');
  }

  let application;
  try {
    application = await OrganizerApplication.create({
      ...payload,
      applicantId: applicant._id,
      status: APPLICATION_STATUS.PENDING,
      submittedAt: new Date(),
    });
  } catch (error) {
    // The partial unique index is the real guard: two simultaneous submissions
    // cannot both become pending.
    if (error?.code === 11000) {
      throw ApiError.conflict(
        'You already have an application under review',
        ERROR_CODES.DUPLICATE_APPLICATION,
      );
    }
    throw error;
  }

  await recordAudit({
    actor: applicant,
    action: AUDIT_ACTIONS.APPLICATION_SUBMITTED,
    resourceType: 'OrganizerApplication',
    resourceId: application._id,
    after: { businessName: application.businessName, status: application.status },
    req,
  });

  await enqueueNotification({
    userId: applicant._id,
    type: NOTIFICATION_TYPES.APPLICATION_SUBMITTED,
    to: applicant.email,
    data: { name: applicant.name, businessName: application.businessName },
  });

  return application;
}

export async function listMyApplications(applicant) {
  return OrganizerApplication.find({ applicantId: applicant._id }).sort({ createdAt: -1 });
}

export async function getMyApplication(applicant, id) {
  const application = await OrganizerApplication.findOne({
    _id: id,
    applicantId: applicant._id,
  });
  if (!application) throw ApiError.notFound('Application not found');
  return application;
}

export async function withdrawApplication(applicant, id, req) {
  const application = await OrganizerApplication.findOneAndUpdate(
    { _id: id, applicantId: applicant._id, status: APPLICATION_STATUS.PENDING },
    { status: APPLICATION_STATUS.WITHDRAWN, withdrawnAt: new Date() },
    { new: true },
  );

  if (!application) {
    const exists = await OrganizerApplication.exists({ _id: id, applicantId: applicant._id });
    throw exists
      ? ApiError.conflict(
          'Only a pending application can be withdrawn',
          ERROR_CODES.APPLICATION_NOT_PENDING,
        )
      : ApiError.notFound('Application not found');
  }

  await recordAudit({
    actor: applicant,
    action: AUDIT_ACTIONS.APPLICATION_WITHDRAWN,
    resourceType: 'OrganizerApplication',
    resourceId: application._id,
    req,
  });

  return application;
}

export async function listApplications(query) {
  const { page, limit, skip } = resolvePagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.city) filter.cities = query.city;
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ businessName: pattern }, { contactEmail: pattern }, { contactName: pattern }];
  }

  const [items, total] = await Promise.all([
    OrganizerApplication.find(filter)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('applicantId', 'name email role accountStatus')
      .populate('reviewedBy', 'name email'),
    OrganizerApplication.countDocuments(filter),
  ]);

  return paginated(items, { page, limit, total });
}

export async function getApplication(id) {
  const application = await OrganizerApplication.findById(id)
    .populate('applicantId', 'name email role accountStatus createdAt')
    .populate('reviewedBy', 'name email');
  if (!application) throw ApiError.notFound('Application not found');
  return application;
}

/**
 * Approval. Everything here is one transaction: the application decision, the
 * role change, the show-runner profile and both audit rows land together or not
 * at all.
 *
 * Two safeguards against a double approval from concurrent reviewers: the
 * status is matched in the update filter (so the second update matches nothing)
 * and the whole thing runs under a transaction.
 *
 * Approval grants the role only. No theater is assigned here — that is a
 * separate request and a separate decision.
 */
export async function approveApplication(reviewer, id, { reviewNotes }, req) {
  const outcome = await withTransaction(async (session) => {
    const application = await OrganizerApplication.findOneAndUpdate(
      { _id: id, status: APPLICATION_STATUS.PENDING },
      {
        status: APPLICATION_STATUS.APPROVED,
        reviewedBy: reviewer._id,
        reviewedAt: new Date(),
        reviewNotes,
      },
      { new: true, ...withSession(session) },
    );

    if (!application) return { conflict: true };

    const applicant = await User.findById(application.applicantId).session(session ?? null);
    if (!applicant) throw ApiError.notFound('The applicant account no longer exists');

    const previousRole = applicant.role;
    if (applicant.role === ROLES.CUSTOMER) {
      applicant.role = ROLES.SHOW_RUNNER;
      // Force a fresh token so the new role is picked up on the next request.
      applicant.tokenVersion += 1;
      await applicant.save({ ...withSession(session) });
    }

    const profile = await ShowRunnerProfile.findOneAndUpdate(
      { userId: applicant._id },
      {
        $set: {
          applicationId: application._id,
          businessName: application.businessName,
          businessType: application.businessType,
          contactEmail: application.contactEmail,
          contactPhone: application.contactPhone,
          operatingCities: application.cities,
          status: SHOW_RUNNER_STATUS.ACTIVE,
          statusReason: undefined,
          approvedBy: reviewer._id,
          approvedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, ...withSession(session) },
    );

    await recordAudit(
      {
        actor: reviewer,
        action: AUDIT_ACTIONS.APPLICATION_APPROVED,
        resourceType: 'OrganizerApplication',
        resourceId: application._id,
        before: { status: APPLICATION_STATUS.PENDING },
        after: { status: APPLICATION_STATUS.APPROVED },
        reason: reviewNotes,
        req,
      },
      session,
    );

    if (previousRole !== applicant.role) {
      await recordAudit(
        {
          actor: reviewer,
          action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
          resourceType: 'User',
          resourceId: applicant._id,
          before: { role: previousRole },
          after: { role: applicant.role },
          req,
        },
        session,
      );
    }

    await enqueueNotification(
      {
        userId: applicant._id,
        type: NOTIFICATION_TYPES.APPLICATION_APPROVED,
        to: applicant.email,
        data: { name: applicant.name, businessName: application.businessName },
      },
      session,
    );

    return { application, profile };
  });

  if (outcome.conflict) throw await explainNotPending(id);
  return outcome;
}

export async function rejectApplication(reviewer, id, { rejectionReason, reviewNotes }, req) {
  const outcome = await withTransaction(async (session) => {
    const application = await OrganizerApplication.findOneAndUpdate(
      { _id: id, status: APPLICATION_STATUS.PENDING },
      {
        status: APPLICATION_STATUS.REJECTED,
        reviewedBy: reviewer._id,
        reviewedAt: new Date(),
        rejectionReason,
        reviewNotes,
      },
      { new: true, ...withSession(session) },
    );

    if (!application) return { conflict: true };

    const applicant = await User.findById(application.applicantId).session(session ?? null);

    await recordAudit(
      {
        actor: reviewer,
        action: AUDIT_ACTIONS.APPLICATION_REJECTED,
        resourceType: 'OrganizerApplication',
        resourceId: application._id,
        before: { status: APPLICATION_STATUS.PENDING },
        after: { status: APPLICATION_STATUS.REJECTED },
        reason: rejectionReason,
        req,
      },
      session,
    );

    if (applicant) {
      await enqueueNotification(
        {
          userId: applicant._id,
          type: NOTIFICATION_TYPES.APPLICATION_REJECTED,
          to: applicant.email,
          data: { name: applicant.name, reason: rejectionReason },
        },
        session,
      );
    }

    return { application };
  });

  if (outcome.conflict) throw await explainNotPending(id);
  return outcome;
}

/** Turns "the filter matched nothing" into a message that says why. */
async function explainNotPending(id) {
  const current = await OrganizerApplication.findById(id).select('status');
  if (!current) return ApiError.notFound('Application not found');
  return ApiError.conflict(
    `This application is already ${current.status}`,
    ERROR_CODES.APPLICATION_NOT_PENDING,
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
