import { api, unwrap, idempotencyKey } from './api.js';

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

export async function fetchCities({ signal } = {}) {
  const response = await api.get('/cities', { signal });
  return unwrap(response).cities;
}

export async function fetchTheaters(params = {}, { signal } = {}) {
  const response = await api.get('/theaters', { params: cleanParams(params), signal });
  return response.data;
}

/** Upcoming published shows. Returns { data, pagination }. */
export async function fetchShows(params = {}, { signal } = {}) {
  const response = await api.get('/shows', { params: cleanParams(params), signal });
  return response.data;
}

export async function fetchShow(showId, { signal } = {}) {
  const response = await api.get(`/shows/${showId}`, { signal });
  return unwrap(response).show;
}

/**
 * Live seat availability. Never cached: the backend sends no-store, and a
 * stale seat map is how two people pick the same seat.
 */
export async function fetchSeatMap(showId, { signal } = {}) {
  const response = await api.get(`/shows/${showId}/seats`, { signal });
  return unwrap(response);
}

/** A server-computed quote. The client never adds the figures up itself. */
export async function fetchPriceQuote(showId, seatIds, { signal } = {}) {
  const response = await api.post(`/shows/${showId}/price-quote`, { seatIds }, { signal });
  return unwrap(response).quote;
}

/**
 * Claims seats. Carries an idempotency key so a double submission returns the
 * first hold rather than taking a second set of seats.
 */
export async function createSeatHold({ showId, seatIds, key }) {
  const response = await api.post(
    '/me/seat-holds',
    { showId, seatIds },
    { headers: { 'Idempotency-Key': key ?? idempotencyKey() } },
  );
  return unwrap(response).hold;
}

export async function fetchHold(holdId, { signal } = {}) {
  const response = await api.get(`/me/seat-holds/${holdId}`, { signal });
  return unwrap(response).hold;
}

export async function releaseHold(holdId) {
  const response = await api.delete(`/me/seat-holds/${holdId}`);
  return unwrap(response).hold;
}
