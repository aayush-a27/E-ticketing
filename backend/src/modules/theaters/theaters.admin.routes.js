import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { requireTheaterAccess, requireScreenAccess } from '../../middleware/requireTheaterAccess.js';
import * as service from './theaters.service.js';
import * as requests from './theaterRequests.service.js';
import {
  assignManagerSchema,
  attachTheaterImageSchema,
  createLayoutSchema,
  createScreenSchema,
  createTheaterSchema,
  idSchema,
  listTheatersSchema,
  rejectTheaterRequestSchema,
  reviewTheaterRequestSchema,
  screenIdSchema,
  screenVersionParamsSchema,
  theaterIdSchema,
  removeTheaterImageQuerySchema,
  updateScreenSchema,
  updateTheaterSchema,
} from './theaters.validators.js';

/** Mounted under /api/v1/admin — super admin only, platform-wide. */
export const adminTheatersRouter = Router();

adminTheatersRouter.get(
  '/theaters',
  validate({ query: listTheatersSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.listTheaters(req.validatedQuery ?? {}));
  }),
);

adminTheatersRouter.post(
  '/theaters',
  validate({ body: createTheaterSchema }),
  asyncHandler(async (req, res) => {
    const theater = await service.createTheater(req.user, req.body, req);
    res.status(201).json({ data: { theater } });
  }),
);

adminTheatersRouter.get(
  '/theaters/:theaterId',
  validate({ params: theaterIdSchema }),
  requireTheaterAccess(),
  asyncHandler(async (req, res) => {
    res.json({ data: { theater: req.theater } });
  }),
);

adminTheatersRouter.patch(
  '/theaters/:theaterId',
  validate({ params: theaterIdSchema, body: updateTheaterSchema }),
  requireTheaterAccess(),
  asyncHandler(async (req, res) => {
    res.json({ data: { theater: await service.updateTheater(req.user, req.theater, req.body, req) } });
  }),
);

adminTheatersRouter.post(
  '/theaters/:theaterId/managers',
  validate({ params: theaterIdSchema, body: assignManagerSchema }),
  asyncHandler(async (req, res) => {
    const { theater } = await service.assignManager(req.user, req.params.theaterId, req.body, req);
    res.json({ data: { theater } });
  }),
);

adminTheatersRouter.delete(
  '/theaters/:theaterId/managers/:id',
  validate({ params: theaterIdSchema.merge(idSchema) }),
  asyncHandler(async (req, res) => {
    const theater = await service.removeManager(
      req.user,
      req.params.theaterId,
      req.params.id,
      req.body?.reason ?? 'Removed by platform admin',
      req,
    );
    res.json({ data: { theater } });
  }),
);

// --- Screens and layouts ----------------------------------------------------

adminTheatersRouter.get(
  '/theaters/:theaterId/screens',
  validate({ params: theaterIdSchema }),
  requireTheaterAccess(),
  asyncHandler(async (req, res) => {
    res.json({ data: { screens: await service.listScreens(req.theater._id) } });
  }),
);

adminTheatersRouter.post(
  '/theaters/:theaterId/screens',
  validate({ params: theaterIdSchema, body: createScreenSchema }),
  requireTheaterAccess(),
  asyncHandler(async (req, res) => {
    const screen = await service.createScreen(req.user, req.theater, req.body, req);
    res.status(201).json({ data: { screen } });
  }),
);

adminTheatersRouter.patch(
  '/screens/:screenId',
  validate({ params: screenIdSchema, body: updateScreenSchema }),
  requireScreenAccess(),
  asyncHandler(async (req, res) => {
    res.json({ data: { screen: await service.updateScreen(req.user, req.screen, req.body, req) } });
  }),
);

adminTheatersRouter.post(
  '/screens/:screenId/layouts',
  validate({ params: screenIdSchema, body: createLayoutSchema }),
  requireScreenAccess(),
  asyncHandler(async (req, res) => {
    const layout = await service.createLayout(req.user, req.screen, req.body, req);
    res.status(201).json({ data: { layout } });
  }),
);

/**
 * Reading and activating a layout previously existed only in the show-runner
 * namespace, so a super admin could create a seat map and then neither list it
 * nor switch to it. The guards are the same as the create route's.
 */
adminTheatersRouter.get(
  '/screens/:screenId/layouts',
  validate({ params: screenIdSchema }),
  requireScreenAccess(),
  asyncHandler(async (req, res) => {
    res.json({ data: { layouts: await service.listLayouts(req.screen._id) } });
  }),
);

adminTheatersRouter.get(
  '/screens/:screenId/layouts/:version',
  validate({ params: screenVersionParamsSchema }),
  requireScreenAccess(),
  asyncHandler(async (req, res) => {
    res.json({ data: { layout: await service.getLayout(req.screen._id, req.params.version) } });
  }),
);

adminTheatersRouter.post(
  '/screens/:screenId/layouts/:version/activate',
  validate({ params: screenVersionParamsSchema }),
  requireScreenAccess(),
  asyncHandler(async (req, res) => {
    const { layout } = await service.activateLayout(req.user, req.screen, req.params.version, req);
    res.json({ data: { layout } });
  }),
);

// --- Theater images ---------------------------------------------------------

adminTheatersRouter.post(
  '/theaters/:theaterId/images',
  validate({ params: theaterIdSchema, body: attachTheaterImageSchema }),
  requireTheaterAccess(),
  asyncHandler(async (req, res) => {
    const theater = await service.attachTheaterImage(req.user, req.theater, req.body, req);
    res.status(201).json({ data: { theater } });
  }),
);

adminTheatersRouter.delete(
  '/theaters/:theaterId/images',
  validate({ params: theaterIdSchema, query: removeTheaterImageQuerySchema }),
  requireTheaterAccess(),
  asyncHandler(async (req, res) => {
    const theater = await service.removeTheaterImage(
      req.user,
      req.theater,
      req.validatedQuery.publicId,
      req,
    );
    res.json({ data: { theater } });
  }),
);

// --- Theater assignment requests -------------------------------------------

adminTheatersRouter.get(
  '/theater-requests',
  asyncHandler(async (req, res) => {
    res.json(await requests.listRequests(req.query ?? {}));
  }),
);

adminTheatersRouter.post(
  '/theater-requests/:id/approve',
  validate({ params: idSchema, body: reviewTheaterRequestSchema }),
  asyncHandler(async (req, res) => {
    const result = await requests.approveRequest(req.user, req.params.id, req.body, req);
    res.json({ data: result });
  }),
);

adminTheatersRouter.post(
  '/theater-requests/:id/reject',
  validate({ params: idSchema, body: rejectTheaterRequestSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: { request: await requests.rejectRequest(req.user, req.params.id, req.body, req) } });
  }),
);
