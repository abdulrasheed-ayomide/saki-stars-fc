import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';

export function Breadcrumbs({ items }) {
  if (!items?.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight aria-hidden="true" className="size-3.5" />}
            {item.to ? (
              <Link to={item.to} className="inline-flex min-h-10 items-center hover:text-brand-800 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-slate-700">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Title row used on dashboard and account pages. */
export function PageHeader({ title, description, actions, breadcrumbs }) {
  return (
    <div className="mb-6">
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[clamp(1.4rem,4vw,1.9rem)] font-bold leading-tight text-brand-900">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
