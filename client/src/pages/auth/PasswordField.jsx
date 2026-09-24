import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Password input with show/hide and optional strength guidance. Pass through Field for label/errors. */
export function PasswordField({ value, onChange, autoComplete = 'current-password', showRules = false, ...props }) {
  const [visible, setVisible] = useState(false);
  const rules = [
    [value.length >= 10, 'At least 10 characters'],
    [/[A-Za-z]/.test(value) && /[0-9]/.test(value), 'Letters and numbers'],
  ];
  return (
    <div>
      <div className="relative">
        <input
          {...props}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          className="block min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 pr-12 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 aria-[invalid=true]:border-red-500"
        />
        <button type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 hover:text-slate-800">
          {visible ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
        </button>
      </div>
      {showRules && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {rules.map(([ok, label]) => (
            <li key={label} className={ok ? 'text-emerald-700' : 'text-slate-500'}>
              {ok ? '✓' : '•'} {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
