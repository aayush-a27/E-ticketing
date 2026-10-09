export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  SHOW_RUNNER: 'show_runner',
  SUPER_ADMIN: 'super_admin',
});

export const ROLE_VALUES = Object.freeze(Object.values(ROLES));

export const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DEACTIVATED: 'deactivated',
});

export const ACCOUNT_STATUS_VALUES = Object.freeze(Object.values(ACCOUNT_STATUS));

export const APPLICATION_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
});

export const APPLICATION_STATUS_VALUES = Object.freeze(Object.values(APPLICATION_STATUS));

export const SHOW_RUNNER_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  REVOKED: 'revoked',
});

export const SHOW_RUNNER_STATUS_VALUES = Object.freeze(Object.values(SHOW_RUNNER_STATUS));

export const AUDIT_ACTIONS = Object.freeze({
  USER_REGISTERED: 'user.registered',
  USER_LOGGED_IN: 'user.logged_in',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  USER_PASSWORD_RESET: 'user.password_reset',
  USER_STATUS_CHANGED: 'user.status_changed',
  USER_ROLE_CHANGED: 'user.role_changed',
  APPLICATION_SUBMITTED: 'organizer_application.submitted',
  APPLICATION_WITHDRAWN: 'organizer_application.withdrawn',
  APPLICATION_APPROVED: 'organizer_application.approved',
  APPLICATION_REJECTED: 'organizer_application.rejected',
  SHOW_RUNNER_SUSPENDED: 'show_runner.suspended',
  SHOW_RUNNER_REINSTATED: 'show_runner.reinstated',
  SHOW_RUNNER_REVOKED: 'show_runner.revoked',
});

/**
 * Stable machine-readable error codes. The frontends branch on these, never on
 * the human-readable message.
 */
export const ERROR_CODES = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  SHOW_RUNNER_NOT_ACTIVE: 'SHOW_RUNNER_NOT_ACTIVE',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE_APPLICATION: 'DUPLICATE_APPLICATION',
  APPLICATION_NOT_PENDING: 'APPLICATION_NOT_PENDING',
  EMAIL_IN_USE: 'EMAIL_IN_USE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

export const NOTIFICATION_TYPES = Object.freeze({
  WELCOME: 'welcome',
  PASSWORD_RESET: 'password_reset',
  PASSWORD_CHANGED: 'password_changed',
  APPLICATION_SUBMITTED: 'application_submitted',
  APPLICATION_APPROVED: 'application_approved',
  APPLICATION_REJECTED: 'application_rejected',
  SHOW_RUNNER_SUSPENDED: 'show_runner_suspended',
});

export const NOTIFICATION_STATUS = Object.freeze({
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
});
