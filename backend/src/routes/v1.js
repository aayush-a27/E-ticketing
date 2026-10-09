import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { organizerApplicationsRouter } from '../modules/organizer-applications/applications.routes.js';
import { showRunnerRouter } from '../modules/show-runners/showRunners.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';

export const v1Router = Router();

v1Router.get('/', (_req, res) => {
  res.json({
    data: {
      name: 'CineReserve API',
      version: 'v1',
      phase: 'Phase 2 — foundation and access control',
      namespaces: ['/auth', '/me/organizer-applications', '/show-runner', '/admin'],
    },
  });
});

v1Router.use('/auth', authRouter);
v1Router.use('/me/organizer-applications', organizerApplicationsRouter);
v1Router.use('/show-runner', showRunnerRouter);
v1Router.use('/admin', adminRouter);
