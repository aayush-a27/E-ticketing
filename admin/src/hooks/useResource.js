import { useCallback, useEffect, useRef, useState } from 'react';
import { ERROR_CODES } from '../services/api.js';

/**
 * Fetches a resource and tracks loading, error and empty states in one place,
 * so every page handles them the same way.
 *
 * Two guarantees:
 *   - an in-flight request is aborted when its inputs change or the component
 *     unmounts, so nothing is set on a gone component;
 *   - a slow earlier response can never overwrite a newer one, because each
 *     run carries a sequence number and only the latest is allowed to land.
 *     This matters on a filtered table, where typing fires several requests
 *     and the first one to return is often not the one you want.
 */
export function useResource(fetcher, deps = [], { enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(enabled);

  const sequenceRef = useRef(0);
  const controllerRef = useRef(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const sequence = ++sequenceRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await fetcherRef.current({ signal: controller.signal });
      if (sequence !== sequenceRef.current) return; // a newer run won
      setData(result);
    } catch (caught) {
      if (caught?.code === ERROR_CODES.CANCELLED) return;
      if (sequence !== sequenceRef.current) return;
      setError(caught);
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    run();
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  return { data, error, loading, refetch: run, setData };
}
