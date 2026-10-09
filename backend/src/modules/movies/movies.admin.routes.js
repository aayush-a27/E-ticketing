import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import * as service from './movies.service.js';
import {
  attachMediaSchema,
  createMovieSchema,
  listMoviesSchema,
  mediaParamsSchema,
  movieIdSchema,
  updateMovieSchema,
} from './movies.validators.js';

/**
 * Mounted under /api/v1/admin, which already requires an authenticated super
 * admin. The platform catalog is deliberately not editable by show runners:
 * they schedule published movies, they do not create them.
 */
export const adminMoviesRouter = Router();

adminMoviesRouter.get(
  '/',
  validate({ query: listMoviesSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.listMovies(req.validatedQuery ?? {}));
  }),
);

adminMoviesRouter.post(
  '/',
  validate({ body: createMovieSchema }),
  asyncHandler(async (req, res) => {
    const movie = await service.createMovie(req.user, req.body, req);
    res.status(201).json({ data: { movie } });
  }),
);

adminMoviesRouter.get(
  '/:id',
  validate({ params: movieIdSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: { movie: await service.getMovie(req.params.id) } });
  }),
);

adminMoviesRouter.patch(
  '/:id',
  validate({ params: movieIdSchema, body: updateMovieSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: { movie: await service.updateMovie(req.user, req.params.id, req.body, req) } });
  }),
);

adminMoviesRouter.post(
  '/:id/publish',
  validate({ params: movieIdSchema }),
  asyncHandler(async (req, res) => {
    const { movie } = await service.publishMovie(req.user, req.params.id, req);
    res.json({ data: { movie } });
  }),
);

adminMoviesRouter.post(
  '/:id/unpublish',
  validate({ params: movieIdSchema }),
  asyncHandler(async (req, res) => {
    const { movie, affectedShows } = await service.unpublishMovie(req.user, req.params.id, req);
    res.json({ data: { movie, affectedShows } });
  }),
);

adminMoviesRouter.post(
  '/:id/archive',
  validate({ params: movieIdSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: { movie: await service.archiveMovie(req.user, req.params.id, req) } });
  }),
);

adminMoviesRouter.post(
  '/:id/media',
  validate({ params: movieIdSchema, body: attachMediaSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: { movie: await service.attachMedia(req.user, req.params.id, req.body, req) } });
  }),
);

adminMoviesRouter.delete(
  '/:id/media/:kind',
  validate({ params: mediaParamsSchema }),
  asyncHandler(async (req, res) => {
    const movie = await service.removeMedia(req.user, req.params.id, req.params.kind, req);
    res.json({ data: { movie } });
  }),
);
