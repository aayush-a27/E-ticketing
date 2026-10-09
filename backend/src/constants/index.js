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

export const MOVIE_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

export const MOVIE_STATUS_VALUES = Object.freeze(Object.values(MOVIE_STATUS));

export const THEATER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  CLOSED: 'closed',
});

export const THEATER_STATUS_VALUES = Object.freeze(Object.values(THEATER_STATUS));

export const SHOW_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
});

export const SHOW_STATUS_VALUES = Object.freeze(Object.values(SHOW_STATUS));

export const SCREEN_FORMATS = Object.freeze(['2D', '3D', 'IMAX', '4DX', 'DOLBY']);

export const SEAT_KINDS = Object.freeze({
  SEAT: 'seat',
  AISLE: 'aisle',
  SPACE: 'space',
});

export const SEAT_KIND_VALUES = Object.freeze(Object.values(SEAT_KINDS));

export const REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
});

export const REQUEST_STATUS_VALUES = Object.freeze(Object.values(REQUEST_STATUS));

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

  MOVIE_CREATED: 'movie.created',
  MOVIE_UPDATED: 'movie.updated',
  MOVIE_PUBLISHED: 'movie.published',
  MOVIE_UNPUBLISHED: 'movie.unpublished',
  MOVIE_ARCHIVED: 'movie.archived',
  MEDIA_UPLOADED: 'media.uploaded',
  MEDIA_DELETED: 'media.deleted',

  THEATER_CREATED: 'theater.created',
  THEATER_UPDATED: 'theater.updated',
  THEATER_MANAGER_ASSIGNED: 'theater.manager_assigned',
  THEATER_MANAGER_REMOVED: 'theater.manager_removed',
  THEATER_REQUEST_SUBMITTED: 'theater_request.submitted',
  THEATER_REQUEST_APPROVED: 'theater_request.approved',
  THEATER_REQUEST_REJECTED: 'theater_request.rejected',

  SCREEN_CREATED: 'screen.created',
  SCREEN_UPDATED: 'screen.updated',
  SEAT_LAYOUT_CREATED: 'seat_layout.created',
  SEAT_LAYOUT_ACTIVATED: 'seat_layout.activated',

  SHOW_CREATED: 'show.created',
  SHOW_UPDATED: 'show.updated',
  SHOW_PUBLISHED: 'show.published',
  SHOW_CANCELLED: 'show.cancelled',

  SETTINGS_UPDATED: 'platform_settings.updated',
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

  NOT_THEATER_MANAGER: 'NOT_THEATER_MANAGER',
  MOVIE_NOT_PUBLISHED: 'MOVIE_NOT_PUBLISHED',
  SCREEN_INACTIVE: 'SCREEN_INACTIVE',
  LAYOUT_REQUIRED: 'LAYOUT_REQUIRED',
  SHOW_OVERLAP: 'SHOW_OVERLAP',
  SHOW_NOT_EDITABLE: 'SHOW_NOT_EDITABLE',
  PRICING_INCOMPLETE: 'PRICING_INCOMPLETE',
  LAYOUT_IN_USE: 'LAYOUT_IN_USE',
  MEDIA_NOT_CONFIGURED: 'MEDIA_NOT_CONFIGURED',
  MEDIA_UPLOAD_FAILED: 'MEDIA_UPLOAD_FAILED',
  SLUG_IN_USE: 'SLUG_IN_USE',
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
