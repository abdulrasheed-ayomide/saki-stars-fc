import { useSearchParams } from 'react-router';
import { Search, Users } from 'lucide-react';
import { useApi, qs } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { AsyncContent, EmptyState, SkeletonGrid } from '../../components/ui/Feedback.jsx';
import { Field, Input, Select } from '../../components/ui/Field.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { PlayerCard } from '../../components/football/PlayerCard.jsx';
import { POSITIONS } from '../../lib/labels.js';
import { useState } from 'react';

export default function PlayersPage() {
  useSeo({ title: 'Players', description: 'Player profiles, positions and statistics.' });
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const debounced = useDebounce(q, 350);
  const team = params.get('team') || '';
  const position = params.get('position') || '';
  const page = Number(params.get('page') || 1);
  const teams = useApi('/teams');
  const state = useApi(`/players${qs({ team, position, q: debounced.length >= 2 ? debounced : '', page })}`);

  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }

  return (
    <>
      <PageBanner eyebrow="Squads" title="Players" description="Meet the players who wear the club colours." />
      <Container className="py-8">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="mb-6 grid gap-3 sm:grid-cols-3">
          <Field label="Search by name">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Player name" />
            </div>
          </Field>
          <Field label="Team">
            <Select value={team} onChange={(e) => update('team', e.target.value)}>
              <option value="">All teams</option>
              {(teams.data || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Position">
            <Select value={position} onChange={(e) => update('position', e.target.value)}>
              <option value="">All positions</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
        </form>

        <AsyncContent
          state={state}
          context="players"
          loading={<SkeletonGrid items={8} className="grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" itemClass="h-72" />}
          isEmpty={(d) => !d.items.length}
          empty={<EmptyState icon={Users} title="No players found">{q || team || position ? 'Try different filters.' : 'Player profiles will be published here.'}</EmptyState>}
        >
          {(d) => (
            <>
              <p className="mb-3 text-sm text-slate-600" aria-live="polite">
                {d.total} player{d.total === 1 ? '' : 's'}
              </p>
              <ul className="grid grid-cols-1 gap-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {d.items.map((p) => (
                  <li key={p.id}>
                    <PlayerCard player={p} />
                  </li>
                ))}
              </ul>
              <Pagination page={d.page} pages={d.pages} onChange={(p) => update('page', p)} className="mt-6" />
            </>
          )}
        </AsyncContent>
      </Container>
    </>
  );
}
