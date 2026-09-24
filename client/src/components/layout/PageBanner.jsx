import { Container } from './Container.jsx';
import { Breadcrumbs } from '../ui/PageHeader.jsx';

/** Dark-blue title band used at the top of public pages. */
export function PageBanner({ title, description, eyebrow, breadcrumbs, children }) {
  return (
    <div className="bg-brand-900 text-white">
      <Container className="py-8 sm:py-12">
        {breadcrumbs && (
          <div className="[&_a]:text-brand-200 [&_a:hover]:text-white [&_span]:text-brand-100 [&_svg]:text-brand-300 [&_ol]:text-brand-200">
            <Breadcrumbs items={breadcrumbs} />
          </div>
        )}
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-200">{eyebrow}</p>}
        <h1 className="mt-1 text-[clamp(1.6rem,6vw,2.75rem)] font-bold leading-tight">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-brand-100">{description}</p>}
        {children}
      </Container>
    </div>
  );
}
