import { api, cleanParams, unwrap, unwrapList } from './api.js';

/**
 * Super-admin operations: applications, show runners, venue requests,
 * accounts, the audit log and platform settings.
 *
 * Every path here is under /admin, which refuses anyone who is not a super
 * admin — a show runner calling these gets a 403, whatever this app renders.
 * The two runner-side calls at the bottom are under /show-runner and are
 * scoped to the caller.
 */

// --- Show-runner applications ----------------------------------------------

export async function fetchApplications(params = {}, { signal } = {}) {
  const response = await api.get('/admin/organizer-applications', {
    params: cleanParams(params),
    signal,
  });
  return unwrapList(response);
}

export async function fetchApplication(id, { signal } = {}) {
  const response = await api.get(`/admin/organizer-applications/${id}`, { signal });
  return unwrap(response).application;
}

/**
 * Approves the person as a show runner. It grants no venue: assignment is a
 * separate step, so an approved runner can operate nothing until it happens.
 */
export async function approveApplication(id, { reviewNotes } = {}) {
  const response = await api.post(`/admin/organizer-applications/${id}/approve`, {
    ...(reviewNotes ? { reviewNotes } : {}),
  });
  return unwrap(response);
}

export async function rejectApplication(id, { rejectionReason, reviewNotes }) {
  const response = await api.post(`/admin/organizer-applications/${id}/reject`, {
    rejectionReason,
    ...(reviewNotes ? { reviewNotes } : {}),
  });
  return unwrap(response).application;
}

// --- Show runners -----------------------------------------------------------

export async function fetchShowRunners(params = {}, { signal } = {}) {
  const response = await api.get('/admin/show-runners', { params: cleanParams(params), signal });
  return unwrapList(response);
}

/**
 * Suspending keeps the role but blocks every operational request; revoking
 * returns the account to an ordinary customer. Both end the runner's current
 * sessions immediately.
 */
export async function updateShowRunnerStatus(userId, { status, reason }) {
  const response = await api.patch(`/admin/show-runners/${userId}/status`, { status, reason });
  return unwrap(response);
}

// --- Venue requests ---------------------------------------------------------

export async function fetchTheaterRequests(params = {}, { signal } = {}) {
  const response = await api.get('/admin/theater-requests', {
    params: cleanParams(params),
    signal,
  });
  return unwrapList(response);
}

/**
 * Approving a request for an existing theater assigns it; approving a proposal
 * for a new one creates the theater first and then assigns it.
 */
export async function approveTheaterRequest(id, { decisionNotes } = {}) {
  const response = await api.post(`/admin/theater-requests/${id}/approve`, {
    ...(decisionNotes ? { decisionNotes } : {}),
  });
  return unwrap(response);
}

export async function rejectTheaterRequest(id, { decisionNotes }) {
  const response = await api.post(`/admin/theater-requests/${id}/reject`, { decisionNotes });
  return unwrap(response).request;
}

// --- Accounts ---------------------------------------------------------------

export async function fetchUsers(params = {}, { signal } = {}) {
  const response = await api.get('/admin/users', { params: cleanParams(params), signal });
  return unwrapList(response);
}

export async function fetchUser(id, { signal } = {}) {
  const response = await api.get(`/admin/users/${id}`, { signal });
  return unwrap(response);
}

/** Suspending or deactivating ends every session the account holds. */
export async function updateUserStatus(id, { accountStatus, reason }) {
  const response = await api.patch(`/admin/users/${id}/status`, { accountStatus, reason });
  return unwrap(response);
}

// --- Audit log --------------------------------------------------------------

export async function fetchAuditLogs(params = {}, { signal } = {}) {
  const response = await api.get('/admin/audit-logs', { params: cleanParams(params), signal });
  return unwrapList(response);
}

// --- Platform settings ------------------------------------------------------

export async function fetchSettings({ signal } = {}) {
  const response = await api.get('/admin/settings', { signal });
  return unwrap(response).settings;
}

/**
 * Sends one section at a time. The server validates each section as a whole,
 * so a section is always sent complete, never as a partial patch.
 */
export async function updateSettings(patch) {
  const response = await api.patch('/admin/settings', patch);
  return unwrap(response).settings;
}

// --- Show-runner side -------------------------------------------------------

export async function fetchMyTheaterRequests({ signal } = {}) {
  const response = await api.get('/show-runner/theater-requests', { signal });
  return unwrap(response).requests;
}

/** Either `theaterId` for an existing venue or `proposedTheater`, never both. */
export async function submitTheaterRequest(payload) {
  const response = await api.post('/show-runner/theater-requests', payload);
  return unwrap(response).request;
}

/** Active theaters from the public listing, for a runner to request one. */
export async function fetchPublicTheaters(params = {}, { signal } = {}) {
  const response = await api.get('/theaters', {
    params: cleanParams({ limit: 100, ...params }),
    signal,
  });
  return unwrapList(response);
}

// --- Gate -------------------------------------------------------------------

/**
 * Submits a scanned token. Decoding a QR code proves nothing — only this call
 * decides, and it is what marks the ticket used.
 */
export async function validateTicket(token) {
  const response = await api.post('/tickets/validate', { token });
  return unwrap(response);
}
