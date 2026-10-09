import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { optionalAuthenticate } from '../../middleware/authenticate.js';
import * as service from './shows.service.js';
import * as theaters from '../theaters/theaters.service.js';
import { listShowsSchema, priceQuoteSchema, showIdSchema } from './shows.validators.js';
import { listTheatersSchema } from '../theaters/theaters.validators.js';

/**
 * Public browsing. Everything here reads from the platform's own database —
 * no external showtime source, and nothing that is not published.
 */
export const publicShowsRouter = Router();

publicShowsRouter.get(
  '/',
  validate({ query: listShowsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.listShows(req.validatedQuery ?? {}, { publicOnly: true }));
  }),
);

publicShowsRouter.get(
  '/:id',
  validate({ params: showIdSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: { show: await service.getShow(req.params.id, { publicOnly: true }) } });
  }),
);

/**
 * Live seat availability. Open to anonymous browsing; a signed-in customer
 * additionally gets `heldByYou` so the client can keep its own selection
 * highlighted after a refresh.
 */
publicShowsRouter.get(
  '/:id/seats',
  optionalAuthenticate,
  validate({ params: showIdSchema }),
  asyncHandler(async (req, res) => {
    // Availability changes by the second; never let a cache answer this.
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: await service.getSeatMap(req.params.id, { userId: req.user?._id ?? null }) });
  }),
);

/**
 * A quote, computed from the show's price table and the platform's fee and tax
 * settings. The client sends seat ids and gets back what it would owe; it
 * never sends an amount.
 */
publicShowsRouter.post(
  '/:id/price-quote',
  validate({ params: showIdSchema, body: priceQuoteSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: { quote: await service.quotePrice(req.params.id, req.body.seatIds) } });
  }),
);

// --- Cities and theaters, for browsing -------------------------------------

export const publicPlacesRouter = Router();

publicPlacesRouter.get(
  '/cities',
  asyncHandler(async (_req, res) => {
    res.json({ data: { cities: await theaters.listCities() } });
  }),
);

publicPlacesRouter.get(
  '/theaters',
  validate({ query: listTheatersSchema }),
  asyncHandler(async (req, res) => {
    res.json(await theaters.listTheaters(req.validatedQuery ?? {}, { publicOnly: true }));
  }),
);
