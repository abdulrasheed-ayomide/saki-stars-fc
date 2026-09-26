import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Video } from 'lucide-react';
import { useApi, qs } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { AsyncContent, EmptyState, SkeletonGrid } from '../../components/ui/Feedback.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { VideoCard, VideoPlayer } from '../../components/content/VideoCard.jsx';
import { formatDate } from '../../lib/format.js';
import { VIDEO_CATEGORIES } from '../../config/categories.js';


export default function VideosPage() {
  useSeo({ title: 'Videos', description: 'Match highlights, goals, interviews and Club TV.' });
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const page = Number(params.get('page') || 1);
  const state = useApi(`/videos${qs({ category, page, limit: 12 })}`);
  const [playing, setPlaying] = useState(null);
  const categories = state.data?.categories || VIDEO_CATEGORIES;

  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }

  return (
    <>
      <PageBanner eyebrow="Club TV" title="Videos" />
      <Container className="py-8">
        <div className="-mx-2 mb-6 relative overflow-x-auto px-2">
          <ul className="flex min-w-max gap-2" aria-label="Video categories">
            {['', ...categories].map((c) => (
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
        <AsyncContent state={state} context="videos" loading={<SkeletonGrid items={6} />} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Video} title="No videos yet">Videos will appear here once the media team publishes them.</EmptyState>}>
          {(d) => (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {d.items.map((v) => (
                  <VideoCard key={v.id} video={v} onPlay={setPlaying} />
                ))}
              </div>
              <Pagination page={d.page} pages={d.pages} onChange={(p) => update('page', p)} className="mt-6" />
            </>
          )}
        </AsyncContent>
      </Container>
      <Modal open={Boolean(playing)} onClose={() => setPlaying(null)} title={playing?.title || ''} description={playing ? [playing.category, playing.publishedAt && formatDate(playing.publishedAt)].filter(Boolean).join(' · ') : ''} size="xl">
        {playing && (
          <div className="space-y-3">
            <VideoPlayer video={playing} />
            {playing.description && <p className="whitespace-pre-line text-sm text-slate-700">{playing.description}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
