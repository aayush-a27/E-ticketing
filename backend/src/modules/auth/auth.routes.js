import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authLimiter, sensitiveLimiter } from '../../middleware/rateLimiter.js';
import * as controller from './auth.controller.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from './auth.validators.js';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate({ body: registerSchema }), controller.register);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
authRouter.post('/refresh', sensitiveLimiter, controller.refresh);
authRouter.post('/logout', controller.logout);

authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  controller.forgotPassword,
);
authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  controller.resetPassword,
);

authRouter.get('/me', authenticate, controller.me);
authRouter.patch(
  '/me',
  authenticate,
  validate({ body: updateProfileSchema }),
  controller.updateProfile,
);
authRouter.post(
  '/change-password',
  authenticate,
  sensitiveLimiter,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);
authRouter.post('/logout-all', authenticate, controller.logoutAll);
