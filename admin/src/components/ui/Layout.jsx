import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button.jsx';
import { Skeleton } from './States.jsx';
import { count } from '../../utils/format.js';

/** A white panel. The console's only container. */
export function Card({ children, className = '', as: Component = 'div', ...props }) {
  return (
    <Component className={`card ${className}`} {...props}>
      {children}
    </Component>
  );
}

export function CardHeader({ title, description, actions, className = '' }) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 px-5 py-4 ${className}`}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** The title block at the top of every page. */
export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
            {title}
          </h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/**
 * One headline figure.
 *
 * `hint` exists because a number on its own invites the wrong reading — the
 * difference between money booked and money collected has to be stated, not
 * implied by a label.
 */
export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral', loading = false }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-600',
    good: 'bg-good-soft text-good',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
    info: 'bg-info-soft text-info',
    brand: 'bg-brand-soft text-brand-strong',
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        {Icon && (
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-md ${tones[tone] ?? tones.neutral}`}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2.5 h-7 w-24" />
      ) : (
        <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink-900">{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </Card>
  );
}

/**
 * Page-based pagination.
 *
 * Deliberately not infinite scroll: an operator working a list needs to know
 * how much there is, be able to come back to page 4, and share a link to it.
 */
export function Pagination({ pagination, onPageChange, className = '' }) {
  if (!pagination) return null;
  const { page, limit, total, totalPages } = pagination;
  if (total === 0) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <nav
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-5 py-3 ${className}`}
      aria-label="Pagination"
    >
      <p className="text-xs text-ink-500" aria-live="polite">
        Showing <span className="font-medium text-ink-700">{count(first)}</span>–
        <span className="font-medium text-ink-700">{count(last)}</span> of{' '}
        <span className="font-medium text-ink-700">{count(total)}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Previous
        </Button>
        <span className="px-1 text-xs text-ink-500">
          Page {count(page)} of {count(totalPages)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

/** A label/value pair, for detail panels. */
export function DetailRow({ label, children, className = '' }) {
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${className}`}>
      <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="text-sm text-ink-900">{children ?? <span className="text-ink-400">—</span>}</dd>
    </div>
  );
}

export function DetailList({ children, className = '' }) {
  return <dl className={`space-y-2.5 ${className}`}>{children}</dl>;
}
