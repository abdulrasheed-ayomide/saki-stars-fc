export function Card({ as: Tag = 'div', className = '', children, ...props }) {
  return (
    <Tag className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeading({ title, eyebrow, action, id, className = '' }) {
  return (
    <div className={`mb-5 flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-600">{eyebrow}</p>}
        <h2 id={id} className="text-[clamp(1.35rem,4vw,1.75rem)] font-bold leading-tight text-brand-900">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
