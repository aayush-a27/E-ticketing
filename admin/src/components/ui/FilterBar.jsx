import { Search, X } from 'lucide-react';
import { Button } from './Button.jsx';
import { useSearchInput } from '../../hooks/useFilters.js';

/**
 * The filter row above a list.
 *
 * Every control writes to the URL, so a narrowed view is shareable, survives a
 * reload and works with the back button. `activeCount` makes it obvious that a
 * short list is the result of a filter rather than of there being nothing
 * there — the mistake that has an operator convinced data is missing.
 */
export function FilterBar({ children, activeCount, onClear, className = '' }) {
  return (
    <div
      className={`flex flex-wrap items-end gap-2.5 border-b border-ink-200 px-4 py-3 ${className}`}
    >
      {children}
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
          <X className="size-3.5" aria-hidden="true" />
          Clear {activeCount} {activeCount === 1 ? 'filter' : 'filters'}
        </Button>
      )}
    </div>
  );
}

/** The search field, debounced, with its text held locally while typing. */
export function SearchField({ value, onCommit, placeholder = 'Search', label = 'Search' }) {
  const input = useSearchInput(value, onCommit);

  return (
    <div className="min-w-[12rem] flex-1">
      <label className="mb-1.5 block text-xs font-medium text-ink-600" htmlFor="filter-search">
        {label}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400"
          aria-hidden="true"
        />
        <input
          id="filter-search"
          type="search"
          placeholder={placeholder}
          className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-8 pr-3 text-sm text-ink-900 transition-colors placeholder:text-ink-400 hover:border-ink-300 focus:border-brand"
          {...input}
        />
      </div>
    </div>
  );
}

/** A compact select for the filter row, narrower than the form Select. */
export function FilterSelect({ label, value, onChange, options, placeholder = 'All', id }) {
  const fieldId = id ?? `filter-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="min-w-[8.5rem]">
      <label className="mb-1.5 block text-xs font-medium text-ink-600" htmlFor={fieldId}>
        {label}
      </label>
      <select
        id={fieldId}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 pr-7 text-sm text-ink-900 transition-colors hover:border-ink-300 focus:border-brand"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterDate({ label, value, onChange, id }) {
  const fieldId = id ?? `filter-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="min-w-[9.5rem]">
      <label className="mb-1.5 block text-xs font-medium text-ink-600" htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        type="date"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-sm text-ink-900 transition-colors hover:border-ink-300 focus:border-brand"
      />
    </div>
  );
}
