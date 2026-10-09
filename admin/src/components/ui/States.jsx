import { AlertTriangle, Inbox, Loader2, RefreshCw, ShieldOff, WifiOff } from 'lucide-react';
import { Button } from './Button.jsx';
import { ERROR_CODES } from '../../services/api.js';

/** A single shimmering block. Composed into page-shaped skeletons. */
export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded ${className}`} aria-hidden="true" />;
}

export function LoadingBlock({ label = 'Loading' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-500">
      <Loader2 className="size-6 animate-spin text-brand" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** The whole-screen version, for the session check before anything renders. */
export function FullPageLoader({ label = 'Checking your session' }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-ink-50 text-ink-500">
      <Loader2 className="size-7 animate-spin text-brand" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ title, description, action, icon: Icon = Inbox, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-ink-100">
        <Icon className="size-5 text-ink-500" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * The one place an error becomes something the operator can act on.
 *
 * A lost connection, a rate limit and a permission refusal all read
 * differently and lead somewhere different, and none of them ever shows an
 * internal message or a stack trace.
 */
export function ErrorState({ error, onRetry, className = '' }) {
  const isNetwork = error?.code === ERROR_CODES.NETWORK;
  const isRateLimited = error?.code === ERROR_CODES.RATE_LIMITED || error?.status === 429;
  const isForbidden = error?.status === 403;

  const Icon = isNetwork ? WifiOff : isForbidden ? ShieldOff : AlertTriangle;
  const title = isNetwork
    ? 'Cannot reach the API'
    : isRateLimited
      ? 'Too many requests'
      : isForbidden
        ? 'Not permitted'
        : 'That did not load';

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border border-bad/20 bg-bad-soft/50 px-6 py-10 text-center ${className}`}
      role="alert"
    >
      <Icon className="mb-3 size-6 text-bad" aria-hidden="true" />
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-ink-600">
        {error?.message ?? 'Something went wrong. Please try again.'}
      </p>
      {isNetwork && (
        <p className="mt-2 max-w-md text-xs text-ink-500">
          The backend should be running on port 4000. Start it with{' '}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">npm run dev</code> in
          the <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">backend</code>{' '}
          folder.
        </p>
      )}
      {onRetry && !isRateLimited && !isForbidden && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-5">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Try again
        </Button>
      )}
      {error?.requestId && (
        <p className="mt-4 font-mono text-[11px] text-ink-400">Reference: {error.requestId}</p>
      )}
    </div>
  );
}

/**
 * Renders loading, error and empty consistently and the children only when
 * there is something to show. Every list page in the console uses this, which
 * is what keeps the three states from drifting apart page by page.
 */
export function Resource({
  loading,
  error,
  isEmpty,
  onRetry,
  skeleton,
  empty,
  children,
  loadingLabel,
}) {
  if (loading) return skeleton ?? <LoadingBlock label={loadingLabel} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isEmpty) return empty ?? <EmptyState title="Nothing here yet" />;
  return children;
}
