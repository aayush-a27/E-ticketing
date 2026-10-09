import { z } from 'zod';
import { APPLICATION_STATUS_VALUES } from '../../constants/index.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const submitApplicationSchema = z.object({
  contactName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  contactPhone: z
    .string()
    .trim()
    .regex(/^[+]?[\d\s-]{7,20}$/, 'Enter a valid phone number'),
  businessName: z.string().trim().min(2).max(160),
  businessType: z.enum(['single_screen', 'multiplex', 'chain', 'other']),
  cities: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  proposedTheater: z.object({
    name: z.string().trim().min(2).max(160),
    addressLine1: z.string().trim().min(4).max(240),
    addressLine2: z.string().trim().max(240).optional(),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().min(1).max(80),
    pincode: z.string().trim().regex(/^\d{4,10}$/, 'Enter a valid pincode'),
    screenCount: z.number().int().min(1).max(50).optional(),
  }),
  website: z.string().trim().url('Enter a valid URL').max(240).optional(),
  documents: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        storageKey: z.string().trim().min(1).max(400),
        contentType: z.string().trim().max(120).optional(),
      }),
    )
    .max(10)
    .optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const applicationIdSchema = z.object({ id: objectId });

export const listApplicationsSchema = z.object({
  status: z.enum(APPLICATION_STATUS_VALUES).optional(),
  city: z.string().trim().max(80).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const approveSchema = z.object({
  reviewNotes: z.string().trim().max(2000).optional(),
});

export const rejectSchema = z.object({
  rejectionReason: z.string().trim().min(5, 'Give the applicant a reason').max(2000),
  reviewNotes: z.string().trim().max(2000).optional(),
});
