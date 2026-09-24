import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button.jsx';

export function Pagination({ page = 1, pages = 1, onChange, className = '' }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className={`flex items-center justify-between gap-2 ${className}`}>
      <Button variant="outline" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <p className="text-sm text-slate-600">
        Page {page} of {pages}
      </p>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
        <ChevronRight aria-hidden="true" className="size-4" />
      </Button>
    </nav>
  );
}
