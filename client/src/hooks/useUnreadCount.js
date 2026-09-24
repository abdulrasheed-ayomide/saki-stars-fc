import { useEffect, useState } from 'react';
import { apiRequest } from '../services/apiClient.js';
import { useAuth } from '../auth/AuthProvider.jsx';

const EVENT = 'ssfc:notifications-changed';

/** Tell badges to refresh after the user reads notifications. */
export function notificationsChanged() {
  window.dispatchEvent(new Event(EVENT));
}

/** Unread notification count, refreshed every minute while signed in. */
export function useUnreadCount() {
  const { status } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (status !== 'authenticated') {
      setCount(0);
      return undefined;
    }
    let alive = true;
    const load = () =>
      apiRequest('/notifications/unread-count')
        .then((d) => alive && setCount(d.unread))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener(EVENT, load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener(EVENT, load);
    };
  }, [status]);
  return count;
}
