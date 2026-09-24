import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../services/apiClient.js';

/**
 * Loads data from the API with loading / error / retry handling.
 * `path` may be null to skip loading. Changing `path` reloads automatically.
 */
export function useApi(path, { initial = null, keepPrevious = true } = {}) {
  const [state, setState] = useState({ data: initial, error: null, loading: Boolean(path) });
  const [version, setVersion] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) {
      setState({ data: initial, error: null, loading: false });
      return undefined;
    }
    const controller = new AbortController();
    setState((s) => ({ data: keepPrevious ? s.data : initial, error: null, loading: true }));
    apiRequest(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState((s) => ({ data: s.data, error, loading: false }));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload, setData };
}

/** Builds "?a=1&b=2" from an object, skipping empty values. */
export function qs(params) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
