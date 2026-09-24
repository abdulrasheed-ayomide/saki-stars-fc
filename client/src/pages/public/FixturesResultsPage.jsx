import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarDays } from 'lucide-react';
import { useApi, qs } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { AsyncContent, EmptyState, SkeletonList } from '../../components/ui/Feedback.jsx';
import { Field, Select } from '../../components/ui/Field.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { MatchRow } from '../../components/football/MatchCard.jsx';
import { formatMonthYear } from '../../lib/format.js';

/** Fixtures and results with filters. Every filter option comes from the database. */
export default function FixturesResultsPage() {
  useSeo({ title: 'Fixtures & Results', description: 'Upcoming fixtures and recent results for every club team.' });
  const { settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'upcoming';
  const filters = { competition: params.get('competition') || '', team: params.get('team') || '', season: params.get('season') || '', venue: params.get('venue') || '' };
  const page = Number(params.get('page') || 1);

  const teams = useApi('/teams');
  const competitions = useApi('/competitions');
  const seasons = useApi('/seasons');
  const state = useApi(`/matches${qs({ ...filters, status, page, limit: 40 })}`);

  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }

  const grouped = useMemo(() => {
    const groups = [];
    for (const m of state.data?.items || []) {
      const key = formatMonthYear(m.kickoffAt, settings.timezone);
      if (!groups.length || groups.at(-1).key !== key) groups.push({ key, items: [] });
      groups.at(-1).items.push(m);
    }
    return groups;
  }, [state.data, settings.timezone]);

  return (
    <>
      <PageBanner eyebrow="Matches" title="Fixtures & Results" />
      <Container className="py-8">
        <Tabs
          label="Match type"
          value={status}
          onChange={(v) => update('status', v === 'upcoming' ? '' : v)}
          tabs={[
            { value: 'upcoming', label: 'Fixtures' },
            { value: 'completed', label: 'Results' },
            { value: 'all', label: 'All matches' },
          ]}
          className="mb-4"
        />
        <div className="mb-6 grid gap-3 xs:grid-cols-2 lg:grid-cols-4">
          <Field label="Competition">
            <Select value={filters.competition} onChange={(e) => update('competition', e.target.value)}>
              <option value="">All competitions</option>
              {(competitions.data || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Team">
            <Select value={filters.team} onChange={(e) => update('team', e.target.value)}>
              <option value="">All club teams</option>
              {(teams.data || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Season">
            <Select value={filters.season} onChange={(e) => update('season', e.target.value)}>
              <option value="">All seasons</option>
              {(seasons.data || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Home / away">
            <Select value={filters.venue} onChange={(e) => update('venue', e.target.value)}>
              <option value="">Home and away</option>
              <option value="home">Home</option>
              <option value="away">Away</option>
            </Select>
          </Field>
        </div>

        <AsyncContent
          state={state}
          loading={<SkeletonList rows={6} />}
          isEmpty={(d) => !d.items.length}
          empty={
            <EmptyState icon={CalendarDays} title={status === 'completed' ? 'No results found' : 'No fixtures found'}>
              {Object.values(filters).some(Boolean) ? 'Try removing a filter.' : 'Matches will appear here once they are scheduled.'}
            </EmptyState>
          }
        >
          {(d) => (
            <>
              {grouped.map((g) => (
                <section key={g.key} aria-labelledby={`m-${g.key}`} className="mb-6">
                  <h2 id={`m-${g.key}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                    {g.key}
                  </h2>
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {g.items.map((m) => (
                      <MatchRow key={m.id} match={m} />
                    ))}
                  </div>
                </section>
              ))}
              <Pagination page={d.page} pages={d.pages} onChange={(p) => update('page', p)} />
            </>
          )}
        </AsyncContent>
      </Container>
    </>
  );
}
