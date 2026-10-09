import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { sensitiveLimiter } from '../../middleware/rateLimiter.js';
import { idempotent } from '../../middleware/idempotency.js';
import { BOOKING_STATUS_VALUES } from '../../constants/index.js';
import * as bookings from './bookings.service.js';
import * as payments from '../payments/payments.service.js';
import * as cancellations from '../cancellations/cancellations.service.js';
import { listRefundsForBooking } from '../refunds/refunds.service.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

const bookingIdSchema = z.object({ id: objectId });

const createBookingSchema = z.object({ holdId: objectId });

/**
 * The gateway's callback payload. No amount: the server already knows what the
 * booking costs and will not take a figure from the browser.
 */
const verifySchema = z.object({
  orderId: z.string().trim().min(1).max(120),
  paymentId: z.string().trim().min(1).max(120),
  signature: z.string().trim().min(16).max(256),
});

const listBookingsSchema = z.object({
  scope: z.enum(['upcoming', 'past']).optional(),
  status: z.enum(BOOKING_STATUS_VALUES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const cancelSchema = z.object({
  seatIds: z.array(z.string().trim().min(1).max(20)).max(40).optional(),
  reason: z.string().trim().min(3, 'Tell us why').max(1000),
});

/** Mounted at /api/v1/me/bookings — always scoped to the signed-in customer. */
export const bookingsRouter = Router();

bookingsRouter.use(authenticate);

bookingsRouter.post(
  '/',
  sensitiveLimiter,
  validate({ body: createBookingSchema }),
  idempotent(),
  asyncHandler(async (req, res) => {
    const { booking, reused } = await bookings.createBooking(req.user, req.body, req);
    res.status(reused ? 200 : 201).json({ data: { booking: booking.toPublicJSON() } });
  }),
);

bookingsRouter.get(
  '/',
  validate({ query: listBookingsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await bookings.listOwnBookings(req.user, req.validatedQuery ?? {}));
  }),
);

bookingsRouter.get(
  '/:id',
  validate({ params: bookingIdSchema }),
  asyncHandler(async (req, res) => {
    const booking = await bookings.getOwnBooking(req.user, req.params.id);
    res.json({ data: { booking: booking.toPublicJSON() } });
  }),
);

// --- Payment ----------------------------------------------------------------

bookingsRouter.post(
  '/:id/payments',
  sensitiveLimiter,
  validate({ params: bookingIdSchema }),
  idempotent(),
  asyncHandler(async (req, res) => {
    const { payment, booking, publicKey } = await payments.initiatePayment(
      req.user,
      req.params.id,
      req,
    );
    res.json({
      data: {
        order: {
          orderId: payment.orderId,
          amountPaise: payment.amountPaise,
          currency: payment.currency,
        },
        // Publishable key only; the secret never leaves the server.
        publicKey,
        booking: { id: String(booking._id), reference: booking.reference },
      },
    });
  }),
);

bookingsRouter.post(
  '/:id/payments/verify',
  sensitiveLimiter,
  validate({ params: bookingIdSchema, body: verifySchema }),
  asyncHandler(async (req, res) => {
    const { booking, outcome } = await payments.verifyPayment(
      req.user,
      req.params.id,
      req.body,
      req,
    );
    res.json({ data: { booking: booking.toPublicJSON(), outcome } });
  }),
);

bookingsRouter.get(
  '/:id/payments',
  validate({ params: bookingIdSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: { payments: await payments.listPaymentsForBooking(req.user, req.params.id) } });
  }),
);

// --- Ticket -----------------------------------------------------------------

bookingsRouter.get(
  '/:id/ticket',
  validate({ params: bookingIdSchema }),
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: await bookings.getTicket(req.user, req.params.id) });
  }),
);

// --- Cancellation and refunds ----------------------------------------------

bookingsRouter.get(
  '/:id/cancellation-quote',
  validate({ params: bookingIdSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: { quote: await cancellations.quoteCancellation(req.user, req.params.id) } });
  }),
);

bookingsRouter.post(
  '/:id/cancellations',
  sensitiveLimiter,
  validate({ params: bookingIdSchema, body: cancelSchema }),
  idempotent(),
  asyncHandler(async (req, res) => {
    const { booking, cancellation, refund } = await cancellations.cancelBooking(
      req.user,
      req.params.id,
      req.body,
      req,
    );
    res.json({
      data: {
        booking: booking.toPublicJSON(),
        cancellation,
        refund: refund
          ? { id: String(refund._id), amountPaise: refund.amountPaise, status: refund.status }
          : null,
      },
    });
  }),
);

bookingsRouter.get(
  '/:id/refunds',
  validate({ params: bookingIdSchema }),
  asyncHandler(async (req, res) => {
    await bookings.getOwnBooking(req.user, req.params.id);
    const refunds = await listRefundsForBooking(req.params.id);
    res.json({
      data: {
        refunds: refunds.map((refund) => ({
          id: String(refund._id),
          amountPaise: refund.amountPaise,
          status: refund.status,
          reason: refund.reason,
          processedAt: refund.processedAt ?? null,
          createdAt: refund.createdAt,
        })),
      },
    });
  }),
);
