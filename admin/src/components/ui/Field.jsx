import { useId } from 'react';
import { AlertCircle } from 'lucide-react';

const CONTROL =
  'w-full rounded-lg border bg-white px-3 text-sm text-ink-900 transition-colors ' +
  'placeholder:text-ink-400 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500';

function shell(invalid) {
  return invalid
    ? `${CONTROL} border-bad/50 focus:border-bad`
    : `${CONTROL} border-ink-200 hover:border-ink-300 focus:border-brand`;
}

/**
 * Label, control, hint and error in one place.
 *
 * The error is wired with aria-describedby and aria-invalid rather than only
 * being coloured, so a form that fails validation is navigable by keyboard and
 * announced by a screen reader instead of merely looking wrong.
 */
function Wrapper({ id, label, hint, error, required, children, className = '' }) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
          {label}
          {required && (
            <span className="ml-0.5 text-bad" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children({ hintId, errorId })}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 flex items-start gap-1 text-xs text-bad">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  required,
  className = '',
  type = 'text',
  prefix,
  id: providedId,
  ...props
}) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <Wrapper
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {({ hintId, errorId }) => (
        <div className="relative">
          {prefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">
              {prefix}
            </span>
          )}
          <input
            id={id}
            type={type}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            aria-required={required || undefined}
            className={`${shell(Boolean(error))} h-10 ${prefix ? 'pl-7' : ''}`}
            {...props}
          />
        </div>
      )}
    </Wrapper>
  );
}

export function TextArea({
  label,
  hint,
  error,
  required,
  rows = 4,
  className = '',
  id: providedId,
  ...props
}) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <Wrapper
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {({ hintId, errorId }) => (
        <textarea
          id={id}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          aria-required={required || undefined}
          className={`${shell(Boolean(error))} resize-y py-2.5 leading-relaxed`}
          {...props}
        />
      )}
    </Wrapper>
  );
}

/**
 * A native select. `placeholder` renders a disabled first option so an
 * unchosen value is visibly unchosen rather than silently defaulting to
 * whatever happens to be first.
 */
export function Select({
  label,
  hint,
  error,
  required,
  options = [],
  placeholder,
  className = '',
  id: providedId,
  ...props
}) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <Wrapper
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {({ hintId, errorId }) => (
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          aria-required={required || undefined}
          className={`${shell(Boolean(error))} h-10 pr-8`}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Wrapper>
  );
}

export function Checkbox({ label, hint, id: providedId, className = '', ...props }) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-ink-300 text-brand accent-brand"
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm text-ink-800">
          {label}
        </label>
        {hint && <p className="text-xs text-ink-500">{hint}</p>}
      </div>
    </div>
  );
}
