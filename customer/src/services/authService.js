import { api, unwrap } from './api.js';

export async function register({ name, email, password, phone }) {
  const response = await api.post('/auth/register', { name, email, password, phone });
  return unwrap(response).user;
}

export async function login({ email, password }) {
  const response = await api.post('/auth/login', { email, password });
  return unwrap(response).user;
}

export async function logout() {
  await api.post('/auth/logout');
}

/** The session check run at startup. A 401 here simply means "not signed in". */
export async function fetchCurrentUser({ signal } = {}) {
  const response = await api.get('/auth/me', { signal });
  return unwrap(response);
}

export async function updateProfile(changes) {
  const response = await api.patch('/auth/me', changes);
  return unwrap(response).user;
}

export async function changePassword({ currentPassword, newPassword }) {
  await api.post('/auth/change-password', { currentPassword, newPassword });
}

export async function requestPasswordReset(email) {
  const response = await api.post('/auth/forgot-password', { email });
  return unwrap(response);
}

export async function resetPassword({ token, newPassword }) {
  await api.post('/auth/reset-password', { token, newPassword });
}
