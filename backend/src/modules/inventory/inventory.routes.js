import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { ERROR_CODES, ROLES } from '../../constants/index.js';
import { Show } from '../../models/Show.js';
import { Theater } from '../../models/Theater.js';
import * as service from './inventory.service.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

const showIdSchema = z.object({ showId: objectId });
const seatParamsSchema = z.object({ showId: objectId, seatId: z.string().trim().min(1).max(20) });
const blockSchema = z.object({
  reason: z.string().trim().min(3, 'Record why this seat is out of sale').max(200),
});

/**
 * Loads a show and checks that the caller manages the theater it runs in —
 * resolved from the screen's own theater, never from an id in the request.
 */
async function loadManagedShow(req) {
  const show = await Show.findById(req.params.showId);
  if (!show) throw ApiError.notFound('Show not found');

  if (req.user.role !== ROLES.SUPER_ADMIN) {
    const theater = await Theater.findById(show.theaterId);
    if (!theater?.isManagedBy(req.user._id)) {
      throw ApiError.forbidden('You do not manage this theater', ERROR_CODES.NOT_THEATER_MANAGER);
    }
  }

  return show;
}

/**
 * Inventory management for a show. Mounted inside both the show-runner and
 * admin namespaces, which supply the role gates.
 */
export function createInventoryRouter() {
  const router = Router();

  router.get(
    '/:showId/inventory',
    validate({ params: showIdSchema }),
    asyncHandler(async (req, res) => {
      const show = await loadManagedShow(req);
      res.json({ data: { summary: await service.getInventorySummary(show._id) } });
    }),
  );

  router.get(
    '/:showId/seats',
    validate({ params: showIdSchema }),
    asyncHandler(async (req, res) => {
      const show = await loadManagedShow(req);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ data: await service.getSeatAvailability(show) });
    }),
  );

  // Takes a seat out of sale — a broken recliner, a distancing gap. Refused if
  // the seat is held or sold, since that would strand a paying customer.
  router.post(
    '/:showId/seats/:seatId/block',
    validate({ params: seatParamsSchema, body: blockSchema }),
    asyncHandler(async (req, res) => {
      const show = await loadManagedShow(req);
      const seat = await service.setSeatBlocked(
        req.user,
        show,
        req.params.seatId,
        { blocked: true, reason: req.body.reason },
        req,
      );
      res.json({ data: { seat } });
    }),
  );

  router.post(
    '/:showId/seats/:seatId/unblock',
    validate({ params: seatParamsSchema }),
    asyncHandler(async (req, res) => {
      const show = await loadManagedShow(req);
      const seat = await service.setSeatBlocked(
        req.user,
        show,
        req.params.seatId,
        { blocked: false, reason: 'Returned to sale' },
        req,
      );
      res.json({ data: { seat } });
    }),
  );

  return router;
}
