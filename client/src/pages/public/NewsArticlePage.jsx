import { Link, useParams } from 'react-router';
import { useApi } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { Breadcrumbs } from '../../components/ui/PageHeader.jsx';
import { ErrorState, SkeletonList } from '../../components/ui/Feedback.jsx';
import { NewsCard } from '../../components/content/NewsCard.jsx';
import { MatchRow } from '../../components/football/MatchCard.jsx';
import { Comments } from '../../components/content/Comments.jsx';
import { Markdown } from '../../lib/markdown.jsx';
import { formatDateLong } from '../../lib/format.js';
import { imageUrl, srcSet } from '../../lib/media.js';
import NotFoundPage from '../NotFoundPage.jsx';

export default function NewsArticlePage() {
  const { slug } = useParams();
  const { settings } = useSettings();
  const state = useApi(`/news/${encodeURIComponent(slug)}`);
  const a = state.data;
  useSeo({ title: a?.title || 'News', description: a?.excerpt, image: a?.featuredImage?.url, type: 'article' });

  if (state.error?.status === 404) return <NotFoundPage />;
  if (state.error && !a) return <Container className="py-10"><ErrorState error={state.error} onRetry={state.reload} context="news" /></Container>;
  if (!a) return <Container className="py-10"><SkeletonList rows={6} /></Container>;

  return (
    <article>
      <Container className="max-w-4xl py-8">
        <Breadcrumbs items={[{ label: 'News', to: '/news' }, { label: a.title }]} />
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{a.category}</p>
        <h1 className="mt-1 text-[clamp(1.6rem,6vw,2.6rem)] font-bold leading-tight text-brand-900">{a.title}</h1>
        {a.excerpt && <p className="mt-3 text-lg text-slate-700">{a.excerpt}</p>}
        <p className="mt-3 text-sm text-slate-600">
          By {a.author.name} · <time dateTime={a.publishedAt}>{formatDateLong(a.publishedAt, settings.timezone)}</time>
          {a.team && (
            <>
              {' · '}
              <Link to={`/teams/${a.team.slug}`} className="underline">
                {a.team.name}
              </Link>
            </>
          )}
          {a.competition && (
            <>
              {' · '}
              <Link to={`/competitions/${a.competition.slug}`} className="underline">
                {a.competition.name}
              </Link>
            </>
          )}
        </p>
        {a.featuredImage && (
          <figure className="mt-6">
            <img
              src={imageUrl(a.featuredImage.url, { width: 1200, height: 675 })}
              srcSet={srcSet(a.featuredImage.url, [640, 960, 1200, 1600], { aspect: 16 / 9 })}
              sizes="(min-width: 896px) 896px, 100vw"
              alt={a.featuredImage.alt || ''}
              className="aspect-video w-full rounded-lg object-cover"
            />
            {a.featuredImage.alt && <figcaption className="mt-1 text-xs text-slate-500">{a.featuredImage.alt}</figcaption>}
          </figure>
        )}
        <Markdown text={a.content} className="mt-6" />

        {(a.relatedMatches.length > 0 || a.relatedPlayers.length > 0) && (
          <aside className="mt-8 grid gap-6 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            {a.relatedMatches.length > 0 && (
              <div className="min-w-0">
                <h2 className="mb-2 font-semibold text-brand-900">Related matches</h2>
                <div className="divide-y divide-slate-200 rounded-md bg-white">
                  {a.relatedMatches.map((m) => (
                    <MatchRow key={m.id} match={m} />
                  ))}
                </div>
              </div>
            )}
            {a.relatedPlayers.length > 0 && (
              <div>
                <h2 className="mb-2 font-semibold text-brand-900">Players in this story</h2>
                <ul className="flex flex-wrap gap-2">
                  {a.relatedPlayers.map((p) => (
                    <li key={p.id}>
                      <Link to={`/players/${p.slug}`} className="inline-flex min-h-10 items-center rounded-full bg-white px-3 text-sm font-medium text-brand-800 ring-1 ring-slate-200 hover:bg-brand-50">
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}

        {a.allowComments && <Comments targetType="news" targetId={a.id} />}
      </Container>

      {a.related?.length > 0 && (
        <section aria-labelledby="related-h" className="bg-slate-50 py-10">
          <Container>
            <h2 id="related-h" className="mb-4 text-xl font-bold text-brand-900">
              More news
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {a.related.map((r) => (
                <NewsCard key={r.id} article={r} />
              ))}
            </div>
          </Container>
        </section>
      )}
    </article>
  );
}
