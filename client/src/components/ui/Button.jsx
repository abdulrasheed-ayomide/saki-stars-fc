import { forwardRef } from 'react';
import { Link } from 'react-router';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-brand-900 text-white hover:bg-brand-800 disabled:bg-brand-900/60',
  secondary: 'bg-brand-50 text-brand-900 hover:bg-brand-100 disabled:opacity-60',
  outline: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-60',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:opacity-60',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-700/60',
  'danger-outline': 'border border-red-300 bg-white text-red-700 hover:bg-red-50 disabled:opacity-60',
  light: 'bg-white text-brand-900 hover:bg-brand-50',
  'outline-light': 'border border-white/60 text-white hover:bg-white/10',
};
const SIZES = {
  sm: 'min-h-10 px-3 text-sm gap-1.5',
  md: 'min-h-11 px-4 text-sm gap-2',
  lg: 'min-h-12 px-5 text-base gap-2',
};

export function buttonClass({ variant = 'primary', size = 'md', className = '' } = {}) {
  return `inline-flex min-w-10 items-center justify-center rounded-md font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

export const Button = forwardRef(function Button(
  { variant, size, className, loading = false, icon: Icon, children, type = 'button', disabled, ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass({ variant, size, className })} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" /> : Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
});

export function ButtonLink({ to, variant, size, className, icon: Icon, children, ...props }) {
  return (
    <Link to={to} className={buttonClass({ variant, size, className })} {...props}>
      {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
      {children}
    </Link>
  );
}

/** Square icon-only button with an accessible label. */
export function IconButton({ label, icon: Icon, className = '', variant = 'ghost', ...props }) {
  return (
    <button type="button" aria-label={label} title={label} className={`${buttonClass({ variant, size: 'md', className: `!px-0 size-11 ${className}` })}`} {...props}>
      <Icon aria-hidden="true" className="size-5" />
    </button>
  );
}
