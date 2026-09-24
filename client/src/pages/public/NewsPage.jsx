import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Newspaper, Search } from 'lucide-react';
import { useApi, qs } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { AsyncContent, EmptyState, SkeletonGrid } from '../../components/ui/Feedback.jsx';
import { Field, Input, Select } from '../../components/ui/Field.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { NewsCard } from '../../components/content/NewsCard.jsx';

export default function NewsPage() {
  useSeo({ title: 'News', description: 'The latest club news, match reports, interviews and announcements.' });
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const debounced = useDebounce(q, 350);
  const category = params.get('category') || '';
  const page = Number(params.get('page') || 1);
  const state = useApi(`/news${qs({ category, q: debounced.length >= 2 ? debounced : '', page, limit: 12 })}`);

  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }

  return (
    <>
      <PageBanner eyebrow="News" title="Club news" />
      <Container className="py-8">
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:w-2/3">
          <Field label="Search news">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Search headlines" />
            </div>
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => update('category', e.target.value)}>
              <option value="">All categories</option>
              {(state.data?.categories || []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <AsyncContent state={state} loading={<SkeletonGrid items={6} />} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Newspaper} title="No articles found">{q || category ? 'Try a different search.' : 'News will be published here.'}</EmptyState>}>
          {(d) => (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {d.items.map((a, i) =>
                  i === 0 && d.page === 1 && !q && !category ? (
                    <div key={a.id} className="sm:col-span-2 lg:col-span-3">
                      <NewsCard article={a} featured />
                    </div>
                  ) : (
                    <NewsCard key={a.id} article={a} />
                  ),
                )}
              </div>
              <Pagination page={d.page} pages={d.pages} onChange={(p) => update('page', p)} className="mt-6" />
            </>
          )}
        </AsyncContent>
      </Container>
    </>
  );
}
