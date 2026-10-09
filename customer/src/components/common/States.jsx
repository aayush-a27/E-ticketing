import { AlertTriangle, Inbox, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from './Button.jsx';
import { ERROR_CODES } from '../../services/api.js';

/** A single shimmering block. Composed into page-shaped skeletons below. */
export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded-lg ${className}`} aria-hidden="true" />;
}

export function MovieCardSkeleton() {
  return (
    <div className="space-y-3">
      {/* 2:3 is the poster standard, not a golden-ratio decision. */}
      <Skeleton className="aspect-[2/3] w-full rounded-xl" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
    </div>
  );
}

export function MovieGridSkeleton({ count = 10 }) {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      aria-busy="true"
      aria-label="Loading movies"
    >
      {Array.from({ length: count }, (_, index) => (
        <MovieCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function ShowListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading shows">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card-surface space-y-4 p-5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-80 max-w-full" />
          <div className="flex flex-wrap gap-2.5">
            {Array.from({ length: 5 }, (_, chip) => (
              <Skeleton key={chip} className="h-10 w-24 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-ivory-muted">
      <Loader2 className="size-7 animate-spin text-amber-brand" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ title, description, action, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-line px-6 py-16 text-center">
      <div className="neu mb-5 flex size-14 items-center justify-center rounded-full">
        <Icon className="size-6 text-ivory-muted" aria-hidden="true" />
      </div>
      <h3 className="text-lg text-ivory">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-ivory-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/**
 * The one place an error is turned into something a customer can act on.
 * Rate limiting and connection loss read differently from a genuine fault,
 * and none of them ever shows an internal message.
 */
export function ErrorState({ error, onRetry, className = '' }) {
  const isNetwork = error?.code === ERROR_CODES.NETWORK;
  const isRateLimited = error?.code === ERROR_CODES.RATE_LIMITED || error?.status === 429;

  const title = isNetwork
    ? 'No connection'
    : isRateLimited
      ? 'Slow down a moment'
      : 'That did not load';

  const Icon = isNetwork ? WifiOff : AlertTriangle;

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-status-bad/25 bg-status-bad/5 px-6 py-14 text-center ${className}`}
      role="alert"
    >
      <Icon className="mb-4 size-7 text-status-bad" aria-hidden="true" />
      <h3 className="text-lg text-ivory">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-ivory-muted">
        {error?.message ?? 'Something went wrong. Please try again.'}
      </p>
      {onRetry && !isRateLimited && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-6">
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </Button>
      )}
      {error?.requestId && (
        <p className="mt-4 font-mono text-[11px] text-ivory-muted/60">
          Reference: {error.requestId}
        </p>
      )}
    </div>
  );
}
