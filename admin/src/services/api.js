import axios from 'axios';

/**
 * The one HTTP client for the console.
 *
 * In development VITE_API_BASE_URL is empty and Vite proxies /api to the
 * backend, which keeps the session cookie same-origin. In production it holds
 * the API origin and the backend must list this app in CORS_ORIGINS.
 */
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1`,
  // The session is an httpOnly cookie. This app never reads, stores or sees a
  // token, so there is nothing here for a stolen localStorage to give up.
  withCredentials: true,
  timeout: 30_000,
  headers: { Accept: 'application/json' },
});

/** Error codes the console branches on. Mirrors the backend's constants. */
export const ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  SHOW_RUNNER_NOT_ACTIVE: 'SHOW_RUNNER_NOT_ACTIVE',
  NOT_THEATER_MANAGER: 'NOT_THEATER_MANAGER',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SLUG_IN_USE: 'SLUG_IN_USE',
  LAYOUT_IN_USE: 'LAYOUT_IN_USE',
  LAYOUT_REQUIRED: 'LAYOUT_REQUIRED',
  SHOW_OVERLAP: 'SHOW_OVERLAP',
  SHOW_NOT_EDITABLE: 'SHOW_NOT_EDITABLE',
  PRICING_INCOMPLETE: 'PRICING_INCOMPLETE',
  MOVIE_NOT_PUBLISHED: 'MOVIE_NOT_PUBLISHED',
  MEDIA_NOT_CONFIGURED: 'MEDIA_NOT_CONFIGURED',
  MEDIA_UPLOAD_FAILED: 'MEDIA_UPLOAD_FAILED',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  TICKET_INVALID: 'TICKET_INVALID',
  TICKET_ALREADY_USED: 'TICKET_ALREADY_USED',
  APPLICATION_NOT_PENDING: 'APPLICATION_NOT_PENDING',
  NETWORK: 'NETWORK',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * A normalized error the console can render without ever showing a stack
 * trace or an internal message.
 */
export class ApiClientError extends Error {
  constructor({ code, message, status, details, requestId }) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details ?? [];
    this.requestId = requestId;
  }

  /** Field-level errors keyed by field name, for react-hook-form. */
  get fieldErrors() {
    const map = {};
    for (const detail of this.details) {
      if (detail?.field) map[detail.field] = detail.message;
    }
    return map;
  }

  get isAuthError() {
    return (
      this.status === 401 ||
      [ERROR_CODES.UNAUTHENTICATED, ERROR_CODES.TOKEN_EXPIRED, ERROR_CODES.TOKEN_INVALID].includes(
        this.code,
      )
    );
  }

  /** Authenticated, but not allowed — a different thing from not signed in. */
  get isForbidden() {
    return this.status === 403;
  }
}

const FRIENDLY_BY_STATUS = {
  403: 'Your account does not have access to that.',
  404: 'That could not be found.',
  409: 'That conflicts with something that just changed. Reload and try again.',
  422: 'Some details need correcting.',
  429: 'Too many requests. Wait a minute and try again.',
  500: 'Something went wrong on the server. Please try again.',
  502: 'A service the API depends on could not be reached.',
  503: 'That service is temporarily unavailable.',
};

export function toClientError(error) {
  if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
    return new ApiClientError({
      code: ERROR_CODES.CANCELLED,
      message: 'Request cancelled',
      status: 0,
    });
  }

  if (!error?.response) {
    return new ApiClientError({
      code: ERROR_CODES.NETWORK,
      message: 'Could not reach the API. Check that the backend is running.',
      status: 0,
    });
  }

  const { status, data } = error.response;
  const payload = data?.error ?? {};

  // A 5xx message can carry internals, so it is replaced wholesale.
  const message =
    status >= 500
      ? (FRIENDLY_BY_STATUS[status] ?? FRIENDLY_BY_STATUS[500])
      : (payload.message ?? FRIENDLY_BY_STATUS[status] ?? 'Something went wrong.');

  return new ApiClientError({
    code: payload.code ?? ERROR_CODES.UNKNOWN,
    message,
    status,
    details: payload.details,
    requestId: payload.requestId,
  });
}

/** Listeners notified when the server says the session is gone. */
const sessionListeners = new Set();

export function onSessionExpired(listener) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const clientError = toClientError(error);

    // /auth/me is how the console asks "who am I?" — a 401 there is an answer,
    // not an expiry, so it must not trigger a sign-out cascade on startup.
    const isSessionProbe = error?.config?.url?.includes('/auth/me');
    if (clientError.isAuthError && !isSessionProbe) {
      for (const listener of sessionListeners) listener(clientError);
    }

    return Promise.reject(clientError);
  },
);

/** Unwraps the backend's { data: ... } envelope. */
export function unwrap(response) {
  return response.data?.data ?? response.data;
}

/**
 * Unwraps a paginated list into a predictable shape, so no page has to know
 * whether the envelope put the rows at `data` or at the top level.
 */
export function unwrapList(response) {
  const body = response.data ?? {};
  return {
    items: Array.isArray(body.data) ? body.data : (body.data?.items ?? []),
    pagination: body.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 },
  };
}

/**
 * A key the server can recognise if the same attempt is genuinely resubmitted.
 * Generated per attempt, never per render.
 */
export function idempotencyKey() {
  return crypto.randomUUID();
}

/** Drops empty filter values so they never reach the query string. */
export function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
}
