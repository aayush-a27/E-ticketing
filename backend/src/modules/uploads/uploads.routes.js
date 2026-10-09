import crypto from 'node:crypto';
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { sensitiveLimiter } from '../../middleware/rateLimiter.js';
import { getMediaProvider, ALLOWED_FORMATS, MAX_UPLOAD_BYTES } from '../../services/media/providers.js';
import { signUploadSchema } from '../movies/movies.validators.js';

const FOLDERS = {
  movie_poster: 'cinereserve/movies/posters',
  movie_backdrop: 'cinereserve/movies/backdrops',
  theater_image: 'cinereserve/theaters',
};

/**
 * Issues a signed, scoped upload ticket. The client uploads straight to the
 * provider with it; the API secret never leaves the server and no file passes
 * through this process.
 *
 * The signature covers the folder and public id, so a ticket issued for a
 * movie poster cannot be replayed to overwrite something else. The returned
 * publicId is then handed back to the resource's own media endpoint, which
 * verifies with the provider that the asset really exists before storing it.
 */
export const uploadsRouter = Router();

uploadsRouter.post(
  '/signature',
  sensitiveLimiter,
  validate({ body: signUploadSchema }),
  asyncHandler(async (req, res) => {
    const provider = getMediaProvider();
    const folder = FOLDERS[req.body.purpose];

    const publicId = `${folder}/${req.body.resourceId ?? 'new'}-${crypto.randomUUID()}`;
    const signed = provider.signUpload({ folder, publicId });

    res.json({
      data: {
        upload: signed,
        constraints: {
          allowedFormats: ALLOWED_FORMATS,
          maxBytes: MAX_UPLOAD_BYTES,
        },
      },
    });
  }),
);
