import { Link } from 'react-router';
import { Container } from '../layout/Container.jsx';

/**
 * Full-page message used for not-found and error states.
 */
export function StatusMessage({ icon: Icon, eyebrow, title, children, actions }) {
  return (
    <Container className="py-12 sm:py-20">
      <div className="mx-auto max-w-xl text-center">
        {Icon && <Icon aria-hidden="true" className="mx-auto size-10 text-brand-600" />}
        {eyebrow && <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-brand-600">{eyebrow}</p>}
        <h1 className="mt-2 text-[clamp(1.5rem,6vw,2.25rem)] font-bold leading-tight text-brand-900">{title}</h1>
        {children && <div className="mt-3 text-base text-slate-600">{children}</div>}
        <div className="mt-6 flex flex-col items-stretch justify-center gap-2 xs:flex-row xs:items-center">
          {actions ?? (
            <Link
              to="/"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-900 px-5 font-semibold text-white hover:bg-brand-800"
            >
              Go to homepage
            </Link>
          )}
        </div>
      </div>
    </Container>
  );
}
