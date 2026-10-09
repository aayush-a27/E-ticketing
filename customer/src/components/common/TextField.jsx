import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * A labelled input with accessible error wiring: the message is tied to the
 * field with aria-describedby and announced, rather than only turning red.
 */
export const TextField = forwardRef(function TextField(
  { label, error, hint, type = 'text', className = '', id, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);
  const inputType = isPassword && revealed ? 'text' : type;

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-ivory-dim">
        {label}
      </label>

      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          type={inputType}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[error ? errorId : null, hint ? hintId : null]
            .filter(Boolean)
            .join(' ') || undefined}
          className={[
            'neu-inset w-full rounded-xl px-4 py-3 text-ivory placeholder:text-ivory-muted/60',
            'transition focus:border-amber-brand',
            isPassword ? 'pr-12' : '',
            error ? 'border-status-bad' : '',
          ].join(' ')}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            className="absolute inset-y-0 right-0 flex items-center px-3.5 text-ivory-muted transition hover:text-ivory"
            aria-label={revealed ? 'Hide password' : 'Show password'}
            tabIndex={0}
          >
            {revealed ? (
              <EyeOff className="size-4.5" aria-hidden="true" />
            ) : (
              <Eye className="size-4.5" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-ivory-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-status-bad">
          {error}
        </p>
      )}
    </div>
  );
});
