import { z } from 'zod';
import {
  ACCOUNT_STATUS_VALUES,
  ROLE_VALUES,
  SHOW_RUNNER_STATUS_VALUES,
} from '../../constants/index.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const userIdSchema = z.object({ id: objectId });

export const listUsersSchema = z.object({
  role: z.enum(ROLE_VALUES).optional(),
  accountStatus: z.enum(ACCOUNT_STATUS_VALUES).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const updateUserStatusSchema = z.object({
  accountStatus: z.enum(ACCOUNT_STATUS_VALUES),
  reason: z.string().trim().min(5, 'Record why').max(2000),
});

export const updateShowRunnerStatusSchema = z.object({
  status: z.enum(SHOW_RUNNER_STATUS_VALUES),
  reason: z.string().trim().min(5, 'Record why').max(2000),
});

/**
 * Was previously missing, so `page` and `limit` reached the query unvalidated.
 */
export const listShowRunnersSchema = z.object({
  status: z.enum(SHOW_RUNNER_STATUS_VALUES).optional(),
  search: z.string().trim().max(120).optional(),
  assigned: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const listAuditSchema = z.object({
  action: z.string().trim().max(80).optional(),
  actorId: objectId.optional(),
  resourceType: z.string().trim().max(60).optional(),
  resourceId: objectId.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
