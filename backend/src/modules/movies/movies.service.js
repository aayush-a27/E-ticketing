import { Movie } from '../../models/Movie.js';
import { Show } from '../../models/Show.js';
import { ApiError } from '../../utils/ApiError.js';
import { AUDIT_ACTIONS, ERROR_CODES, MOVIE_STATUS, SHOW_STATUS } from '../../constants/index.js';
import { recordAudit } from '../../services/auditService.js';
import { resolvePagination, paginated } from '../../utils/pagination.js';
import { getMediaProvider } from '../../services/media/providers.js';
import { logger } from '../../utils/logger.js';

export function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

async function uniqueSlug(base, excludeId = null) {
  const root = base || 'movie';
  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? root : `${root}-${suffix + 1}`;
    const filter = { slug: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    if (!(await Movie.exists(filter))) return candidate;
  }
  throw ApiError.conflict('Could not derive a unique slug; set one explicitly', ERROR_CODES.SLUG_IN_USE);
}

export async function createMovie(actor, payload, req) {
  const slug = payload.slug
    ? await assertSlugFree(payload.slug)
    : await uniqueSlug(slugify(payload.title));

  const movie = await Movie.create({
    ...payload,
    slug,
    status: MOVIE_STATUS.DRAFT,
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.MOVIE_CREATED,
    resourceType: 'Movie',
    resourceId: movie._id,
    after: { title: movie.title, slug: movie.slug },
    req,
  });

  return movie;
}

async function assertSlugFree(slug, excludeId = null) {
  const filter = { slug };
  if (excludeId) filter._id = { $ne: excludeId };
  if (await Movie.exists(filter)) {
    throw ApiError.conflict('That slug is already taken', ERROR_CODES.SLUG_IN_USE);
  }
  return slug;
}

export async function updateMovie(actor, id, payload, req) {
  const movie = await Movie.findById(id);
  if (!movie) throw ApiError.notFound('Movie not found');

  if (payload.slug && payload.slug !== movie.slug) {
    await assertSlugFree(payload.slug, movie._id);
  }

  const before = { title: movie.title, slug: movie.slug, runtimeMinutes: movie.runtimeMinutes };

  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) movie[key] = value;
  }
  movie.updatedBy = actor._id;
  await movie.save();

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.MOVIE_UPDATED,
    resourceType: 'Movie',
    resourceId: movie._id,
    before,
    after: { title: movie.title, slug: movie.slug, runtimeMinutes: movie.runtimeMinutes },
    req,
  });

  return movie;
}

/**
 * Publishing is what makes a movie schedulable and visible to customers, so it
 * requires the fields a customer page and a show both need.
 */
export async function publishMovie(actor, id, req) {
  const movie = await Movie.findById(id);
  if (!movie) throw ApiError.notFound('Movie not found');

  if (movie.status === MOVIE_STATUS.PUBLISHED) {
    return { movie, unchanged: true };
  }

  const missing = [];
  if (!movie.poster) missing.push('poster');
  if (!movie.synopsis) missing.push('synopsis');
  if (!movie.languages?.length) missing.push('languages');
  if (!movie.runtimeMinutes) missing.push('runtimeMinutes');
  if (!movie.certification) missing.push('certification');

  if (missing.length) {
    throw ApiError.badRequest(
      'This movie is missing details customers need',
      missing.map((field) => ({ field, message: 'Required before publishing' })),
    );
  }

  movie.status = MOVIE_STATUS.PUBLISHED;
  movie.publishedAt = new Date();
  movie.archivedAt = undefined;
  movie.updatedBy = actor._id;
  await movie.save();

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.MOVIE_PUBLISHED,
    resourceType: 'Movie',
    resourceId: movie._id,
    after: { status: movie.status },
    req,
  });

  return { movie, unchanged: false };
}

/**
 * Unpublishing hides a movie from customers but does not touch shows already
 * scheduled against it — cancelling those is a separate, deliberate act, and
 * tickets already sold stay valid.
 */
export async function unpublishMovie(actor, id, req) {
  const movie = await Movie.findById(id);
  if (!movie) throw ApiError.notFound('Movie not found');

  movie.status = MOVIE_STATUS.DRAFT;
  movie.publishedAt = undefined;
  movie.updatedBy = actor._id;
  await movie.save();

  const affectedShows = await Show.countDocuments({
    movieId: movie._id,
    status: SHOW_STATUS.PUBLISHED,
    startAt: { $gt: new Date() },
  });

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.MOVIE_UNPUBLISHED,
    resourceType: 'Movie',
    resourceId: movie._id,
    after: { status: movie.status, affectedUpcomingShows: affectedShows },
    req,
  });

  return { movie, affectedShows };
}

export async function archiveMovie(actor, id, req) {
  const movie = await Movie.findById(id);
  if (!movie) throw ApiError.notFound('Movie not found');

  const upcoming = await Show.countDocuments({
    movieId: movie._id,
    status: SHOW_STATUS.PUBLISHED,
    startAt: { $gt: new Date() },
  });

  if (upcoming > 0) {
    throw ApiError.conflict(
      `This movie has ${upcoming} upcoming published show(s). Cancel them before archiving.`,
      ERROR_CODES.CONFLICT,
    );
  }

  movie.status = MOVIE_STATUS.ARCHIVED;
  movie.archivedAt = new Date();
  movie.publishedAt = undefined;
  movie.updatedBy = actor._id;
  await movie.save();

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.MOVIE_ARCHIVED,
    resourceType: 'Movie',
    resourceId: movie._id,
    after: { status: movie.status },
    req,
  });

  return movie;
}

/**
 * Attaches an already-uploaded asset. The provider is asked whether the asset
 * really exists before anything is stored, so a client cannot invent a
 * publicId. The replaced asset is deleted afterwards, and a failure there is
 * logged rather than thrown — the movie is already correct, and an orphaned
 * file is a cleanup problem, not a request failure.
 */
export async function attachMedia(actor, id, { kind, publicId }, req) {
  const movie = await Movie.findById(id);
  if (!movie) throw ApiError.notFound('Movie not found');

  const provider = getMediaProvider();
  const asset = await provider.getAsset(publicId);
  if (!asset) {
    throw ApiError.badRequest('That upload could not be found with the media provider', [
      { field: 'publicId', message: 'Unknown asset' },
    ]);
  }

  const previous = movie[kind];
  movie[kind] = {
    url: asset.url,
    publicId: asset.publicId,
    width: asset.width,
    height: asset.height,
    format: asset.format,
    bytes: asset.bytes,
  };
  movie.updatedBy = actor._id;
  await movie.save();

  if (previous?.publicId && previous.publicId !== asset.publicId) {
    try {
      await provider.destroy(previous.publicId);
    } catch (error) {
      logger.warn({ err: error, publicId: previous.publicId }, 'Could not delete replaced asset');
    }
  }

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.MEDIA_UPLOADED,
    resourceType: 'Movie',
    resourceId: movie._id,
    before: previous ? { publicId: previous.publicId } : undefined,
    after: { kind, publicId: asset.publicId },
    req,
  });

  return movie;
}

export async function removeMedia(actor, id, kind, req) {
  const movie = await Movie.findById(id);
  if (!movie) throw ApiError.notFound('Movie not found');

  const existing = movie[kind];
  if (!existing) throw ApiError.notFound(`This movie has no ${kind}`);

  if (movie.status === MOVIE_STATUS.PUBLISHED && kind === 'poster') {
    throw ApiError.conflict('Unpublish the movie before removing its poster');
  }

  movie[kind] = undefined;
  movie.updatedBy = actor._id;
  await movie.save();

  try {
    await getMediaProvider().destroy(existing.publicId);
  } catch (error) {
    logger.warn({ err: error, publicId: existing.publicId }, 'Could not delete asset');
  }

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.MEDIA_DELETED,
    resourceType: 'Movie',
    resourceId: movie._id,
    before: { kind, publicId: existing.publicId },
    req,
  });

  return movie;
}

function buildMovieFilter(query, { publishedOnly }) {
  const filter = {};
  if (publishedOnly) filter.status = MOVIE_STATUS.PUBLISHED;
  else if (query.status) filter.status = query.status;

  if (query.genre) filter.genres = query.genre;
  if (query.language) filter.languages = query.language;
  if (query.certification) filter.certification = query.certification;
  if (query.featured) filter.isFeatured = query.featured === 'true';
  if (query.search) filter.$text = { $search: query.search };
  return filter;
}

export async function listMovies(query, { publishedOnly = false } = {}) {
  const { page, limit, skip } = resolvePagination(query);
  const filter = buildMovieFilter(query, { publishedOnly });
  const sort = query.sort ?? (publishedOnly ? '-releaseDate' : '-createdAt');

  const [items, total] = await Promise.all([
    Movie.find(filter).sort(sort).skip(skip).limit(limit),
    Movie.countDocuments(filter),
  ]);

  return paginated(
    items.map((movie) => (publishedOnly ? movie.toPublicJSON() : movie)),
    { page, limit, total },
  );
}

export async function getMovie(idOrSlug, { publishedOnly = false } = {}) {
  const byId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);
  const filter = byId ? { _id: idOrSlug } : { slug: idOrSlug };
  if (publishedOnly) filter.status = MOVIE_STATUS.PUBLISHED;

  const movie = await Movie.findOne(filter);
  if (!movie) throw ApiError.notFound('Movie not found');
  return movie;
}
