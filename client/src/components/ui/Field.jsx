import { cloneElement, forwardRef, isValidElement, useId } from 'react';

/**
 * Label + control + hint + error, wired together for screen readers
 * (aria-describedby / aria-invalid). Pass a single control as the child.
 */
export function Field({ label, hint, error, required, children, className = '', labelHidden = false }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id: children.props.id || id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required: children.props.required ?? required })
    : children;
  return (
    <div className={`min-w-0 ${className}`}>
      {label && (
        <label htmlFor={children?.props?.id || id} className={labelHidden ? 'sr-only' : 'mb-1 block text-sm font-medium text-slate-800'}>
          {label}
          {required && <span aria-hidden="true" className="text-red-700"> *</span>}
        </label>
      )}
      {control}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

const base =
  'block w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500';

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`${base} min-h-11 ${className}`} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className = '', rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={`${base} py-2 ${className}`} {...props} />;
});

export const Select = forwardRef(function Select({ className = '', children, ...props }, ref) {
  return (
    <select ref={ref} className={`${base} min-h-11 pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
});

export function Checkbox({ label, hint, className = '', ...props }) {
  const id = useId();
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <input id={id} type="checkbox" className="mt-2.5 size-5 shrink-0 rounded border-slate-400 text-brand-700 focus:ring-brand-500" {...props} />
      <label htmlFor={id} className="min-w-0 py-2.5 text-sm text-slate-800">
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </label>
    </div>
  );
}
