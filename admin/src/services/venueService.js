import { api, cleanParams, unwrap, unwrapList } from './api.js';

/**
 * Theaters, screens and seat layouts.
 *
 * Every function takes the caller's namespace. The two namespaces expose the
 * same paths, and the server decides what each may reach: under /show-runner,
 * a theater id the caller does not manage is refused by gate 4 before any
 * handler runs. Passing /admin as a show runner gains nothing — that namespace
 * refuses anyone who is not a super admin.
 *
 * A show runner cannot create a theater. Venues are assigned by a platform
 * administrator, so that one call is admin-only by design.
 */

export async function fetchTheaters(namespace, params = {}, { signal } = {}) {
  const response = await api.get(`${namespace}/theaters`, {
    params: cleanParams(params),
    signal,
  });
  return unwrapList(response);
}

export async function fetchTheater(namespace, theaterId, { signal } = {}) {
  const response = await api.get(`${namespace}/theaters/${theaterId}`, { signal });
  return unwrap(response).theater;
}

/** Admin only: venues are assigned, not self-served. */
export async function createTheater(payload) {
  const response = await api.post('/admin/theaters', payload);
  return unwrap(response).theater;
}

export async function updateTheater(namespace, theaterId, payload) {
  const response = await api.patch(`${namespace}/theaters/${theaterId}`, payload);
  return unwrap(response).theater;
}

// --- Managers (admin only) --------------------------------------------------

export async function assignManager(theaterId, { userId, reason }) {
  const response = await api.post(`/admin/theaters/${theaterId}/managers`, { userId, reason });
  return unwrap(response).theater;
}

export async function removeManager(theaterId, userId) {
  const response = await api.delete(`/admin/theaters/${theaterId}/managers/${userId}`);
  return unwrap(response).theater;
}

// --- Images -----------------------------------------------------------------

export async function attachTheaterImage(namespace, theaterId, { publicId, caption }) {
  const response = await api.post(`${namespace}/theaters/${theaterId}/images`, {
    publicId,
    ...(caption ? { caption } : {}),
  });
  return unwrap(response).theater;
}

/**
 * The public id goes in the query string, not the path: a Cloudinary public id
 * contains its folder, and slashes do not survive a single path segment.
 */
export async function removeTheaterImage(namespace, theaterId, publicId) {
  const response = await api.delete(`${namespace}/theaters/${theaterId}/images`, {
    params: { publicId },
  });
  return unwrap(response).theater;
}

// --- Screens ----------------------------------------------------------------

export async function fetchScreens(namespace, theaterId, { signal } = {}) {
  const response = await api.get(`${namespace}/theaters/${theaterId}/screens`, { signal });
  return unwrap(response).screens;
}

export async function createScreen(namespace, theaterId, payload) {
  const response = await api.post(`${namespace}/theaters/${theaterId}/screens`, payload);
  return unwrap(response).screen;
}

export async function updateScreen(namespace, screenId, payload) {
  const response = await api.patch(`${namespace}/screens/${screenId}`, payload);
  return unwrap(response).screen;
}

// --- Seat layouts -----------------------------------------------------------

/** Versions, newest first. The seat arrays are omitted from this listing. */
export async function fetchLayouts(namespace, screenId, { signal } = {}) {
  const response = await api.get(`${namespace}/screens/${screenId}/layouts`, { signal });
  return unwrap(response).layouts;
}

export async function fetchLayout(namespace, screenId, version, { signal } = {}) {
  const response = await api.get(`${namespace}/screens/${screenId}/layouts/${version}`, {
    signal,
  });
  return unwrap(response).layout;
}

/**
 * Creates a new version. Layouts are never edited in place — an existing show
 * pins the version it was scheduled against, so its tickets and seat inventory
 * keep meaning something after the room is rearranged.
 */
export async function createLayout(namespace, screenId, payload) {
  const response = await api.post(`${namespace}/screens/${screenId}/layouts`, payload);
  return unwrap(response).layout;
}

/**
 * Switching the active version. The server refuses while upcoming published
 * shows still use the current one, rather than silently changing what those
 * shows mean.
 */
export async function activateLayout(namespace, screenId, version) {
  const response = await api.post(
    `${namespace}/screens/${screenId}/layouts/${version}/activate`,
    {},
  );
  return unwrap(response).layout;
}
