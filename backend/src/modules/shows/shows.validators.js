import { z } from 'zod';
import { SCREEN_FORMATS, SHOW_STATUS_VALUES } from '../../constants/index.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const showIdSchema = z.object({ id: objectId });

const pricingSchema = z
  .array(
    z.object({
      category: z.string().trim().min(1).max(40),
      // Up to ₹10,000 a seat. Prices are always in paise.
      basePaise: z.number().int().min(0).max(1_000_000),
    }),
  )
  .min(1, 'Price every seat category');

export const createShowSchema = z
  .object({
    movieId: objectId,
    screenId: objectId,
    startAt: z.coerce.date(),
    language: z.string().trim().min(1).max(40),
    format: z.enum(SCREEN_FORMATS),
    pricing: pricingSchema,
    bookingOpensAt: z.coerce.date().optional(),
    bookingClosesAt: z.coerce.date().optional(),
    // Gap after the film ends before the screen is free again.
    cleanupMinutes: z.number().int().min(0).max(120).default(15),
  })
  .superRefine((value, ctx) => {
    if (value.startAt.getTime() <= Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startAt'],
        message: 'A show must start in the future',
      });
    }
    if (value.bookingOpensAt && value.bookingOpensAt > value.startAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bookingOpensAt'],
        message: 'Booking cannot open after the show starts',
      });
    }
    if (value.bookingClosesAt && value.bookingClosesAt > value.startAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bookingClosesAt'],
        message: 'Booking cannot close after the show starts',
      });
    }
    if (
      value.bookingOpensAt &&
      value.bookingClosesAt &&
      value.bookingOpensAt >= value.bookingClosesAt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bookingClosesAt'],
        message: 'Booking must close after it opens',
      });
    }
    const categories = value.pricing.map((item) => item.category);
    if (new Set(categories).size !== categories.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pricing'],
        message: 'Each seat category may be priced once',
      });
    }
  });

export const updateShowSchema = z
  .object({
    startAt: z.coerce.date().optional(),
    language: z.string().trim().min(1).max(40).optional(),
    format: z.enum(SCREEN_FORMATS).optional(),
    pricing: pricingSchema.optional(),
    bookingOpensAt: z.coerce.date().optional(),
    bookingClosesAt: z.coerce.date().optional(),
    cleanupMinutes: z.number().int().min(0).max(120).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const cancelShowSchema = z.object({
  reason: z.string().trim().min(5, 'Record why').max(1000),
});

export const listShowsSchema = z.object({
  city: z.string().trim().max(80).optional(),
  movieId: objectId.optional(),
  theaterId: objectId.optional(),
  screenId: objectId.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  language: z.string().trim().max(40).optional(),
  format: z.enum(SCREEN_FORMATS).optional(),
  status: z.enum(SHOW_STATUS_VALUES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const priceQuoteSchema = z.object({
  seatIds: z.array(z.string().trim().min(1).max(20)).min(1).max(40),
});
