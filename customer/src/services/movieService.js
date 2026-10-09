import { api, unwrap } from './api.js';

/** Strips empty values so the URL only carries filters that are actually set. */
function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

/** Published movies. Returns { data, pagination }. */
export async function fetchMovies(params = {}, { signal } = {}) {
  const response = await api.get('/movies', { params: cleanParams(params), signal });
  return response.data;
}

/**
 * One movie, by slug. The backend exposes the public catalog by slug rather
 * than id, which is also what makes a shared link readable.
 */
export async function fetchMovie(slug, { signal } = {}) {
  const response = await api.get(`/movies/${encodeURIComponent(slug)}`, { signal });
  return unwrap(response).movie;
}
