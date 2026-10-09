import { z } from 'zod';
import {
  BOOKING_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
  REFUND_STATUS_VALUES,
} from '../../constants/index.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const bookingIdSchema = z.object({ id: objectId });

/**
 * A booking reference as printed on a ticket. Stored uppercase, so a counter
 * clerk typing lowercase still finds it.
 */
const reference = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,20}$/, 'A reference is letters and digits only');

export const listBookingsSchema = z
  .object({
    status: z.enum(BOOKING_STATUS_VALUES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUS_VALUES).optional(),
    reference: reference.optional(),
    theaterId: objectId.optional(),
    movieId: objectId.optional(),
    showId: objectId.optional(),
    userId: objectId.optional(),
    /**
     * Only honoured for a caller allowed to see customer contact details. A
     * show runner asking for it is refused rather than quietly ignored, so the
     * restriction is visible instead of looking like a broken filter.
     */
    customerEmail: z.string().trim().toLowerCase().email().max(254).optional(),
    city: z.string().trim().max(80).optional(),
    admitted: z.enum(['true', 'false']).optional(),
    /** Which date `from` and `to` apply to. */
    dateField: z.enum(['created', 'showtime']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sort: z.enum(['-createdAt', 'createdAt', '-startAt', 'startAt', '-amount', 'amount']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine((value) => !(value.from && value.to) || value.from <= value.to, {
    path: ['to'],
    message: 'The end of the range must not be before its start',
  });

export const financeSummarySchema = z
  .object({
    theaterId: objectId.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((value) => !(value.from && value.to) || value.from <= value.to, {
    path: ['to'],
    message: 'The end of the range must not be before its start',
  });

export const listRefundsSchema = z.object({
  status: z.enum(REFUND_STATUS_VALUES).optional(),
  reason: z.enum(['cancellation', 'show_cancelled', 'unfulfillable', 'manual']).optional(),
  theaterId: objectId.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
