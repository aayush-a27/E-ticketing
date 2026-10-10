import axios from 'axios';
import { api, cleanParams, unwrap, unwrapList } from './api.js';

/**
 * The movie catalogue and its images.
 *
 * Movies are platform-wide and only a super admin may edit them: show runners
 * schedule published films, they do not create them. Every call here is under
 * /admin for that reason.
 */

export async function fetchMovies(params = {}, { signal } = {}) {
  const response = await api.get('/admin/movies', { params: cleanParams(params), signal });
  return unwrapList(response);
}

/**
 * Published films, from the public catalogue endpoint.
 *
 * This is what the show-scheduling form offers, for two reasons: only a
 * published film can be scheduled anyway, and a show runner has no access to
 * /admin/movies. Note the shape differs — this endpoint returns each film's
 * `id`, where the admin listing returns the raw document's `_id`.
 */
export async function fetchPublishedMovies(params = {}, { signal } = {}) {
  const response = await api.get('/movies', {
    params: cleanParams({ limit: 100, sort: 'title', ...params }),
    signal,
  });
  return unwrapList(response);
}

export async function fetchMovie(id, { signal } = {}) {
  const response = await api.get(`/admin/movies/${id}`, { signal });
  return unwrap(response).movie;
}

export async function createMovie(payload) {
  const response = await api.post('/admin/movies', payload);
  return unwrap(response).movie;
}

export async function updateMovie(id, payload) {
  const response = await api.patch(`/admin/movies/${id}`, payload);
  return unwrap(response).movie;
}

/**
 * Status changes go through their own endpoints, not through a field on the
 * update payload — the server refuses to take `status` from a request body.
 */
export async function publishMovie(id) {
  const response = await api.post(`/admin/movies/${id}/publish`, {});
  return unwrap(response).movie;
}

export async function unpublishMovie(id) {
  const response = await api.post(`/admin/movies/${id}/unpublish`, {});
  return unwrap(response);
}

export async function archiveMovie(id) {
  const response = await api.post(`/admin/movies/${id}/archive`, {});
  return unwrap(response).movie;
}

// --- Images -----------------------------------------------------------------

/**
 * Asks the server for a signed, scoped upload ticket.
 *
 * The file never passes through the API. The signature covers the folder and
 * public id, so a ticket issued for a poster cannot be replayed to overwrite
 * anything else, and the provider's API secret never leaves the server.
 */
export async function requestUploadTicket({ purpose, resourceId }) {
  const response = await api.post('/admin/uploads/signature', {
    purpose,
    ...(resourceId ? { resourceId } : {}),
  });
  return unwrap(response);
}

/**
 * True when the backend is running the in-memory media provider, which exists
 * so the project works with no Cloudinary account. It cannot accept a browser
 * upload — `uploadUrl` is `memory://upload` — so the console says so rather
 * than pretending a file was stored.
 */
export function isSimulatedMediaProvider(ticket) {
  return ticket?.upload?.provider !== 'cloudinary';
}

/**
 * Uploads straight to the provider.
 *
 * Deliberately a bare axios call: the shared client carries credentials and an
 * API base URL, neither of which belongs in a request to a third party.
 *
 * Every signed parameter is sent back exactly as issued, because the signature
 * covers them — changing one invalidates it. The public id we report onward is
 * the one the provider returns, not the one we asked for, since the provider
 * is the authority on where the asset actually landed.
 */
export async function uploadToProvider({ upload, file, onProgress, signal }) {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', upload.apiKey);
  form.append('timestamp', String(upload.timestamp));
  form.append('folder', upload.folder);
  form.append('public_id', upload.public_id);
  form.append('allowed_formats', upload.allowed_formats);
  form.append('signature', upload.signature);

  let response;
  try {
    response = await axios.post(upload.uploadUrl, form, {
      signal,
      // No withCredentials: this request must not carry our session cookie.
      withCredentials: false,
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      },
    });
  } catch (error) {
    if (axios.isCancel(error)) throw error;
    // Cloudinary explains a refusal in error.message; axios on its own would
    // only say "Request failed with status code 400".
    const reason = error?.response?.data?.error?.message;
    throw new Error(
      reason
        ? `Image storage refused the file: ${reason}`
        : 'Could not reach image storage. Check your connection and try again.',
    );
  }

  return {
    publicId: response.data?.public_id,
    url: response.data?.secure_url,
    bytes: response.data?.bytes,
    format: response.data?.format,
    width: response.data?.width,
    height: response.data?.height,
  };
}

/** Records an uploaded image against the movie. The server re-verifies it. */
export async function attachMovieMedia(id, { kind, publicId }) {
  const response = await api.post(`/admin/movies/${id}/media`, { kind, publicId });
  return unwrap(response).movie;
}

export async function removeMovieMedia(id, kind) {
  const response = await api.delete(`/admin/movies/${id}/media/${kind}`);
  return unwrap(response).movie;
}

/** Checks a file before any request is made, using the server's own limits. */
export function validateImageFile(file, constraints) {
  const allowed = constraints?.allowedFormats ?? ['jpg', 'jpeg', 'png', 'webp', 'avif'];
  const maxBytes = constraints?.maxBytes ?? 10 * 1024 * 1024;

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !allowed.includes(extension)) {
    return `Use one of: ${allowed.join(', ')}.`;
  }
  if (file.size > maxBytes) {
    return `That file is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is ${Math.round(
      maxBytes / 1_048_576,
    )} MB.`;
  }
  return null;
}
