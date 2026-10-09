import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keeps a list page's filters in the URL.
 *
 * An operator who has narrowed a booking list to one venue and one date needs
 * to be able to send that view to a colleague, reload it, and come back to it
 * from browser history. Holding filter state in component state only would
 * lose all three.
 *
 * `defaults` declares the shape. A value equal to its default is removed from
 * the query string rather than written, so a clean view has a clean URL.
 */
export function useFilters(defaults = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const values = useMemo(() => {
    const result = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const raw = searchParams.get(key);
      if (raw === null) continue;
      result[key] = typeof defaults[key] === 'number' ? Number(raw) || defaults[key] : raw;
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setFilters = useCallback(
    (changes, { resetPage = true } = {}) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            const isDefault = value === defaults[key];
            if (value === '' || value === null || value === undefined || isDefault) {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          }
          // Changing a filter while on page 4 would otherwise show an empty
          // page of a now-shorter list.
          if (resetPage && !('page' in changes) && 'page' in defaults) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSearchParams],
  );

  const clear = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const activeCount = useMemo(
    () =>
      Object.keys(defaults).filter(
        (key) => key !== 'page' && searchParams.get(key) !== null && searchParams.get(key) !== '',
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams],
  );

  return { filters: values, setFilters, clear, activeCount };
}

/**
 * Delays a value so a filtered request is not fired on every keystroke.
 *
 * This reduces requests; it does not make them ordered. Out-of-order responses
 * are handled by the sequence number in useResource, because a debounce still
 * allows two requests to be in flight when typing resumes.
 */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * A text input that drives a URL filter without lagging behind the keyboard.
 *
 * The input is local state so typing is immediate; the URL and the request
 * follow after the debounce. An external change — the Clear button, the back
 * button — is adopted, but only while the field is not being typed in, so a
 * re-render cannot overwrite a half-typed word.
 */
export function useSearchInput(urlValue, onCommit, delay = 350) {
  const [text, setText] = useState(urlValue ?? '');
  const debounced = useDebounced(text, delay);
  const lastCommitted = useRef(urlValue ?? '');
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setText(urlValue ?? '');
    lastCommitted.current = urlValue ?? '';
  }, [urlValue]);

  useEffect(() => {
    if (debounced === lastCommitted.current) return;
    lastCommitted.current = debounced;
    onCommit(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return {
    value: text,
    onChange: (event) => setText(event.target.value),
    onFocus: () => {
      focusedRef.current = true;
    },
    onBlur: () => {
      focusedRef.current = false;
    },
  };
}
