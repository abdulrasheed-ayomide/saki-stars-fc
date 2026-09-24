import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../services/apiClient.js';

const SLOW_AFTER_MS = 3_000; // show the "waking up" notice only if the server is slow
const RETRY_EVERY_MS = 5_000;
const GIVE_UP_AFTER_MS = 90_000; // Render free-tier cold starts can take close to a minute

/**
 * Tracks whether the API is reachable (free-tier servers sleep when idle).
 * status: 'checking' | 'online' | 'waking' | 'offline'
 */
export function useServerStatus() {
  const [status, setStatus] = useState('checking');
  const [attempt, setAttempt] = useState(0);
  const startedAt = useRef(0);

  const retry = useCallback(() => {
    setStatus('checking');
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timers = [];
    let finished = false;
    startedAt.current = Date.now();

    timers.push(
      setTimeout(() => {
        if (!finished) setStatus('waking');
      }, SLOW_AFTER_MS),
    );

    async function check() {
      try {
        await apiRequest('/health', { signal: controller.signal, timeoutMs: 20_000 });
        finished = true;
        setStatus('online');
      } catch {
        if (controller.signal.aborted) return;
        if (Date.now() - startedAt.current >= GIVE_UP_AFTER_MS) {
          finished = true;
          setStatus('offline');
          return;
        }
        setStatus('waking');
        timers.push(setTimeout(check, RETRY_EVERY_MS));
      }
    }

    check();

    return () => {
      controller.abort();
      timers.forEach(clearTimeout);
    };
  }, [attempt]);

  return { status, retry };
}
