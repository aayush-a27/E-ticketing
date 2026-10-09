import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { requireTheaterAccess, requireScreenAccess } from '../../middleware/requireTheaterAccess.js';
import * as service from './theaters.service.js';
import * as requests from './theaterRequests.service.js';
import {
  attachTheaterImageSchema,
  createLayoutSchema,
  createScreenSchema,
  createTheaterRequestSchema,
  listTheatersSchema,
  removeTheaterImageQuerySchema,
  screenIdSchema,
  screenVersionParamsSchema,
  theaterIdSchema,
  updateScreenSchema,
  updateTheaterSchema,
} from './theaters.validators.js';

/**
 * Mounted under /api/v1/show-runner, which already requires an authenticated,
 * active show runner. Every route that touches a specific venue additionally
 * passes through requireTheaterAccess or requireScreenAccess — gate 4.
 *
 * A show runner cannot create a theater: venues are assigned, not self-served.
 */
export const showRunnerTheatersRouter = Router();

showRunnerTheatersRouter.get(
  '/theaters',
  validate({ query: listTheatersSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.listTheaters(req.validatedQuery ?? {}, { user: req.user }));
  }),
);

showRunnerTheatersRouter.get(
  '/theaters/:theaterId',
  validate({ params: theaterIdSchema }),
  requireTheaterAccess(),
  asyncHandler(async (req, res) => {
    res.json({ data: { theater: req.theater } });
  }),
);

showRunnerTheatersRouter.patch(
  '/theaters/:theaterId',
  validate({ params: theaterIdSchema, body: updateTheaterSchema }),
  requireTheaterAccess(),
  asyncHandler(async (req, res) => {
    const theater = await service.updateTheater(req.user, req.theater, req.body, req);
    res.json({ data: { theater } });
  }),
);

// --- Theater images ---------------------------------------------------------
// A runner may illustrate a venue they manage, and only one they manage: gate
// 4 resolves the theater from the database before either handler runs.

showRunnerTheatersRouter.post(
  '/theaters/:theaterId/images',
  validate({ params: theaterIdSchema, body: attachTheaterImageSchema }),
  requireTheaterAccess(),
  asyncHandler(async (req, res) => {
    const theater = await service.attachTheaterImage(req.user, req.theater, req.body, req);
    res.status(201).json({ data: { theater } });
  }),
);

showRunnerTheatersRouter.delete(
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

showRunnerTheatersRouter.post(
  '/theater-requests',
  validate({ body: createTheaterRequestSchema }),
  asyncHandler(async (req, res) => {
    const request = await requests.submitRequest(req.user, req.body, req);
    res.status(201).json({ data: { request } });
  }),
);

showRunnerTheatersRouter.get(
  '/theater-requests',
  asyncHandler(async (req, res) => {
    res.json({ data: { requests: await requests.listMyRequests(req.user) } });
  }),
);

// --- Screens ----------------------------------------------------------------

showRunnerTheatersRouter.get(
  '/theaters/:theaterId/screens',
  validate({ params: theaterIdSchema }),
  requireTheaterAccess(),
  asyncHandler(async (req, res) => {
    res.json({ data: { screens: await service.listScreens(req.theater._id) } });
  }),
);

showRunnerTheatersRouter.post(
  '/theaters/:theaterId/screens',
  validate({ params: theaterIdSchema, body: createScreenSchema }),
  requireTheaterAccess(),
  asyncHandler(async (req, res) => {
    const screen = await service.createScreen(req.user, req.theater, req.body, req);
    res.status(201).json({ data: { screen } });
  }),
);

showRunnerTheatersRouter.patch(
  '/screens/:screenId',
  validate({ params: screenIdSchema, body: updateScreenSchema }),
  requireScreenAccess(),
  asyncHandler(async (req, res) => {
    const screen = await service.updateScreen(req.user, req.screen, req.body, req);
    res.json({ data: { screen } });
  }),
);

// --- Seat layouts -----------------------------------------------------------

showRunnerTheatersRouter.get(
  '/screens/:screenId/layouts',
  validate({ params: screenIdSchema }),
  requireScreenAccess(),
  asyncHandler(async (req, res) => {
    res.json({ data: { layouts: await service.listLayouts(req.screen._id) } });
  }),
);

showRunnerTheatersRouter.post(
  '/screens/:screenId/layouts',
  validate({ params: screenIdSchema, body: createLayoutSchema }),
  requireScreenAccess(),
  asyncHandler(async (req, res) => {
    const layout = await service.createLayout(req.user, req.screen, req.body, req);
    res.status(201).json({ data: { layout } });
  }),
);

showRunnerTheatersRouter.get(
  '/screens/:screenId/layouts/:version',
  validate({ params: screenVersionParamsSchema }),
  requireScreenAccess(),
  asyncHandler(async (req, res) => {
    const layout = await service.getLayout(req.screen._id, req.params.version);
    res.json({ data: { layout } });
  }),
);

showRunnerTheatersRouter.post(
  '/screens/:screenId/layouts/:version/activate',
  validate({ params: screenVersionParamsSchema }),
  requireScreenAccess(),
  asyncHandler(async (req, res) => {
    const { layout } = await service.activateLayout(req.user, req.screen, req.params.version, req);
    res.json({ data: { layout } });
  }),
);
