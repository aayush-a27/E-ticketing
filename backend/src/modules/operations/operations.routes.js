import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import * as service from './operations.service.js';
import {
  bookingIdSchema,
  financeSummarySchema,
  listBookingsSchema,
  listRefundsSchema,
} from './operations.validators.js';

/**
 * The operations console's read endpoints, mounted separately in the admin and
 * show-runner namespaces. The mount point supplies the role gates; the two
 * flags below decide what the same code is allowed to return.
 *
 * `scopeToTheaters` restricts every query to the caller's assigned venues, in
 * the database rather than afterwards. `canSeeCustomerContact` decides whether
 * a customer's email and phone are returned in full or masked.
 *
 * There is intentionally no endpoint here that writes. Confirming a booking,
 * marking a payment captured and issuing a refund all go through the verified
 * payment and cancellation pipelines; an administrator cannot shortcut them by
 * setting a status from a console.
 */
export function createOperationsRouter({ scopeToTheaters, canSeeCustomerContact }) {
  const router = Router();
  const options = { scoped: scopeToTheaters, canSeeCustomerContact };

  router.get(
    '/dashboard',
    asyncHandler(async (req, res) => {
      res.json({ data: await service.getDashboard(req.user, options) });
    }),
  );

  router.get(
    '/bookings',
    validate({ query: listBookingsSchema }),
    asyncHandler(async (req, res) => {
      res.json(await service.listBookings(req.user, req.validatedQuery ?? {}, options));
    }),
  );

  router.get(
    '/bookings/:id',
    validate({ params: bookingIdSchema }),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.getBooking(req.user, req.params.id, options) });
    }),
  );

  router.get(
    '/finance/summary',
    validate({ query: financeSummarySchema }),
    asyncHandler(async (req, res) => {
      res.json({
        data: { summary: await service.getFinanceSummary(req.user, req.validatedQuery ?? {}, options) },
      });
    }),
  );

  router.get(
    '/refunds',
    validate({ query: listRefundsSchema }),
    asyncHandler(async (req, res) => {
      res.json(await service.listRefunds(req.user, req.validatedQuery ?? {}, options));
    }),
  );

  return router;
}
