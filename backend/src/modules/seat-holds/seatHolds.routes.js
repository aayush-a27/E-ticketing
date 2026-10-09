import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { sensitiveLimiter } from '../../middleware/rateLimiter.js';
import { idempotent } from '../../middleware/idempotency.js';
import * as service from './seatHolds.service.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

const createHoldSchema = z.object({
  showId: objectId,
  seatIds: z.array(z.string().trim().min(1).max(20)).min(1, 'Select at least one seat').max(40),
});

const holdIdSchema = z.object({ id: objectId });

/**
 * Mounted at /api/v1/me/seat-holds. A hold always belongs to the customer who
 * created it, so every lookup is scoped by userId rather than trusting the id
 * in the path to imply ownership.
 */
export const seatHoldsRouter = Router();

seatHoldsRouter.use(authenticate);

seatHoldsRouter.post(
  '/',
  sensitiveLimiter,
  validate({ body: createHoldSchema }),
  // Not required, so the API stays usable without it, but a client that sends
  // one is protected from double submission.
  idempotent(),
  asyncHandler(async (req, res) => {
    const hold = await service.createHold(req.user, req.body.showId, req.body, req);
    res.status(201).json({ data: { hold: hold.toPublicJSON() } });
  }),
);

seatHoldsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const holds = await service.listMyHolds(req.user);
    res.json({ data: { holds: holds.map((hold) => hold.toPublicJSON()) } });
  }),
);

seatHoldsRouter.get(
  '/:id',
  validate({ params: holdIdSchema }),
  asyncHandler(async (req, res) => {
    const hold = await service.getHold(req.user, req.params.id);
    res.json({ data: { hold: hold.toPublicJSON() } });
  }),
);

seatHoldsRouter.delete(
  '/:id',
  validate({ params: holdIdSchema }),
  asyncHandler(async (req, res) => {
    const { hold } = await service.releaseHold(req.user, req.params.id, req);
    res.json({ data: { hold: hold.toPublicJSON() } });
  }),
);
