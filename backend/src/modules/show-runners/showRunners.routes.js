import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireActiveShowRunner } from '../../middleware/authorize.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ShowRunnerProfile } from '../../models/ShowRunnerProfile.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Phase 2 ships only the profile endpoint. Theaters, screens, shows and
 * analytics arrive in Phase 3 behind these same two guards plus the venue
 * ownership check.
 */
export const showRunnerRouter = Router();

showRunnerRouter.use(authenticate, requireActiveShowRunner);

showRunnerRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = await ShowRunnerProfile.findOne({ userId: req.user._id });
    if (!profile) throw ApiError.notFound('No show runner profile for this account');

    res.json({
      data: {
        profile,
        // Venue assignment is a separate grant: an approved runner starts with
        // none and must request one.
        assignedTheaters: [],
        onboarding: { needsTheaterAssignment: true },
      },
    });
  }),
);
