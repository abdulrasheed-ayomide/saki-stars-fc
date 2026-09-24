import { useId, useRef } from 'react';

/** Accessible tabs (arrow keys move between tabs). Content is rendered by the parent. */
export function Tabs({ tabs, value, onChange, label, className = '' }) {
  const id = useId();
  const refs = useRef([]);
  function onKeyDown(e, index) {
    let next = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next !== null) {
      e.preventDefault();
      onChange(tabs[next].value);
      refs.current[next]?.focus();
    }
  }
  return (
    <div className={`relative overflow-x-auto border-b border-slate-200 ${className}`}>
      <div role="tablist" aria-label={label} className="flex min-w-max gap-1">
        {tabs.map((t, i) => {
          const selected = t.value === value;
          return (
            <button
              key={t.value}
              ref={(el) => (refs.current[i] = el)}
              id={`${id}-${t.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-semibold ${selected ? 'border-brand-700 text-brand-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
            >
              {t.label}
              {t.count != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-700">{t.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
