import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { useApi, qs } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState, SkeletonList } from '../../components/ui/Feedback.jsx';
import { PlayerCard } from '../../components/football/PlayerCard.jsx';
import { MatchRow } from '../../components/football/MatchCard.jsx';
import { TeamLogo } from '../../components/football/TeamLogo.jsx';
import { NewsCard } from '../../components/content/NewsCard.jsx';

/** Public search across public information only (the API never searches private data here). */
export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const debounced = useDebounce(q.trim(), 400);
  const state = useApi(debounced.length >= 2 ? `/search${qs({ q: debounced })}` : null);
  useSeo({ title: 'Search', noindex: true });
  const d = state.data;
  const total = d ? Object.values(d).reduce((n, list) => n + list.length, 0) : 0;

  return (
    <>
      <PageBanner eyebrow="Search" title="Search the club website" />
      <Container className="py-8">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setParams(q ? { q } : {}, { replace: true });
          }}
          className="max-w-2xl"
        >
          <label htmlFor="site-search" className="sr-only">
            Search players, teams, news, competitions, matches and videos
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <Input id="site-search" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="min-h-12 pl-10 text-lg" placeholder="Players, teams, news, matches…" />
          </div>
        </form>

        <div className="mt-8" aria-live="polite">
          {debounced.length < 2 ? (
            <p className="text-slate-600">Type at least two characters.</p>
          ) : state.error ? (
            <ErrorState error={state.error} onRetry={state.reload} />
          ) : !d ? (
            <SkeletonList rows={3} />
          ) : total === 0 ? (
            <EmptyState icon={Search} title={`No results for “${debounced}”`}>
              Check the spelling or try a shorter search.
            </EmptyState>
          ) : (
            <div className="space-y-10">
              {d.players.length > 0 && (
                <section aria-labelledby="r-players">
                  <h2 id="r-players" className="mb-3 text-lg font-bold text-brand-900">
                    Players
                  </h2>
                  <ul className="grid grid-cols-1 gap-4 xs:grid-cols-2 md:grid-cols-4">
                    {d.players.map((p) => (
                      <li key={p.id}>
                        <PlayerCard player={p} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {d.teams.length + d.competitions.length > 0 && (
                <section aria-labelledby="r-teams">
                  <h2 id="r-teams" className="mb-3 text-lg font-bold text-brand-900">
                    Teams & competitions
                  </h2>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {d.teams.map((t) => (
                      <li key={t.id}>
                        <Link to={`/teams/${t.slug}`} className="flex min-h-12 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 hover:border-brand-300">
                          <TeamLogo team={t} size="sm" />
                          <span className="font-medium">{t.name}</span>
                        </Link>
                      </li>
                    ))}
                    {d.competitions.map((c) => (
                      <li key={c.id}>
                        <Link to={`/competitions/${c.slug}`} className="flex min-h-12 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 hover:border-brand-300">
                          <span className="font-medium">{c.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {d.news.length > 0 && (
                <section aria-labelledby="r-news">
                  <h2 id="r-news" className="mb-3 text-lg font-bold text-brand-900">
                    News
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {d.news.map((a) => (
                      <NewsCard key={a.id} article={a} />
                    ))}
                  </div>
                </section>
              )}
              {d.matches.length > 0 && (
                <section aria-labelledby="r-matches">
                  <h2 id="r-matches" className="mb-3 text-lg font-bold text-brand-900">
                    Matches
                  </h2>
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {d.matches.map((m) => (
                      <MatchRow key={m.id} match={m} />
                    ))}
                  </div>
                </section>
              )}
              {d.videos.length > 0 && (
                <section aria-labelledby="r-videos">
                  <h2 id="r-videos" className="mb-3 text-lg font-bold text-brand-900">
                    Videos
                  </h2>
                  <ul className="space-y-1">
                    {d.videos.map((v) => (
                      <li key={v.id}>
                        <Link to={`/videos?category=${encodeURIComponent(v.category)}`} className="inline-flex min-h-10 items-center font-medium text-brand-700 underline">
                          {v.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </Container>
    </>
  );
}
