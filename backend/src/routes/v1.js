import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { organizerApplicationsRouter } from '../modules/organizer-applications/applications.routes.js';
import { showRunnerRouter } from '../modules/show-runners/showRunners.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { publicMoviesRouter } from '../modules/movies/movies.routes.js';
import { publicShowsRouter, publicPlacesRouter } from '../modules/shows/shows.routes.js';
import { seatHoldsRouter } from '../modules/seat-holds/seatHolds.routes.js';
import { bookingsRouter } from '../modules/bookings/bookings.routes.js';
import { ticketsRouter } from '../modules/tickets/tickets.routes.js';

export const v1Router = Router();

v1Router.get('/', (_req, res) => {
  res.json({
    data: {
      name: 'CineReserve API',
      version: 'v1',
      phase: 'Phase 6 — operations console',
      namespaces: {
        public: ['/movies', '/shows', '/cities', '/theaters'],
        customer: ['/me/seat-holds', '/me/bookings', '/me/organizer-applications'],
        showRunner: ['/show-runner', '/tickets'],
        admin: ['/admin'],
      },
    },
  });
});

v1Router.use('/auth', authRouter);

// Public catalog and browsing. No authentication, published records only.
v1Router.use('/movies', publicMoviesRouter);
v1Router.use('/shows', publicShowsRouter);
v1Router.use('/', publicPlacesRouter);

v1Router.use('/me/seat-holds', seatHoldsRouter);
v1Router.use('/me/bookings', bookingsRouter);
v1Router.use('/tickets', ticketsRouter);
v1Router.use('/me/organizer-applications', organizerApplicationsRouter);
v1Router.use('/show-runner', showRunnerRouter);
v1Router.use('/admin', adminRouter);
