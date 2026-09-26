import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CalendarDays, Newspaper, Trophy } from 'lucide-react';
import { useApi, qs } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { AsyncContent, EmptyState, ErrorState, SkeletonList } from '../../components/ui/Feedback.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Field, Select } from '../../components/ui/Field.jsx';
import { StandingsTable } from '../../components/football/StandingsTable.jsx';
import { MatchRow } from '../../components/football/MatchCard.jsx';
import { TeamLogo, CompetitionLogo } from '../../components/football/TeamLogo.jsx';
import { NewsCard } from '../../components/content/NewsCard.jsx';
import { Markdown } from '../../lib/markdown.jsx';
import NotFoundPage from '../NotFoundPage.jsx';
import { seasonLabel } from '../../lib/seasons.js';

const TIE_BREAK_LABELS = { points: 'points', goal_difference: 'goal difference', goals_for: 'goals scored', head_to_head: 'head-to-head', wins: 'wins', name: 'name' };

export default function CompetitionDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const [season, setSeason] = useState('');
  const comp = useApi(`/competitions/${encodeURIComponent(id)}`);
  const c = comp.data;
  const seasonQs = qs({ season });
  const table = useApi(c && (tab === 'table' || tab === 'overview') ? `/competitions/${c.id}/standings${seasonQs}` : null);
  const fixtures = useApi(c && tab === 'fixtures' ? `/competitions/${c.id}/matches${qs({ season, type: 'fixtures' })}` : null);
  const results = useApi(c && tab === 'results' ? `/competitions/${c.id}/matches${qs({ season, type: 'results' })}` : null);
  const news = useApi(c && tab === 'news' ? `/competitions/${c.id}/news` : null);
  useSeo({ title: c?.name || 'Competition', description: c?.description?.slice(0, 200) });

  if (comp.error?.status === 404) return <NotFoundPage />;
  if (comp.error && !c) return <Container className="py-10"><ErrorState error={comp.error} onRetry={comp.reload} context="competitions" /></Container>;
  if (!c) return <Container className="py-10"><SkeletonList /></Container>;

  const setTab = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'overview') next.delete('tab');
    else next.set('tab', v);
    setParams(next, { replace: true });
  };

  const matchList = (st, emptyTitle) => (
    <AsyncContent state={st} context="fixtures" isEmpty={(d) => !d.length} empty={<EmptyState icon={CalendarDays} title={emptyTitle} />}>
      {(list) => (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {list.map((m) => (
            <MatchRow key={m.id} match={m} />
          ))}
        </div>
      )}
    </AsyncContent>
  );

  return (
    <>
      <PageBanner breadcrumbs={[{ label: 'Competitions', to: '/competitions' }, { label: c.name }]} title={c.name} eyebrow={c.organizer || (c.type === 'league' ? 'League' : c.type === 'cup' ? 'Cup' : 'Friendlies')}>
        {c.logo && <CompetitionLogo competition={c} className="mt-4 size-16 rounded bg-white p-1" />}
      </PageBanner>
      <Container className="py-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Tabs
            label="Competition sections"
            value={tab}
            onChange={setTab}
            className="min-w-0 flex-1"
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'fixtures', label: 'Fixtures' },
              { value: 'results', label: 'Results' },
              ...(c.type !== 'friendly' ? [{ value: 'table', label: 'Table' }] : []),
              { value: 'news', label: 'News' },
            ]}
          />
          {c.seasons.length > 1 && tab !== 'news' && (
            <Field label="Season" className="w-full sm:w-52">
              <Select value={season} onChange={(e) => setSeason(e.target.value)}>
                <option value="">{c.currentSeason ? `${c.currentSeason.name} — Current` : 'Current season'}</option>
                {c.seasons
                  .filter((s) => s.id !== c.currentSeason?.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {seasonLabel({ ...s, isCurrent: false }, [c.currentSeason, ...c.seasons].filter(Boolean).map((x) => ({ ...x, isCurrent: x.id === c.currentSeason?.id })))}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
        </div>

        {tab === 'overview' && (
          <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
            <div className="min-w-0 space-y-6">
              {c.description ? <Markdown text={c.description} /> : <p className="text-slate-600">No description has been added for this competition.</p>}
              {c.type !== 'friendly' && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <h2 className="font-semibold text-brand-900">Competition rules</h2>
                  <p className="mt-1">
                    Win {c.rules.pointsWin} pts · Draw {c.rules.pointsDraw} pt{c.rules.pointsDraw === 1 ? '' : 's'} · Loss {c.rules.pointsLoss} pts
                  </p>
                  <p className="mt-1">Teams level on points are separated by {c.rules.tieBreakers.filter((t) => t !== 'points').map((t) => TIE_BREAK_LABELS[t]).join(', then ')}.</p>
                </div>
              )}
              {c.teams.length > 0 && (
                <div>
                  <h2 className="mb-2 font-semibold text-brand-900">Teams</h2>
                  <ul className="grid gap-2 xs:grid-cols-2">
                    {c.teams.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-sm">
                        <TeamLogo team={t} size="sm" />
                        {t.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {c.type !== 'friendly' && (
              <div className="min-w-0">
                <h2 className="mb-2 font-semibold text-brand-900">Table</h2>
                <AsyncContent state={table} context="standings" isEmpty={(d) => !d.rows.length} empty={<EmptyState icon={Trophy} title="No table yet" />}>
                  {(d) => <StandingsTable rows={d.rows} compact />}
                </AsyncContent>
              </div>
            )}
          </div>
        )}

        {tab === 'table' && (
          <AsyncContent state={table} context="standings" isEmpty={(d) => !d.applicable || !d.rows.length} empty={<EmptyState icon={Trophy} title="The table will appear once results are recorded" />}>
            {(d) => (
              <>
                <StandingsTable rows={d.rows} />
                <p className="mt-2 text-xs text-slate-500">
                  {d.season ? `Season ${d.season.name}. ` : ''}Calculated automatically from recorded results.
                  {d.adjustments?.length > 0 && ' * Includes official points corrections.'}
                </p>
              </>
            )}
          </AsyncContent>
        )}
        {tab === 'fixtures' && matchList(fixtures, 'No upcoming fixtures in this competition')}
        {tab === 'results' && matchList(results, 'No results yet')}
        {tab === 'news' && (
          <AsyncContent state={news} context="news" isEmpty={(d) => !d.length} empty={<EmptyState icon={Newspaper} title="No news about this competition yet" />}>
            {(list) => (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((a) => (
                  <NewsCard key={a.id} article={a} />
                ))}
              </div>
            )}
          </AsyncContent>
        )}
      </Container>
    </>
  );
}
