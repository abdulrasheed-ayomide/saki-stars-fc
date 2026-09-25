import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { userMessage } from '../../lib/errors.js';

/** Runs an API action with a busy flag and success/error toasts. */
export function useAction() {
  const { notify } = useToast();
  const [busy, setBusy] = useState(null);
  const run = useCallback(
    async (key, fn, success) => {
      setBusy(key);
      try {
        const result = await fn();
        if (success) notify(typeof success === 'function' ? success(result) : success);
        return result;
      } catch (err) {
        notify(userMessage(err, 'save'), 'error');
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [notify],
  );
  return { run, busy };
}

// Shared look-ups for form dropdowns (loaded once per page).
export function useTeams({ clubOnly = false } = {}) {
  const state = useApi(`/admin/teams?limit=200${clubOnly ? '&isClubTeam=true' : ''}`);
  return state.data?.items || [];
}

export function useCompetitions() {
  return useApi('/admin/competitions').data || [];
}

export function useSeasons() {
  return useApi('/seasons').data || [];
}

export function FilterBar({ children }) {
  return <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 xs:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

export function Stat({ label, value, to, tone = 'default' }) {
  const cls = tone === 'attention' && value > 0 ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white';
  const body = (
    <>
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="mt-1 text-3xl font-bold tabular-nums text-brand-900">{value}</dd>
    </>
  );
  return to ? (
    <Link to={to} className={`block rounded-lg border p-4 shadow-sm hover:border-brand-300 ${cls}`}>
      <dl>{body}</dl>
    </Link>
  ) : (
    <dl className={`rounded-lg border p-4 shadow-sm ${cls}`}>{body}</dl>
  );
}
