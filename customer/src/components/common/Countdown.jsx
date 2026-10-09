import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { formatCountdown } from '../../utils/format.js';

/**
 * Counts down to a server-supplied expiry.
 *
 * Derived from the `expiresAt` timestamp rather than a local tally, so a
 * sleeping tab or a slow device cannot drift. The display is advisory: the
 * server decides when a hold is actually gone, and this never extends or
 * releases anything on its own.
 */
export function useCountdown(expiresAt, onExpire) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    expiresAt ? Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000)) : 0,
  );

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const firedRef = useRef(false);

  useEffect(() => {
    if (!expiresAt) return undefined;
    firedRef.current = false;

    const tick = () => {
      const remaining = Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000));
      setSecondsLeft(remaining);

      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current?.();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return secondsLeft;
}

export function CountdownBadge({ secondsLeft, className = '' }) {
  const urgent = secondsLeft <= 60;
  const expired = secondsLeft <= 0;

  return (
    <div
      className={[
        'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold tabular-nums transition-colors',
        expired
          ? 'bg-status-bad/15 text-status-bad'
          : urgent
            ? 'bg-status-warn/15 text-status-warn'
            : 'neu text-ivory',
        className,
      ].join(' ')}
      role="timer"
      aria-live={urgent ? 'assertive' : 'off'}
      aria-atomic="true"
    >
      <Timer className="size-4" aria-hidden="true" />
      {expired ? 'Expired' : formatCountdown(secondsLeft)}
      <span className="sr-only">
        {expired ? 'Your seat hold has expired' : `remaining to complete your booking`}
      </span>
    </div>
  );
}
