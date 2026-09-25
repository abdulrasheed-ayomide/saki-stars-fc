import { AlertTriangle, CheckCircle2, Info, RefreshCw, XCircle } from 'lucide-react';
import { Button } from './Button.jsx';
import { classifyError, errorTitle, isRetryable, userMessage } from '../../lib/errors.js';

const TONES = {
  info: ['border-brand-200 bg-brand-50 text-brand-900', Info],
  success: ['border-emerald-200 bg-emerald-50 text-emerald-900', CheckCircle2],
  warning: ['border-amber-200 bg-amber-50 text-amber-900', AlertTriangle],
  error: ['border-red-200 bg-red-50 text-red-900', XCircle],
};

export function Alert({ tone = 'info', title, children, className = '', action }) {
  const [cls, Icon] = TONES[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-lg border p-3 text-sm ${cls} ${className}`}>
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, className = '' }) {
  return (
    <div className={`rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-10 text-center ${className}`}>
      {Icon && <Icon aria-hidden="true" className="mx-auto size-8 text-slate-400" />}
      <p className="mt-2 font-semibold text-slate-800">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-slate-600">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Friendly error panel. Never shows technical text: the message comes from userMessage(),
 * worded for the part of the site given by `context` (see lib/errors.js). "Try again" re-runs
 * the failed request and is only offered when retrying can help.
 */
export function ErrorState({ error, onRetry, title, context = 'default', className = '' }) {
  const retry = onRetry && isRetryable(error);
  // The heading already says what is unavailable; the body then only says what to do.
  const body = ['server', 'unexpected', 'aborted'].includes(classifyError(error)) ? 'Please try again in a moment.' : userMessage(error, context);
  return (
    <div role="alert" className={`rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center text-red-900 ${className}`}>
      <AlertTriangle aria-hidden="true" className="mx-auto size-8" />
      <p className="mt-2 font-semibold">{title || errorTitle(context)}</p>
      <p className="mx-auto mt-1 max-w-md text-sm">{body}</p>
      {error?.requestId && <p className="mt-1 text-xs text-red-700">Reference: {error.requestId}</p>}
      {retry && (
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={onRetry} className="mt-4">
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

export function SkeletonList({ rows = 4, className = '' }) {
  return (
    <div role="status" className={`space-y-3 ${className}`}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

export function SkeletonGrid({ items = 6, className = 'grid-cols-1 xs:grid-cols-2 lg:grid-cols-3', itemClass = 'h-56' }) {
  return (
    <div role="status" className={`grid gap-4 ${className}`}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: items }, (_, i) => (
        <Skeleton key={i} className={itemClass} />
      ))}
    </div>
  );
}

/**
 * Standard loading / error / empty handling for a useApi() result.
 * Renders children(data) once there is data.
 */
export function AsyncContent({ state, loading, empty, isEmpty, errorTitle: title, context, children }) {
  if (state.error && !state.data) return <ErrorState error={state.error} onRetry={state.reload} title={title} context={context} />;
  if (state.loading && !state.data) return loading ?? <SkeletonList />;
  if (!state.data) return null;
  if (isEmpty?.(state.data)) return empty ?? null;
  return children(state.data);
}
