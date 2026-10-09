import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireActiveShowRunner } from '../../middleware/authorize.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ShowRunnerProfile } from '../../models/ShowRunnerProfile.js';
import { Theater } from '../../models/Theater.js';
import { ApiError } from '../../utils/ApiError.js';
import { showRunnerTheatersRouter } from '../theaters/theaters.showRunner.routes.js';
import { createShowsManagementRouter } from '../shows/shows.manage.routes.js';
import { createInventoryRouter } from '../inventory/inventory.routes.js';

/**
 * Everything under here requires an authenticated, active show runner (gates
 * 1 to 3). Routes that touch a specific venue add gate 4 on top.
 */
export const showRunnerRouter = Router();

showRunnerRouter.use(authenticate, requireActiveShowRunner);

showRunnerRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = await ShowRunnerProfile.findOne({ userId: req.user._id });
    if (!profile) throw ApiError.notFound('No show runner profile for this account');

    // Venue assignment is a separate grant: an approved runner starts with
    // none and must request one.
    const assignedTheaters = await Theater.find({ managers: req.user._id }).select(
      'name slug cityLabel status',
    );

    res.json({
      data: {
        profile,
        assignedTheaters,
        onboarding: { needsTheaterAssignment: assignedTheaters.length === 0 },
      },
    });
  }),
);

showRunnerRouter.use('/', showRunnerTheatersRouter);
showRunnerRouter.use('/shows', createInventoryRouter());
showRunnerRouter.use('/shows', createShowsManagementRouter({ scopeToUser: true }));
