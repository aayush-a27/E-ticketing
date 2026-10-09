import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireSuperAdmin } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './admin.service.js';
import * as applications from '../organizer-applications/applications.controller.js';
import {
  applicationIdSchema,
  approveSchema,
  listApplicationsSchema,
  rejectSchema,
} from '../organizer-applications/applications.validators.js';
import {
  listAuditSchema,
  listShowRunnersSchema,
  listUsersSchema,
  updateShowRunnerStatusSchema,
  updateUserStatusSchema,
  userIdSchema,
} from './admin.validators.js';
import { adminMoviesRouter } from '../movies/movies.admin.routes.js';
import { adminTheatersRouter } from '../theaters/theaters.admin.routes.js';
import { createShowsManagementRouter } from '../shows/shows.manage.routes.js';
import { createInventoryRouter } from '../inventory/inventory.routes.js';
import { uploadsRouter } from '../uploads/uploads.routes.js';
import { createOperationsRouter } from '../operations/operations.routes.js';
import { settingsRouter } from './settings.routes.js';

export const adminRouter = Router();

/**
 * Both guards, on the whole namespace. The path prefix is organizational; this
 * pair is what actually keeps everyone else out.
 */
adminRouter.use(authenticate, requireSuperAdmin);

// --- Organizer applications -------------------------------------------------
adminRouter.get(
  '/organizer-applications',
  validate({ query: listApplicationsSchema }),
  applications.adminList,
);
adminRouter.get(
  '/organizer-applications/:id',
  validate({ params: applicationIdSchema }),
  applications.adminGet,
);
adminRouter.post(
  '/organizer-applications/:id/approve',
  validate({ params: applicationIdSchema, body: approveSchema }),
  applications.adminApprove,
);
adminRouter.post(
  '/organizer-applications/:id/reject',
  validate({ params: applicationIdSchema, body: rejectSchema }),
  applications.adminReject,
);

// --- Users ------------------------------------------------------------------
adminRouter.get(
  '/users',
  validate({ query: listUsersSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.listUsers(req.validatedQuery ?? {}));
  }),
);

adminRouter.get(
  '/users/:id',
  validate({ params: userIdSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getUser(req.user, req.params.id) });
  }),
);

adminRouter.patch(
  '/users/:id/status',
  validate({ params: userIdSchema, body: updateUserStatusSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.updateUserStatus(req.user, req.params.id, req.body, req) });
  }),
);

// --- Show runners -----------------------------------------------------------
adminRouter.get(
  '/show-runners',
  validate({ query: listShowRunnersSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.listShowRunners(req.validatedQuery ?? {}));
  }),
);

adminRouter.patch(
  '/show-runners/:id/status',
  validate({ params: userIdSchema, body: updateShowRunnerStatusSchema }),
  asyncHandler(async (req, res) => {
    res.json({
      data: await service.updateShowRunnerStatus(req.user, req.params.id, req.body, req),
    });
  }),
);

// --- Audit ------------------------------------------------------------------
adminRouter.get(
  '/audit-logs',
  validate({ query: listAuditSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.listAuditLogs(req.validatedQuery ?? {}));
  }),
);

// --- Catalog, venues and scheduling ----------------------------------------
// The super admin has platform-wide reach: no theater scoping is applied.
/**
 * Bookings, dashboard counters and financial totals, platform-wide and with
 * customer contact details in full. Read-only: there is no endpoint here that
 * can confirm a booking or move money.
 */
adminRouter.use('/', createOperationsRouter({ scopeToTheaters: false, canSeeCustomerContact: true }));

adminRouter.use('/movies', adminMoviesRouter);
adminRouter.use('/uploads', uploadsRouter);
adminRouter.use('/settings', settingsRouter);
adminRouter.use('/shows', createInventoryRouter());
adminRouter.use('/shows', createShowsManagementRouter({ scopeToUser: false }));
adminRouter.use('/', adminTheatersRouter);
