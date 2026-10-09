import { AuditLog } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

/**
 * Records a privileged change. Pass `session` to write it inside the same
 * transaction as the change itself — for approvals and role changes that is
 * mandatory, so the log cannot drift from reality.
 */
export async function recordAudit(
  { actor, action, resourceType, resourceId, before, after, reason, req },
  session = undefined,
) {
  const entry = {
    actorId: actor?._id ?? actor?.id ?? null,
    actorRole: actor?.role ?? null,
    action,
    resourceType,
    resourceId,
    before,
    after,
    reason,
    ip: req?.ip,
    userAgent: req?.get?.('user-agent')?.slice(0, 400),
    requestId: req?.id,
  };

  try {
    const docs = await AuditLog.create([entry], session ? { session } : {});
    return docs[0];
  } catch (error) {
    // Inside a transaction a failure must surface; outside one, losing an audit
    // row should not take the request down with it.
    if (session) throw error;
    logger.error({ err: error, action }, 'Failed to write audit log');
    return null;
  }
}
