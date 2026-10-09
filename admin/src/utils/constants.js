/**
 * Values the API validates against.
 *
 * These mirror the backend's own enums so a form offers exactly what the
 * server will accept, and a mismatch shows up as a rejected request rather
 * than a silently dropped field. The server remains the authority: nothing
 * here is trusted, it only shapes the choices offered.
 */

export const CERTIFICATIONS = ['U', 'UA', 'UA7+', 'UA13+', 'UA16+', 'A', 'S'];

export const SCREEN_FORMATS = ['2D', '3D', 'IMAX', '4DX', 'DOLBY'];

export const MOVIE_STATUSES = ['draft', 'published', 'archived'];
export const THEATER_STATUSES = ['active', 'inactive', 'closed'];
export const SHOW_STATUSES = ['draft', 'published', 'cancelled', 'completed'];

export const BOOKING_STATUSES = [
  'pending_payment',
  'confirmed',
  'payment_failed',
  'expired',
  'cancellation_pending',
  'cancelled',
  'unfulfillable',
];

export const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refund_pending',
  'refunded',
  'partially_refunded',
  'refund_failed',
];

export const REFUND_STATUSES = ['pending', 'processing', 'completed', 'failed'];

export const SEAT_KINDS = ['seat', 'aisle', 'space'];

/** Suggestions only — the API takes any string, so these are not a whitelist. */
export const COMMON_GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Biography',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Musical',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Sport',
  'Thriller',
  'War',
];

export const COMMON_LANGUAGES = [
  'Hindi',
  'English',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Kannada',
  'Bengali',
  'Marathi',
  'Punjabi',
  'Gujarati',
];

/** Turns an array of strings into Select options. */
export function toOptions(values, { humanizeLabels = false } = {}) {
  return values.map((value) => ({
    value,
    label: humanizeLabels
      ? value.replace(/[_-]+/g, ' ').replace(/^./, (char) => char.toUpperCase())
      : value,
  }));
}
