import express, { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ERROR_CODES } from '../../constants/index.js';
import { handleWebhook } from './payments.service.js';
import { logger } from '../../utils/logger.js';

/**
 * No session, no rate limiter keyed to a user, and crucially no JSON parser:
 * the signature is computed over the exact bytes the gateway sent, so the body
 * must stay raw. express.json() would reserialize it and every signature would
 * fail.
 *
 * Mounted before the global JSON parser in app.js for the same reason.
 */
export const webhooksRouter = Router();

webhooksRouter.post(
  '/razorpay',
  express.raw({ type: '*/*', limit: '1mb' }),
  asyncHandler(async (req, res) => {
    const signature = req.get('x-razorpay-signature');
    if (!signature) {
      throw new ApiError(400, ERROR_CODES.SIGNATURE_INVALID, 'Missing webhook signature');
    }

    const result = await handleWebhook({
      rawBody: req.body,
      signature,
      provider: 'razorpay',
    });

    logger.info(
      { eventId: result.eventId, outcome: result.outcome, duplicate: result.duplicate },
      'Webhook processed',
    );

    // 200 on a duplicate too: the gateway should stop retrying something we
    // have already dealt with.
    res.status(200).json({ data: { received: true, outcome: result.outcome } });
  }),
);
