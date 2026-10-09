import axios from 'axios';

/**
 * The one HTTP client.
 *
 * In development VITE_API_BASE_URL is empty and Vite proxies /api to the
 * backend, which keeps the session cookie same-origin. In production it holds
 * the API origin and the backend must list this app in CORS_ORIGINS.
 */
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1`,
  // The session lives in an httpOnly cookie, so every request must carry it.
  // No token is ever read or stored by this app.
  withCredentials: true,
  timeout: 20_000,
  headers: { Accept: 'application/json' },
});

/** Error codes the UI branches on. Mirrors the backend's constants. */
export const ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  EMAIL_IN_USE: 'EMAIL_IN_USE',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  SEATS_UNAVAILABLE: 'SEATS_UNAVAILABLE',
  HOLD_EXPIRED: 'HOLD_EXPIRED',
  HOLD_LIMIT_EXCEEDED: 'HOLD_LIMIT_EXCEEDED',
  SHOW_NOT_BOOKABLE: 'SHOW_NOT_BOOKABLE',
  SIGNATURE_INVALID: 'SIGNATURE_INVALID',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  PAYMENT_NOT_CONFIRMED: 'PAYMENT_NOT_CONFIRMED',
  PAYMENTS_NOT_CONFIGURED: 'PAYMENTS_NOT_CONFIGURED',
  CANCELLATION_NOT_ELIGIBLE: 'CANCELLATION_NOT_ELIGIBLE',
  NETWORK: 'NETWORK',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * A normalized error the UI can render without ever showing a stack trace or
 * an internal message. Falls back to wording written for a customer rather
 * than passing the server's phrasing straight through for unexpected cases.
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

  /** Field-level errors, keyed by field name, for form rendering. */
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
}

const FRIENDLY_BY_STATUS = {
  403: 'You do not have access to that.',
  404: 'We could not find that.',
  409: 'That conflicts with something that just changed. Please try again.',
  422: 'Some details need correcting.',
  429: 'Too many attempts. Please wait a minute and try again.',
  500: 'Something went wrong at our end. Please try again.',
  502: 'We could not reach a service we depend on. Please try again.',
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
      message: 'We could not reach CineReserve. Check your connection and try again.',
      status: 0,
    });
  }

  const { status, data } = error.response;
  const payload = data?.error ?? {};

  // 5xx messages can carry internals, so they are replaced wholesale.
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

/**
 * Listeners notified when the server says the session is gone, so the auth
 * context can clear the user without every caller handling it.
 */
const sessionListeners = new Set();

export function onSessionExpired(listener) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const clientError = toClientError(error);

    // /auth/me is how the app asks "am I signed in?" — a 401 there is an
    // answer, not an expiry, so it must not trigger a sign-out cascade.
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
 * A key for an unsafe POST the server can recognise on a retry. Generated per
 * attempt and reused only when the same attempt is genuinely resubmitted.
 */
export function idempotencyKey() {
  return crypto.randomUUID();
}
