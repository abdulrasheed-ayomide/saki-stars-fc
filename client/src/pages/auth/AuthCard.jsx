import { Container } from '../../components/layout/Container.jsx';

export function AuthCard({ title, description, children, footer }) {
  return (
    <Container className="py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-sm xs:p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-brand-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mx-auto mt-4 max-w-md text-center text-sm text-slate-600">{footer}</div>}
    </Container>
  );
}
