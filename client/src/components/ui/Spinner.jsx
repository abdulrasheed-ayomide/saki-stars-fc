export function Spinner({ className = 'size-6' }) {
  return <span aria-hidden="true" className={`inline-block animate-spin rounded-full border-4 border-brand-100 border-t-brand-700 ${className}`} />;
}

export function PageSpinner({ label = 'Loading…' }) {
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status">
      <span className="sr-only">{label}</span>
      <Spinner className="size-8" />
    </div>
  );
}
