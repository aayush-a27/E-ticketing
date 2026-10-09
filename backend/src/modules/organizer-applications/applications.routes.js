import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sensitiveLimiter } from '../../middleware/rateLimiter.js';
import * as controller from './applications.controller.js';
import {
  applicationIdSchema,
  submitApplicationSchema,
} from './applications.validators.js';

/**
 * Customer-facing half of the workflow. Any signed-in user may apply; nothing
 * here grants a privilege, it only asks for one.
 */
export const organizerApplicationsRouter = Router();

organizerApplicationsRouter.use(authenticate);

organizerApplicationsRouter.post(
  '/',
  sensitiveLimiter,
  validate({ body: submitApplicationSchema }),
  controller.submit,
);
organizerApplicationsRouter.get('/', controller.listMine);
organizerApplicationsRouter.get(
  '/:id',
  validate({ params: applicationIdSchema }),
  controller.getMine,
);
organizerApplicationsRouter.post(
  '/:id/withdraw',
  validate({ params: applicationIdSchema }),
  controller.withdraw,
);
