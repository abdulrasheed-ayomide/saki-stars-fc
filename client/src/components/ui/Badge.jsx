const TONES = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  dark: 'bg-brand-900 text-white ring-brand-900',
};

export function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]} ${className}`}>{children}</span>;
}

const STATUS_TONES = {
  active: 'success',
  published: 'success',
  approved: 'success',
  completed: 'success',
  subscribed: 'success',
  reviewed: 'success',
  live: 'danger',
  pending: 'warning',
  review: 'warning',
  submitted: 'warning',
  under_review: 'warning',
  reported: 'warning',
  new: 'brand',
  scheduled: 'brand',
  open: 'brand',
  in_progress: 'brand',
  draft: 'neutral',
  archived: 'neutral',
  hidden: 'neutral',
  inactive: 'neutral',
  postponed: 'warning',
  suspended: 'danger',
  deactivated: 'danger',
  rejected: 'danger',
  cancelled: 'danger',
  abandoned: 'danger',
  removed: 'danger',
  spam: 'danger',
  withdrawn: 'neutral',
  read: 'neutral',
  replied: 'success',
  success: 'success',
  failure: 'danger',
  denied: 'danger',
};

export function StatusBadge({ status, label }) {
  return <Badge tone={STATUS_TONES[status] || 'neutral'}>{label || String(status || '').replace(/_/g, ' ')}</Badge>;
}
