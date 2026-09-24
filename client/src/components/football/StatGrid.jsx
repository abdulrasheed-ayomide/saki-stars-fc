import { STAT_LABELS } from '../../lib/labels.js';

export function StatGrid({ stats, keys = STAT_LABELS, className = '' }) {
  if (!stats) return null;
  return (
    <dl className={`grid grid-cols-2 gap-2 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 ${className}`}>
      {keys.map(([key, label]) => (
        <div key={key} className="rounded-md bg-brand-50 px-3 py-2 text-center">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</dt>
          <dd className="text-xl font-bold tabular-nums text-brand-900">{stats[key] ?? 0}</dd>
        </div>
      ))}
    </dl>
  );
}
