import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import * as service from './movies.service.js';
import {
  listMoviesSchema,
  movieSlugSchema,
} from './movies.validators.js';

/**
 * Public catalog. Only published movies are reachable here; drafts and
 * archived titles are invisible without the admin namespace.
 */
export const publicMoviesRouter = Router();

publicMoviesRouter.get(
  '/',
  validate({ query: listMoviesSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.listMovies(req.validatedQuery ?? {}, { publishedOnly: true }));
  }),
);

publicMoviesRouter.get(
  '/:slug',
  validate({ params: movieSlugSchema }),
  asyncHandler(async (req, res) => {
    const movie = await service.getMovie(req.params.slug, { publishedOnly: true });
    res.json({ data: { movie: movie.toPublicJSON() } });
  }),
);
