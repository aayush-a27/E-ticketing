import { api, unwrap, idempotencyKey } from './api.js';

/** Opens a booking against a live hold. Idempotent per attempt. */
export async function createBooking(holdId, { key } = {}) {
  const response = await api.post(
    '/me/bookings',
    { holdId },
    { headers: { 'Idempotency-Key': key ?? idempotencyKey() } },
  );
  return unwrap(response).booking;
}

export async function fetchBooking(bookingId, { signal } = {}) {
  const response = await api.get(`/me/bookings/${bookingId}`, { signal });
  return unwrap(response).booking;
}

/** The signed-in customer's bookings. `scope` is 'upcoming' or 'past'. */
export async function fetchBookings(params = {}, { signal } = {}) {
  const response = await api.get('/me/bookings', { params, signal });
  return response.data;
}

/** Only ever returns something for a confirmed booking. */
export async function fetchTicket(bookingId, { signal } = {}) {
  const response = await api.get(`/me/bookings/${bookingId}/ticket`, { signal });
  return unwrap(response);
}

export async function fetchCancellationQuote(bookingId, { signal } = {}) {
  const response = await api.get(`/me/bookings/${bookingId}/cancellation-quote`, { signal });
  return unwrap(response).quote;
}

export async function cancelBooking(bookingId, { seatIds, reason, key } = {}) {
  const response = await api.post(
    `/me/bookings/${bookingId}/cancellations`,
    { seatIds, reason },
    { headers: { 'Idempotency-Key': key ?? idempotencyKey() } },
  );
  return unwrap(response);
}

export async function fetchRefunds(bookingId, { signal } = {}) {
  const response = await api.get(`/me/bookings/${bookingId}/refunds`, { signal });
  return unwrap(response).refunds;
}
