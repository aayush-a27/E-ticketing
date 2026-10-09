import { humanize } from '../../utils/format.js';

const TONES = {
  neutral: 'bg-ink-100 text-ink-700 border-ink-200',
  good: 'bg-good-soft text-good border-good/25',
  warn: 'bg-warn-soft text-warn border-warn/25',
  bad: 'bg-bad-soft text-bad border-bad/25',
  info: 'bg-info-soft text-info border-info/25',
  brand: 'bg-brand-soft text-brand-strong border-brand-line',
};

/**
 * Which tone each backend status gets.
 *
 * Only statuses the API actually defines appear here. Anything unrecognised
 * falls through to neutral and is shown humanized rather than hidden, so a
 * status added to the backend later shows up as itself instead of vanishing.
 */
const STATUS_TONES = {
  // Bookings
  confirmed: 'good',
  pending_payment: 'warn',
  payment_failed: 'bad',
  expired: 'neutral',
  cancellation_pending: 'warn',
  cancelled: 'neutral',
  unfulfillable: 'bad',

  // Booking payment state
  pending: 'warn',
  paid: 'good',
  failed: 'bad',
  refund_pending: 'warn',
  refunded: 'info',
  partially_refunded: 'info',
  refund_failed: 'bad',

  // One payment attempt
  created: 'neutral',
  authorized: 'info',
  captured: 'good',

  // Refunds
  processing: 'info',
  completed: 'good',

  // Catalogue and venues
  draft: 'neutral',
  published: 'good',
  archived: 'neutral',
  active: 'good',
  inactive: 'neutral',
  closed: 'neutral',

  // Accounts, applications and show runners
  suspended: 'bad',
  deactivated: 'neutral',
  revoked: 'bad',
  approved: 'good',
  rejected: 'bad',
  withdrawn: 'neutral',
};

export function Badge({ children, tone = 'neutral', className = '', dot = false }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5',
        'text-xs font-medium',
        TONES[tone] ?? TONES.neutral,
        className,
      ].join(' ')}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * A badge for a status string straight out of the API. Keeping the mapping in
 * one place is what stops "confirmed" being green on one screen and grey on
 * another.
 */
export function StatusBadge({ status, className = '', dot = true }) {
  if (!status) return <span className="text-ink-400">—</span>;
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} className={className} dot={dot}>
      {humanize(status)}
    </Badge>
  );
}
