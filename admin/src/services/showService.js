import { api, cleanParams, unwrap, unwrapList } from './api.js';

/**
 * Show scheduling, pricing and seat inventory.
 *
 * Schedule conflicts, layout-version rules and price validity are all decided
 * by the server. Anything this app checks before submitting is for the
 * operator's benefit, never a substitute: two people scheduling the same
 * screen at the same moment are separated by the overlap check in the
 * database, not by a form.
 */

export async function fetchShows(namespace, params = {}, { signal } = {}) {
  const response = await api.get(`${namespace}/shows`, { params: cleanParams(params), signal });
  return unwrapList(response);
}

export async function fetchShow(namespace, showId, { signal } = {}) {
  const response = await api.get(`${namespace}/shows/${showId}`, { signal });
  return unwrap(response).show;
}

export async function createShow(namespace, payload) {
  const response = await api.post(`${namespace}/shows`, payload);
  return unwrap(response).show;
}

export async function updateShow(namespace, showId, payload) {
  const response = await api.patch(`${namespace}/shows/${showId}`, payload);
  return unwrap(response).show;
}

export async function publishShow(namespace, showId) {
  const response = await api.post(`${namespace}/shows/${showId}/publish`, {});
  return unwrap(response).show;
}

/**
 * Cancelling returns the number of seats owed a refund, so the console can
 * state the consequence instead of leaving it to be discovered.
 */
export async function cancelShow(namespace, showId, { reason }) {
  const response = await api.post(`${namespace}/shows/${showId}/cancel`, { reason });
  return unwrap(response);
}

// --- Seat inventory ---------------------------------------------------------

export async function fetchInventorySummary(namespace, showId, { signal } = {}) {
  const response = await api.get(`${namespace}/shows/${showId}/inventory`, { signal });
  return unwrap(response).summary;
}

export async function fetchShowSeats(namespace, showId, { signal } = {}) {
  const response = await api.get(`${namespace}/shows/${showId}/seats`, { signal });
  return unwrap(response);
}

/**
 * Takes a seat out of sale — a broken recliner, a distancing gap. The server
 * refuses if the seat is held or sold, so a paying customer is never stranded.
 */
export async function blockSeat(namespace, showId, seatId, { reason }) {
  const response = await api.post(`${namespace}/shows/${showId}/seats/${seatId}/block`, {
    reason,
  });
  return unwrap(response).seat;
}

export async function unblockSeat(namespace, showId, seatId) {
  const response = await api.post(`${namespace}/shows/${showId}/seats/${seatId}/unblock`, {});
  return unwrap(response).seat;
}
