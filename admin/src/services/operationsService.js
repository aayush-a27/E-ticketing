import { api, cleanParams, unwrap, unwrapList } from './api.js';

/**
 * The operations read model.
 *
 * Every call takes the caller's namespace — `/admin` or `/show-runner` — which
 * comes from the signed-in role. The two namespaces serve the same shapes; the
 * server decides what each one is allowed to contain. A show runner passing
 * `/admin` here does not gain anything: that namespace refuses anyone who is
 * not a super admin.
 *
 * Nothing in this file writes. Confirming a booking and issuing a refund have
 * no endpoint to call.
 */

export async function fetchDashboard(namespace, { signal } = {}) {
  const response = await api.get(`${namespace}/dashboard`, { signal });
  return unwrap(response);
}

export async function fetchBookings(namespace, params = {}, { signal } = {}) {
  const response = await api.get(`${namespace}/bookings`, {
    params: cleanParams(params),
    signal,
  });
  return unwrapList(response);
}

export async function fetchBooking(namespace, bookingId, { signal } = {}) {
  const response = await api.get(`${namespace}/bookings/${bookingId}`, { signal });
  return unwrap(response);
}

export async function fetchFinanceSummary(namespace, params = {}, { signal } = {}) {
  const response = await api.get(`${namespace}/finance/summary`, {
    params: cleanParams(params),
    signal,
  });
  return unwrap(response).summary;
}

export async function fetchRefunds(namespace, params = {}, { signal } = {}) {
  const response = await api.get(`${namespace}/refunds`, {
    params: cleanParams(params),
    signal,
  });
  return unwrapList(response);
}
