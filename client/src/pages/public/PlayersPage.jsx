import { useState } from 'react';
import { NavLink, useParams, useSearchParams } from 'react-router';
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
import { SQUADS, squadBySlug, squadPath } from '../../config/squads.js';
import NotFoundPage from '../NotFoundPage.jsx';

/**
 * /players                    every public player (including players not yet assigned a squad)
 * /players/squad/senior       Saki Stars FC Senior only
 * /players/squad/under-19     Saki Stars FC Under-19 only
 */
export default function PlayersPage() {
  const { squad: slug } = useParams();
  if (slug && !squadBySlug(slug)) return <NotFoundPage />;
  // A fresh list (search, filters, page) for each squad.
  return <PlayersList key={slug || 'all'} squad={slug ? squadBySlug(slug) : null} />;
}

function SquadSwitch({ squad }) {
  const pill = ({ isActive }) =>
    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
      isActive ? 'border-white bg-white text-brand-900' : 'border-white/30 text-white hover:bg-white/10'
    }`;
  return (
    <nav aria-label="Squads" className="mt-5">
      <ul className="flex flex-wrap gap-2">
        {SQUADS.map((s) => (
          <li key={s.value}>
            <NavLink to={squadPath(s)} className={pill} aria-label={s.label}>
              {s.short}
            </NavLink>
          </li>
        ))}
        {!squad && (
          <li>
            <NavLink to="/players" end className={pill}>
              All players
            </NavLink>
          </li>
        )}
      </ul>
    </nav>
  );
}

function PlayersList({ squad }) {
  useSeo({
    title: squad ? squad.label : 'Players',
    description: squad ? `${squad.label}: player profiles, positions and statistics.` : 'Player profiles, positions and statistics.',
  });
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const debounced = useDebounce(q, 350);
  const team = squad ? '' : params.get('team') || '';
  const position = params.get('position') || '';
  const page = Number(params.get('page') || 1);
  const teams = useApi(squad ? null : '/teams');
  const state = useApi(`/players${qs({ squad: squad?.value, team, position, q: debounced.length >= 2 ? debounced : '', page })}`);
  const filtered = Boolean(q || team || position);

  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }

  return (
    <>
      <PageBanner
        eyebrow={squad ? 'Squad' : 'Squads'}
        title={squad ? squad.label : 'Players'}
        description={squad ? `Meet the players of the ${squad.label} squad.` : 'Meet the players who wear the club colours.'}
      >
        <SquadSwitch squad={squad} />
      </PageBanner>
      <Container className="py-8">
        <form role="search" onSubmit={(e) => e.preventDefault()} className={`mb-6 grid gap-3 ${squad ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          <Field label="Search by name">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Player name" />
            </div>
          </Field>
          {!squad && (
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
          )}
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
          empty={
            <EmptyState icon={Users} title={filtered ? 'No players found' : squad ? `No players in the ${squad.short} squad yet` : 'No players found'}>
              {filtered ? 'Try different filters.' : 'Player profiles will be published here.'}
            </EmptyState>
          }
        >
          {(d) => (
            <>
              <h2 className="sr-only">{squad ? `${squad.label} players` : 'All players'}</h2>
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
