import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import * as service from './shows.service.js';
import {
  cancelShowSchema,
  createShowSchema,
  listShowsSchema,
  showIdSchema,
  updateShowSchema,
} from './shows.validators.js';

/**
 * Show management, shared by the show-runner and admin namespaces. The mount
 * point supplies the role gates; ownership is checked per show inside the
 * service, against the theater the screen belongs to.
 *
 * `scopeToUser` is what keeps a show runner's list to their own venues while
 * the super admin sees everything.
 */
export function createShowsManagementRouter({ scopeToUser }) {
  const router = Router();

  router.get(
    '/',
    validate({ query: listShowsSchema }),
    asyncHandler(async (req, res) => {
      res.json(
        await service.listShows(req.validatedQuery ?? {}, {
          user: scopeToUser ? req.user : null,
        }),
      );
    }),
  );

  router.post(
    '/',
    validate({ body: createShowSchema }),
    asyncHandler(async (req, res) => {
      const show = await service.createShow(req.user, req.body, req);
      res.status(201).json({ data: { show } });
    }),
  );

  router.get(
    '/:id',
    validate({ params: showIdSchema }),
    asyncHandler(async (req, res) => {
      res.json({ data: { show: await service.getShow(req.params.id) } });
    }),
  );

  router.patch(
    '/:id',
    validate({ params: showIdSchema, body: updateShowSchema }),
    asyncHandler(async (req, res) => {
      res.json({ data: { show: await service.updateShow(req.user, req.params.id, req.body, req) } });
    }),
  );

  router.post(
    '/:id/publish',
    validate({ params: showIdSchema }),
    asyncHandler(async (req, res) => {
      const { show } = await service.publishShow(req.user, req.params.id, req);
      res.json({ data: { show } });
    }),
  );

  router.post(
    '/:id/cancel',
    validate({ params: showIdSchema, body: cancelShowSchema }),
    asyncHandler(async (req, res) => {
      const { show, seatsToRefund } = await service.cancelShow(
        req.user,
        req.params.id,
        req.body,
        req,
      );
      res.json({ data: { show, seatsToRefund } });
    }),
  );

  return router;
}
