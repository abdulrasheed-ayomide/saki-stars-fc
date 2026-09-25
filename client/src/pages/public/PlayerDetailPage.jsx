import { Link, useParams } from 'react-router';
import { useApi } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { Container } from '../../components/layout/Container.jsx';
import { Breadcrumbs } from '../../components/ui/PageHeader.jsx';
import { ErrorState, SkeletonGrid, EmptyState } from '../../components/ui/Feedback.jsx';
import { PlayerPhoto } from '../../components/football/PlayerCard.jsx';
import { StatGrid } from '../../components/football/StatGrid.jsx';
import { MatchRow } from '../../components/football/MatchCard.jsx';
import { TeamLogo } from '../../components/football/TeamLogo.jsx';
import { SectionHeading } from '../../components/ui/Card.jsx';
import NotFoundPage from '../NotFoundPage.jsx';
import { Activity } from 'lucide-react';

/** Public player profile: only PUBLIC data is ever returned by the API for this page. */
export default function PlayerDetailPage() {
  const { id } = useParams();
  const state = useApi(`/players/${encodeURIComponent(id)}`);
  const p = state.data;
  useSeo({ title: p?.name || 'Player', description: p ? `${p.name}, ${p.position}${p.team ? ` for ${p.team.name}` : ''}.` : undefined, image: p?.photo?.url, type: 'profile' });

  if (state.error?.status === 404) return <NotFoundPage />;
  if (state.error && !p) return <Container className="py-10"><ErrorState error={state.error} onRetry={state.reload} context="players" /></Container>;
  if (!p) return <Container className="py-10"><SkeletonGrid items={2} /></Container>;

  return (
    <>
      <div className="bg-brand-900 text-white">
        <Container className="py-8">
          <div className="[&_a]:text-brand-200 [&_span]:text-brand-100 [&_ol]:text-brand-200">
            <Breadcrumbs items={[{ label: 'Players', to: '/players' }, { label: p.name }]} />
          </div>
          <div className="mt-2 grid gap-6 sm:grid-cols-[14rem_1fr] sm:items-end">
            <PlayerPhoto player={p} className="aspect-[4/5] w-full max-w-56 rounded-lg" width={448} />
            <div className="min-w-0">
              {p.jerseyNumber != null && <p className="text-5xl font-bold tabular-nums text-brand-200">{p.jerseyNumber}</p>}
              <h1 className="text-[clamp(1.75rem,7vw,3rem)] font-bold leading-tight">{p.name}</h1>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-brand-200">Position</dt>
                  <dd className="font-semibold">{p.detailedPosition || p.position}</dd>
                </div>
                {p.nationality && (
                  <div>
                    <dt className="text-brand-200">Nationality</dt>
                    <dd className="font-semibold">{p.nationality}</dd>
                  </div>
                )}
                {p.preferredFoot && (
                  <div>
                    <dt className="text-brand-200">Preferred foot</dt>
                    <dd className="font-semibold capitalize">{p.preferredFoot}</dd>
                  </div>
                )}
                {p.team && (
                  <div>
                    <dt className="text-brand-200">Team</dt>
                    <dd>
                      <Link to={`/teams/${p.team.slug}`} className="flex items-center gap-2 font-semibold underline hover:text-brand-100">
                        <TeamLogo team={p.team} size="sm" />
                        {p.team.name}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </Container>
      </div>

      <Container className="space-y-10 py-8">
        {p.bio && (
          <section aria-labelledby="bio-h">
            <SectionHeading id="bio-h" title="Biography" />
            <p className="max-w-3xl whitespace-pre-line text-slate-700">{p.bio}</p>
          </section>
        )}
        <section aria-labelledby="season-h">
          <SectionHeading id="season-h" title={p.stats.season ? `Season ${p.stats.season.season.name}` : 'This season'} />
          {p.stats.season ? <StatGrid stats={p.stats.season} /> : <p className="text-slate-600">No season has been set up yet.</p>}
        </section>
        <section aria-labelledby="career-h">
          <SectionHeading id="career-h" title="Career at the club" />
          <StatGrid stats={p.stats.career} />
          <p className="mt-2 text-xs text-slate-500">Statistics are calculated from recorded matches.</p>
        </section>
        <section aria-labelledby="recent-h">
          <SectionHeading id="recent-h" title="Recent matches" />
          {p.recentMatches.length ? (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {p.recentMatches.map((m) => (
                <MatchRow key={m.id} match={m} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Activity} title="No recorded appearances yet" />
          )}
        </section>
      </Container>
    </>
  );
}
