import { api, unwrap } from './api.js';

/**
 * Applying to run a venue on CineReserve.
 *
 * Nothing here grants anything: an application is a request a platform
 * administrator reviews. Even once approved, no venue comes with it — that is
 * assigned separately.
 */
export async function fetchMyApplications({ signal } = {}) {
  const response = await api.get('/me/organizer-applications', { signal });
  return unwrap(response).applications;
}

export async function submitApplication(payload) {
  const response = await api.post('/me/organizer-applications', payload);
  return unwrap(response).application;
}

export async function withdrawApplication(id) {
  const response = await api.post(`/me/organizer-applications/${id}/withdraw`, {});
  return unwrap(response).application;
}
