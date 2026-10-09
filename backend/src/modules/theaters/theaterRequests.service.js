import { TheaterRequest } from '../../models/TheaterRequest.js';
import { Theater } from '../../models/Theater.js';
import { ApiError } from '../../utils/ApiError.js';
import { AUDIT_ACTIONS, ERROR_CODES, REQUEST_STATUS } from '../../constants/index.js';
import { recordAudit } from '../../services/auditService.js';
import { withTransaction, withSession } from '../../utils/withTransaction.js';
import { resolvePagination, paginated } from '../../utils/pagination.js';
import { assignManager, createTheater } from './theaters.service.js';

export async function submitRequest(runner, payload, req) {
  if (payload.theaterId) {
    const theater = await Theater.findById(payload.theaterId);
    if (!theater) throw ApiError.notFound('Theater not found');
    if (theater.isManagedBy(runner._id)) {
      throw ApiError.conflict('You already manage this theater');
    }
  }

  let request;
  try {
    request = await TheaterRequest.create({
      requesterId: runner._id,
      theaterId: payload.theaterId,
      proposedTheater: payload.proposedTheater,
      justification: payload.justification,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw ApiError.conflict(
        'You already have a pending request for this theater',
        ERROR_CODES.CONFLICT,
      );
    }
    throw error;
  }

  await recordAudit({
    actor: runner,
    action: AUDIT_ACTIONS.THEATER_REQUEST_SUBMITTED,
    resourceType: 'TheaterRequest',
    resourceId: request._id,
    after: { theaterId: payload.theaterId ?? null },
    req,
  });

  return request;
}

export async function listMyRequests(runner) {
  return TheaterRequest.find({ requesterId: runner._id })
    .sort({ createdAt: -1 })
    .populate('theaterId', 'name cityLabel');
}

export async function listRequests(query) {
  const { page, limit, skip } = resolvePagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    TheaterRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('requesterId', 'name email role')
      .populate('theaterId', 'name cityLabel'),
    TheaterRequest.countDocuments(filter),
  ]);

  return paginated(items, { page, limit, total });
}

/**
 * Approving a request is what actually grants gate-4 access. For a claim on an
 * existing theater the runner is added to its managers; for a proposal the
 * theater is created first, then assigned. Either way it is one transaction.
 */
export async function approveRequest(admin, id, { decisionNotes }, req) {
  const outcome = await withTransaction(async (session) => {
    const request = await TheaterRequest.findOneAndUpdate(
      { _id: id, status: REQUEST_STATUS.PENDING },
      {
        status: REQUEST_STATUS.APPROVED,
        reviewedBy: admin._id,
        reviewedAt: new Date(),
        decisionNotes,
      },
      { new: true, ...withSession(session) },
    );

    if (!request) return { conflict: true };

    let theaterId = request.theaterId;

    if (!theaterId) {
      const proposed = request.proposedTheater;
      const theater = await createTheater(
        admin,
        {
          name: proposed.name,
          addressLine1: proposed.addressLine1,
          city: proposed.city,
          state: proposed.state,
          pincode: proposed.pincode,
          amenities: [],
        },
        req,
      );
      theaterId = theater._id;
      request.theaterId = theaterId;
      await request.save({ ...withSession(session) });
    }

    await recordAudit(
      {
        actor: admin,
        action: AUDIT_ACTIONS.THEATER_REQUEST_APPROVED,
        resourceType: 'TheaterRequest',
        resourceId: request._id,
        after: { theaterId: String(theaterId) },
        reason: decisionNotes,
        req,
      },
      session,
    );

    return { request, theaterId };
  });

  if (outcome.conflict) throw await explainNotPending(id);

  // Assignment runs its own validation (active runner, not already assigned)
  // and writes its own audit entry.
  const { theater } = await assignManager(
    admin,
    outcome.theaterId,
    { userId: outcome.request.requesterId, reason: decisionNotes ?? 'Theater request approved' },
    req,
  );

  return { request: outcome.request, theater };
}

export async function rejectRequest(admin, id, { decisionNotes }, req) {
  const request = await TheaterRequest.findOneAndUpdate(
    { _id: id, status: REQUEST_STATUS.PENDING },
    {
      status: REQUEST_STATUS.REJECTED,
      reviewedBy: admin._id,
      reviewedAt: new Date(),
      decisionNotes,
    },
    { new: true },
  );

  if (!request) throw await explainNotPending(id);

  await recordAudit({
    actor: admin,
    action: AUDIT_ACTIONS.THEATER_REQUEST_REJECTED,
    resourceType: 'TheaterRequest',
    resourceId: request._id,
    reason: decisionNotes,
    req,
  });

  return request;
}

async function explainNotPending(id) {
  const current = await TheaterRequest.findById(id).select('status');
  if (!current) return ApiError.notFound('Request not found');
  return ApiError.conflict(`This request is already ${current.status}`, ERROR_CODES.CONFLICT);
}
