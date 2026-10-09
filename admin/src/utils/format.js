/**
 * Display helpers.
 *
 * Money arrives from the API as an integer number of paise and is only ever
 * divided for display. Nothing in this file adds two amounts together — totals
 * come from the server, which is the only place that may compute them.
 */

const RUPEES = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const RUPEES_WHOLE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 245000 -> "₹2,450.00" */
export function money(paise) {
  if (paise === null || paise === undefined || Number.isNaN(Number(paise))) return '—';
  return RUPEES.format(Number(paise) / 100);
}

/** For headline figures, where the paise are noise: 245000 -> "₹2,450" */
export function moneyShort(paise) {
  if (paise === null || paise === undefined || Number.isNaN(Number(paise))) return '—';
  return RUPEES_WHOLE.format(Math.round(Number(paise) / 100));
}

/** Basis points as a percentage: 1800 -> "18%", 250 -> "2.5%" */
export function basisPoints(points) {
  if (points === null || points === undefined) return '—';
  const percent = Number(points) / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, '')}%`;
}

const NUMBER = new Intl.NumberFormat('en-IN');

export function count(value) {
  if (value === null || value === undefined) return '—';
  return NUMBER.format(Number(value));
}

const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const DATE_ONLY = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TIME_ONLY = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const WEEKDAY_SHORT = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateTime(value) {
  const date = toDate(value);
  return date ? DATE_TIME.format(date) : '—';
}

export function dateOnly(value) {
  const date = toDate(value);
  return date ? DATE_ONLY.format(date) : '—';
}

export function timeOnly(value) {
  const date = toDate(value);
  return date ? TIME_ONLY.format(date) : '—';
}

export function shortDay(value) {
  const date = toDate(value);
  return date ? WEEKDAY_SHORT.format(date) : '—';
}

/** "3 hours ago", "in 2 days". Used only alongside an absolute date. */
export function relative(value) {
  const date = toDate(value);
  if (!date) return '—';

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const seconds = (date.getTime() - Date.now()) / 1000;
  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];

  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return 'just now';
}

/** An <input type="date"> value for a Date, in local time. */
export function toDateInput(value) {
  const date = toDate(value);
  if (!date) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** An <input type="datetime-local"> value for a Date, in local time. */
export function toDateTimeInput(value) {
  const date = toDate(value);
  if (!date) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Turns `pending_payment` into `Pending payment` for a label. */
export function humanize(value) {
  if (!value) return '—';
  const words = String(value).replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function pluralize(n, singular, plural = `${singular}s`) {
  return `${count(n)} ${Number(n) === 1 ? singular : plural}`;
}

/** Shortens a long list of seat labels for a table cell. */
export function seatSummary(labels = [], limit = 4) {
  if (labels.length === 0) return '—';
  if (labels.length <= limit) return labels.join(', ');
  return `${labels.slice(0, limit).join(', ')} +${labels.length - limit}`;
}

export function initials(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
