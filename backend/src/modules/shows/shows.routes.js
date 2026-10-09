import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
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

publicShowsRouter.get(
  '/:id/seats',
  validate({ params: showIdSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getSeatMap(req.params.id) });
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
