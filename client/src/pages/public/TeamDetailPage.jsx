import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { CalendarDays, MapPin, Trophy, Users } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { ErrorState, EmptyState, SkeletonGrid } from '../../components/ui/Feedback.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { TeamLogo } from '../../components/football/TeamLogo.jsx';
import { PlayerCard } from '../../components/football/PlayerCard.jsx';
import { MatchCard } from '../../components/football/MatchCard.jsx';
import { FormGuide } from '../../components/football/StandingsTable.jsx';
import { StaffCard } from './StaffPage.jsx';
import { POSITIONS } from '../../lib/labels.js';
import NotFoundPage from '../NotFoundPage.jsx';

export default function TeamDetailPage() {
  const { id } = useParams();
  const state = useApi(`/teams/${encodeURIComponent(id)}`);
  const [tab, setTab] = useState('squad');
  const team = state.data;
  useSeo({ title: team?.name || 'Team', description: team?.description?.slice(0, 200) });

  if (state.error?.status === 404) return <NotFoundPage />;
  if (state.error && !team) return <Container className="py-10"><ErrorState error={state.error} onRetry={state.reload} context="teams" /></Container>;
  if (!team) return <Container className="py-10"><SkeletonGrid items={6} /></Container>;

  const r = team.record;
  return (
    <>
      <PageBanner breadcrumbs={[{ label: 'Teams', to: '/teams' }, { label: team.name }]} title={team.name} eyebrow={[team.category, team.ageGroup].filter(Boolean).join(' · ') || 'Team'}>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <TeamLogo team={team} size="xl" className="rounded-full bg-white p-1" />
          <div className="space-y-1 text-sm text-brand-100">
            {team.homeVenue && (
              <p className="flex items-center gap-2">
                <MapPin aria-hidden="true" className="size-4" />
                {team.homeVenue}
              </p>
            )}
            {team.competitions?.length > 0 && (
              <p className="flex flex-wrap items-center gap-2">
                <Trophy aria-hidden="true" className="size-4" />
                {team.competitions.map((c, i) => (
                  <Link key={c.id} to={`/competitions/${c.slug}`} className="underline hover:text-white">
                    {c.name}
                    {i < team.competitions.length - 1 ? ',' : ''}
                  </Link>
                ))}
              </p>
            )}
          </div>
        </div>
      </PageBanner>

      <Container className="py-8">
        {team.description && <p className="mb-6 max-w-3xl text-slate-700">{team.description}</p>}

        {r && r.played > 0 && (
          <section aria-labelledby="record-h" className="mb-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h2 id="record-h" className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              {r.season ? `Season ${r.season.name}` : 'Record'}
            </h2>
            <dl className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {[
                ['Played', r.played],
                ['Won', r.won],
                ['Drawn', r.drawn],
                ['Lost', r.lost],
                ['Goals', `${r.goalsFor}–${r.goalsAgainst}`],
                ['Clean sheets', r.cleanSheets],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-xl font-bold tabular-nums text-brand-900">{value}</dd>
                </div>
              ))}
            </dl>
            {r.form?.length > 0 && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                Form (latest first): <FormGuide form={r.form} />
              </div>
            )}
          </section>
        )}

        <Tabs
          label="Team sections"
          value={tab}
          onChange={setTab}
          className="mb-6"
          tabs={[
            { value: 'squad', label: 'Squad', count: team.squad.length },
            { value: 'fixtures', label: 'Fixtures', count: team.fixtures.length },
            { value: 'results', label: 'Results', count: team.results.length },
            ...(team.staff.length ? [{ value: 'staff', label: 'Staff', count: team.staff.length }] : []),
          ]}
        />

        {tab === 'squad' &&
          (team.squad.length ? (
            POSITIONS.map((pos) => {
              const group = team.squad.filter((p) => p.position === pos);
              if (!group.length) return null;
              return (
                <section key={pos} aria-labelledby={`pos-${pos}`} className="mb-8">
                  <h2 id={`pos-${pos}`} className="mb-3 text-lg font-bold text-brand-900">
                    {pos}s
                  </h2>
                  <ul className="grid grid-cols-1 gap-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {group.map((p) => (
                      <li key={p.id}>
                        <PlayerCard player={p} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          ) : (
            <EmptyState icon={Users} title="The squad has not been published yet" />
          ))}

        {tab === 'fixtures' &&
          (team.fixtures.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {team.fixtures.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          ) : (
            <EmptyState icon={CalendarDays} title="No upcoming fixtures" />
          ))}

        {tab === 'results' &&
          (team.results.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {team.results.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Trophy} title="No results yet" />
          ))}

        {tab === 'staff' && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {team.staff.map((s) => (
              <li key={s.id}>
                <StaffCard staff={s} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </>
  );
}
