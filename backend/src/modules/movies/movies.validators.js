import { z } from 'zod';
import { MOVIE_STATUS_VALUES } from '../../constants/index.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

const certification = z.enum(['U', 'UA', 'UA7+', 'UA13+', 'UA16+', 'A', 'S']);

export const movieIdSchema = z.object({ id: objectId });
export const movieSlugSchema = z.object({ slug: z.string().trim().min(1).max(220) });

export const createMovieSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens')
    .max(220)
    .optional(),
  synopsis: z.string().trim().min(20, 'Write at least a couple of sentences').max(4000),
  tagline: z.string().trim().max(240).optional(),
  trailerUrl: z.string().trim().url('Enter a valid URL').max(500).optional(),
  genres: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  languages: z.array(z.string().trim().min(1).max(40)).min(1, 'List at least one language').max(15),
  subtitles: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  releaseDate: z.coerce.date(),
  runtimeMinutes: z.number().int().min(1).max(600),
  certification,
  director: z.string().trim().max(120).optional(),
  cast: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        character: z.string().trim().max(120).optional(),
        order: z.number().int().min(0).max(200).optional(),
      }),
    )
    .max(60)
    .default([]),
  crew: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        job: z.string().trim().min(1).max(80),
      }),
    )
    .max(60)
    .default([]),
  isFeatured: z.boolean().optional(),
  seo: z
    .object({
      metaTitle: z.string().trim().max(200).optional(),
      metaDescription: z.string().trim().max(400).optional(),
    })
    .optional(),
});

/**
 * `status`, `publishedAt` and the media fields are absent: status changes go
 * through the publish/unpublish/archive endpoints, and media through the
 * upload flow, so neither can be set by a plain update.
 */
export const updateMovieSchema = createMovieSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'Provide at least one field to update' },
);

export const listMoviesSchema = z.object({
  status: z.enum(MOVIE_STATUS_VALUES).optional(),
  genre: z.string().trim().max(40).optional(),
  language: z.string().trim().max(40).optional(),
  certification: certification.optional(),
  featured: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['releaseDate', '-releaseDate', 'title', '-title', '-createdAt']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const attachMediaSchema = z.object({
  kind: z.enum(['poster', 'backdrop']),
  publicId: z.string().trim().min(1).max(400),
});

export const mediaParamsSchema = z.object({
  id: objectId,
  kind: z.enum(['poster', 'backdrop']),
});

export const signUploadSchema = z.object({
  purpose: z.enum(['movie_poster', 'movie_backdrop', 'theater_image']),
  resourceId: objectId.optional(),
});
