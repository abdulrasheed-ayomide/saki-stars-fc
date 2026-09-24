import { useEffect, useState } from 'react';
import { serverNow } from '../../services/apiClient.js';

function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

/** Countdown to kick-off, using server time so a wrong phone clock does not mislead. */
export function Countdown({ to, tone = 'dark', className = '' }) {
  const target = new Date(to).getTime();
  const [left, setLeft] = useState(() => target - serverNow());
  useEffect(() => {
    const t = setInterval(() => setLeft(target - serverNow()), 1000);
    return () => clearInterval(t);
  }, [target]);

  if (left <= 0) return <p className={`text-sm font-semibold ${tone === 'dark' ? 'text-brand-100' : 'text-brand-800'}`}>Kick-off time has arrived</p>;
  const p = parts(left);
  const box = tone === 'dark' ? 'bg-white/10 text-white' : 'bg-brand-50 text-brand-900';
  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="timer" aria-label={`${p.days} days ${p.hours} hours ${p.minutes} minutes until kick-off`}>
      {[
        ['days', p.days],
        ['hrs', p.hours],
        ['min', p.minutes],
        ['sec', p.seconds],
      ].map(([label, value]) => (
        <div key={label} aria-hidden="true" className={`min-w-14 rounded-md px-2 py-1.5 text-center ${box}`}>
          <span className="block text-xl font-bold tabular-nums">{String(value).padStart(2, '0')}</span>
          <span className="block text-[11px] uppercase tracking-wide opacity-80">{label}</span>
        </div>
      ))}
    </div>
  );
}
