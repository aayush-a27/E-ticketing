import { useId, useState } from 'react';
import { AlertCircle, Plus, X } from 'lucide-react';

/**
 * A list of short strings — genres, languages, amenities.
 *
 * Enter and comma both commit, because people type both. Backspace in an empty
 * field removes the last chip, which is what makes correcting a mistake
 * quicker than reaching for the mouse. Duplicates are refused silently rather
 * than scolded: the value is already there, which is what the operator wanted.
 */
export function TagInput({
  label,
  hint,
  error,
  required,
  value = [],
  onChange,
  suggestions = [],
  placeholder = 'Type and press Enter',
  max,
  className = '',
}) {
  const id = useId();
  const [draft, setDraft] = useState('');

  const atLimit = typeof max === 'number' && value.length >= max;
  const remaining = suggestions.filter((item) => !value.includes(item));

  const add = (raw) => {
    const entry = raw.trim();
    if (!entry || atLimit) return;
    if (value.some((item) => item.toLowerCase() === entry.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, entry]);
    setDraft('');
  };

  const removeAt = (index) => onChange(value.filter((_, position) => position !== index));

  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(draft);
      return;
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault();
      removeAt(value.length - 1);
    }
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
        {label}
        {required && (
          <span className="ml-0.5 text-bad" aria-hidden="true">
            *
          </span>
        )}
        {typeof max === 'number' && (
          <span className="ml-1.5 text-xs font-normal text-ink-500">
            {value.length}/{max}
          </span>
        )}
      </label>

      <div
        className={`flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 transition-colors ${
          error ? 'border-bad/50' : 'border-ink-200 focus-within:border-brand hover:border-ink-300'
        }`}
      >
        {value.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="inline-flex items-center gap-1 rounded-md bg-ink-100 py-0.5 pl-2 pr-1 text-xs text-ink-800"
          >
            {item}
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="rounded p-0.5 text-ink-500 transition-colors hover:bg-ink-200 hover:text-ink-900"
              aria-label={`Remove ${item}`}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          // Committing on blur stops a typed-but-unsubmitted value being lost
          // when the operator tabs straight to Save.
          onBlur={() => add(draft)}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={atLimit}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm text-ink-900 outline-none placeholder:text-ink-400 disabled:cursor-not-allowed"
        />
      </div>

      {remaining.length > 0 && !atLimit && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {remaining.slice(0, 10).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => add(item)}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-ink-300 px-1.5 py-0.5 text-xs text-ink-600 transition-colors hover:border-brand hover:text-brand-strong"
            >
              <Plus className="size-2.5" aria-hidden="true" />
              {item}
            </button>
          ))}
        </div>
      )}

      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1 text-xs text-bad">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
