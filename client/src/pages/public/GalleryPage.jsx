import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Images } from 'lucide-react';
import { useApi, qs } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { AsyncContent, EmptyState, SkeletonGrid } from '../../components/ui/Feedback.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Lightbox } from '../../components/content/Lightbox.jsx';
import { imageUrl, srcSet } from '../../lib/media.js';

const CATEGORIES = ['Matches', 'Training', 'Players', 'Youth', 'NEXT GEN', 'Fans', 'Events', 'Community'];

export default function GalleryPage() {
  useSeo({ title: 'Gallery', description: 'Photos from matches, training, events and the community.' });
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const page = Number(params.get('page') || 1);
  const state = useApi(`/gallery${qs({ category, page, limit: 24 })}`);
  const [index, setIndex] = useState(null);

  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }

  return (
    <>
      <PageBanner eyebrow="Gallery" title="In pictures" />
      <Container className="py-8">
        <div className="-mx-2 mb-6 relative overflow-x-auto px-2">
          <ul className="flex min-w-max gap-2" aria-label="Photo categories">
            {['', ...CATEGORIES].map((c) => (
              <li key={c || 'all'}>
                <button
                  type="button"
                  onClick={() => update('category', c)}
                  aria-pressed={category === c}
                  className={`min-h-10 rounded-full px-4 text-sm font-medium ring-1 ${category === c ? 'bg-brand-900 text-white ring-brand-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
                >
                  {c || 'All'}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <AsyncContent state={state} loading={<SkeletonGrid items={12} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" itemClass="aspect-square" />} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Images} title="No photos yet" />}>
          {(d) => (
            <>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {d.items.map((g, i) => (
                  <li key={g.id}>
                    <button type="button" onClick={() => setIndex(i)} className="group block w-full overflow-hidden rounded-md" aria-label={`Open photo: ${g.title || g.caption || g.category}`}>
                      <img
                        src={imageUrl(g.image.url, { width: 400, height: 400 })}
                        srcSet={srcSet(g.image.url, [300, 400, 600], { aspect: 1 })}
                        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                        alt={g.image.alt || g.title || ''}
                        loading="lazy"
                        className="aspect-square w-full object-cover transition group-hover:scale-[1.02]"
                      />
                    </button>
                  </li>
                ))}
              </ul>
              <Pagination page={d.page} pages={d.pages} onChange={(p) => update('page', p)} className="mt-6" />
              <Lightbox items={d.items} index={index} onClose={() => setIndex(null)} onIndex={setIndex} />
            </>
          )}
        </AsyncContent>
      </Container>
    </>
  );
}
