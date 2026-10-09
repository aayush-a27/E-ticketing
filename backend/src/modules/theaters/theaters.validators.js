import { z } from 'zod';
import {
  SCREEN_FORMATS,
  SEAT_KIND_VALUES,
  THEATER_STATUS_VALUES,
} from '../../constants/index.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const theaterIdSchema = z.object({ theaterId: objectId });
export const idSchema = z.object({ id: objectId });
export const screenIdSchema = z.object({ screenId: objectId });

export const createTheaterSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens')
    .max(180)
    .optional(),
  addressLine1: z.string().trim().min(4).max(240),
  addressLine2: z.string().trim().max(240).optional(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  pincode: z.string().trim().regex(/^\d{4,10}$/, 'Enter a valid pincode'),
  coordinates: z
    .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
    .optional(),
  contactPhone: z.string().trim().max(20).optional(),
  contactEmail: z.string().trim().toLowerCase().email().max(254).optional(),
  amenities: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  managerIds: z.array(objectId).max(10).optional(),
});

export const updateTheaterSchema = createTheaterSchema
  .omit({ managerIds: true })
  .partial()
  .extend({ status: z.enum(THEATER_STATUS_VALUES).optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listTheatersSchema = z.object({
  city: z.string().trim().max(80).optional(),
  status: z.enum(THEATER_STATUS_VALUES).optional(),
  managerId: objectId.optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const assignManagerSchema = z.object({
  userId: objectId,
  reason: z.string().trim().min(5, 'Record why').max(1000),
});

// --- Theater images ---------------------------------------------------------

/**
 * The publicId handed back after a direct-to-provider upload. Verified against
 * the provider before it is stored, so this only has to be shaped sensibly.
 */
export const attachTheaterImageSchema = z.object({
  publicId: z.string().trim().min(1).max(400),
  caption: z.string().trim().max(160).optional(),
});

/**
 * The image to remove arrives as a query parameter, not a path segment: a
 * Cloudinary publicId contains the folder path, and slashes cannot survive a
 * single path segment without encoding games at every call site.
 */
export const removeTheaterImageQuerySchema = z.object({
  publicId: z.string().trim().min(1).max(400),
});

// --- Theater requests -------------------------------------------------------

export const createTheaterRequestSchema = z
  .object({
    theaterId: objectId.optional(),
    proposedTheater: z
      .object({
        name: z.string().trim().min(2).max(160),
        addressLine1: z.string().trim().min(4).max(240),
        city: z.string().trim().min(1).max(80),
        state: z.string().trim().min(1).max(80),
        pincode: z.string().trim().regex(/^\d{4,10}$/, 'Enter a valid pincode'),
      })
      .optional(),
    justification: z.string().trim().min(10, 'Explain the request').max(2000),
  })
  .refine((value) => Boolean(value.theaterId) !== Boolean(value.proposedTheater), {
    message: 'Name an existing theater or propose a new one, not both',
  });

export const reviewTheaterRequestSchema = z.object({
  decisionNotes: z.string().trim().max(2000).optional(),
});

export const rejectTheaterRequestSchema = z.object({
  decisionNotes: z.string().trim().min(5, 'Give the requester a reason').max(2000),
});

// --- Screens ----------------------------------------------------------------

export const createScreenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  formats: z.array(z.enum(SCREEN_FORMATS)).min(1).max(5).default(['2D']),
});

export const updateScreenSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    formats: z.array(z.enum(SCREEN_FORMATS)).min(1).max(5).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

// --- Seat layouts -----------------------------------------------------------

const seatSchema = z.object({
  seatId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,20}$/, 'Seat ids may use letters, digits, hyphen and underscore'),
  row: z.string().trim().min(1).max(4),
  number: z.number().int().min(1).max(100),
  label: z.string().trim().min(1).max(12),
  category: z.string().trim().min(1).max(40),
  x: z.number().int().min(0).max(200),
  y: z.number().int().min(0).max(200),
  kind: z.enum(SEAT_KIND_VALUES).optional(),
  isActive: z.boolean().optional(),
});

export const createLayoutSchema = z
  .object({
    categories: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(40),
          displayOrder: z.number().int().min(0).max(50).optional(),
          color: z.string().trim().max(20).optional(),
        }),
      )
      .min(1, 'Define at least one seat category')
      .max(10),
    seats: z.array(seatSchema).min(1, 'A layout needs at least one seat').max(2000),
    activate: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    // These two checks are the ones that keep seat ids usable as inventory keys.
    const seen = new Set();
    for (const seat of value.seats) {
      if (seen.has(seat.seatId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['seats'],
          message: `Duplicate seat id "${seat.seatId}"`,
        });
      }
      seen.add(seat.seatId);
    }

    const categoryNames = new Set(value.categories.map((category) => category.name));
    for (const seat of value.seats) {
      if (seat.kind && seat.kind !== 'seat') continue;
      if (!categoryNames.has(seat.category)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['seats'],
          message: `Seat "${seat.seatId}" uses undefined category "${seat.category}"`,
        });
      }
    }

    const positions = new Set();
    for (const seat of value.seats) {
      const key = `${seat.x}:${seat.y}`;
      if (positions.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['seats'],
          message: `Two seats share grid position (${seat.x}, ${seat.y})`,
        });
      }
      positions.add(key);
    }
  });

/**
 * Both path params. `validate` replaces req.params with the parsed object, so
 * a schema that omits `version` would silently drop it.
 */
export const screenVersionParamsSchema = z.object({
  screenId: objectId,
  version: z.coerce.number().int().min(1),
});
