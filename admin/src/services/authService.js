import { api, unwrap } from './api.js';

/**
 * Sign-in is the ordinary endpoint every account uses. There is no separate
 * administrator login: the role comes back from the server, and what the
 * console then shows is decided by that — never by which form was used.
 */
export async function login({ email, password }) {
  const response = await api.post('/auth/login', { email, password });
  return unwrap(response).user;
}

export async function fetchCurrentUser({ signal } = {}) {
  const response = await api.get('/auth/me', { signal });
  return unwrap(response);
}

export async function logout() {
  await api.post('/auth/logout');
}

export async function changePassword({ currentPassword, newPassword }) {
  await api.post('/auth/change-password', { currentPassword, newPassword });
}

/**
 * A show runner's own profile, with the venues assigned to them. Approval and
 * assignment are separate grants, so `onboarding.needsTheaterAssignment` is
 * what tells an approved runner they still cannot operate anything.
 */
export async function fetchShowRunnerProfile({ signal } = {}) {
  const response = await api.get('/show-runner/profile', { signal });
  return unwrap(response);
}
