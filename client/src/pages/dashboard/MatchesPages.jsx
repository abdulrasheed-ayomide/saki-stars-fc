import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Activity, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useApi, qs } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { apiRequest } from '../../services/apiClient.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { AsyncContent, EmptyState, Alert } from '../../components/ui/Feedback.jsx';
import { StatusBadge, Badge } from '../../components/ui/Badge.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button.jsx';
import { Field, Input, Select, Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { Markdown } from '../../lib/markdown.jsx';
import { formatDateTime, fromLocalInput, toLocalInput } from '../../lib/format.js';
import { EVENT_LABELS, MATCH_STATUS_LABELS } from '../../lib/labels.js';
import { FilterBar, useCompetitions, useSeasons, useTeams } from './shared.jsx';
import { userMessage } from '../../lib/errors.js';
import { defaultSeasonId, seasonLabel } from '../../lib/seasons.js';

export function MatchesListPage() {
  useSeo({ title: 'Fixtures & results', noindex: true });
  const { can } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const competitions = useCompetitions();
  const seasons = useSeasons();
  const teams = useTeams({ clubOnly: true });
  const f = { status: params.get('status') || 'upcoming', competition: params.get('competition') || '', season: params.get('season') || '', team: params.get('team') || '' };
  const page = Number(params.get('page') || 1);
  const state = useApi(`/admin/matches${qs({ ...f, page })}`);
  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const needsResult = (m) => ['scheduled', 'live'].includes(m.status) && new Date(m.kickoffAt) < new Date(Date.now() - 2 * 3600 * 1000);
  return (
    <>
      <PageHeader title="Fixtures & results" description="Create fixtures, record results, events and match reports. Results feed tables and statistics automatically." actions={can('matches.manage') && <ButtonLink to="/dashboard/matches/new" icon={Plus}>New fixture</ButtonLink>} />
      <Tabs label="Match type" value={f.status} onChange={(v) => set('status', v)} tabs={[{ value: 'upcoming', label: 'Upcoming & to record' }, { value: 'completed', label: 'Played' }, { value: 'all', label: 'All' }]} className="mb-4" />
      <FilterBar>
        <Field label="Competition">
          <Select value={f.competition} onChange={(e) => set('competition', e.target.value)}>
            <option value="">All</option>
            {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Season">
          <Select value={f.season} onChange={(e) => set('season', e.target.value)}>
            <option value="">All</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{seasonLabel(s, seasons)}</option>)}
          </Select>
        </Field>
        <Field label="Club team">
          <Select value={f.team} onChange={(e) => set('team', e.target.value)}>
            <option value="">All</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </FilterBar>
      <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Activity} title="No matches" action={can('matches.manage') && <ButtonLink to="/dashboard/matches/new" icon={Plus}>Create a fixture</ButtonLink>} />}>
        {(d) => (
          <>
            <DataTable
              caption="Matches"
              rows={d.items}
              onRowClick={(m) => navigate(`/dashboard/matches/${m.id}`)}
              columns={[
                { key: 'date', nowrap: true, label: 'Kick-off', render: (m) => formatDateTime(m.kickoffAt, settings.timezone) },
                { key: 'match', label: 'Match', render: (m) => <span className="font-medium">{m.homeTeam?.name} v {m.awayTeam?.name}</span> },
                { key: 'comp', label: 'Competition', render: (m) => m.competition?.shortName || m.competition?.name },
                { key: 'score', nowrap: true, label: 'Score', render: (m) => (m.score?.home != null ? `${m.score.home}–${m.score.away}` : '–') },
                { key: 'status', nowrap: true, label: 'Status', render: (m) => <span className="flex flex-wrap gap-1"><StatusBadge status={m.status} label={MATCH_STATUS_LABELS[m.status]} />{needsResult(m) && <Badge tone="warning">Result needed</Badge>}{m.reportPublished && <Badge tone="success">Report</Badge>}</span> },
              ]}
            />
            <Pagination page={d.page} pages={d.pages} onChange={(p) => set('page', p)} className="mt-4" />
          </>
        )}
      </AsyncContent>
    </>
  );
}

export function MatchEditPage() {
  const { id } = useParams();
  const isNew = !id;
  useSeo({ title: isNew ? 'New fixture' : 'Match', noindex: true });
  const state = useApi(isNew ? null : `/admin/matches/${id}`);
  if (!isNew && !state.data) return <AsyncContent state={state}>{() => null}</AsyncContent>;
  return <MatchEditor key={state.data?.updatedAt || 'new'} match={state.data} reload={state.reload} />;
}

function MatchEditor({ match, reload }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [tab, setTab] = useState(match && ['completed', 'abandoned', 'live'].includes(match.status) ? 'result' : 'details');
  const [del, setDel] = useState(false);
  const isNew = !match;
  const played = match && ['completed', 'abandoned'].includes(match.status);
  const title = isNew ? 'New fixture' : `${match.homeTeam?.name} v ${match.awayTeam?.name}`;

  async function remove() {
    try {
      await apiRequest(`/admin/matches/${match.id}`, { method: 'DELETE' });
      notify('Fixture deleted.');
      navigate('/dashboard/matches');
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
      setDel(false);
    }
  }

  const tabs = isNew
    ? [{ value: 'details', label: 'Details' }]
    : [
        ...(can('matches.manage') ? [{ value: 'details', label: 'Details' }, { value: 'result', label: 'Result & events' }] : []),
        { value: 'report', label: 'Match report' },
        ...(can('standings.override') ? [{ value: 'standings', label: 'Table decision' }] : []),
        ...(can('matches.manage', 'media.manage') ? [{ value: 'media', label: 'Highlights' }] : []),
      ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Fixtures & results', to: '/dashboard/matches' }, { label: title }]}
        title={title}
        description={match ? `${match.competition?.name} · ${match.season?.name}` : 'Schedule a fixture. Players and staff of club teams are notified.'}
        actions={
          match && (
            <>
              <ButtonLink to={`/matches/${match.id}`} variant="outline" icon={ExternalLink} target="_blank">Match Centre</ButtonLink>
              {can('matches.manage') && !played && <Button variant="danger-outline" icon={Trash2} onClick={() => setDel(true)}>Delete</Button>}
            </>
          )
        }
      />
      {match && (
        <p className="mb-4 flex flex-wrap items-center gap-2">
          <StatusBadge status={match.status} label={MATCH_STATUS_LABELS[match.status]} />
          {match.score?.home != null && <span className="font-bold">{match.score.home}–{match.score.away}</span>}
          {!match.countsForStandings && <Badge tone="warning">Excluded from table</Badge>}
        </p>
      )}
      <Tabs label="Match sections" value={tab} onChange={setTab} tabs={tabs} className="mb-4" />
      {tab === 'details' && <DetailsForm match={match} onSaved={(m) => (isNew ? navigate(`/dashboard/matches/${m.id}`, { replace: true }) : reload())} />}
      {tab === 'result' && match && <ResultForm match={match} onSaved={reload} />}
      {tab === 'report' && match && <ReportForm match={match} onSaved={reload} />}
      {tab === 'standings' && match && <StandingsDecision match={match} onSaved={reload} />}
      {tab === 'media' && match && <HighlightsForm match={match} onSaved={reload} />}
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={remove} title="Delete this fixture?" confirmLabel="Delete">
        Only fixtures that have not been played can be deleted.
      </ConfirmDialog>
    </>
  );
}

function DetailsForm({ match, onSaved }) {
  const { settings } = useSettings();
  const competitions = useCompetitions();
  const seasons = useSeasons();
  const teams = useTeams();
  const { notify } = useToast();
  const form = useForm({
    competition: match?.competition?.id || '',
    season: match?.season?.id || '',
    homeTeam: match?.homeTeam?.id || '',
    awayTeam: match?.awayTeam?.id || '',
    kickoffAt: toLocalInput(match?.kickoffAt, settings.timezone),
    venue: match?.venue || '',
    referee: match?.referee || '',
    round: match?.round || '',
    status: match && ['scheduled', 'postponed', 'cancelled', 'live'].includes(match.status) ? match.status : 'scheduled',
    statusNote: match?.statusNote || '',
  });
  // New fixtures default to the club's current season (still changeable in the dropdown).
  const { setValues } = form;
  useEffect(() => {
    if (!match && seasons.length) setValues((f) => (f.season ? f : { ...f, season: defaultSeasonId(seasons) }));
  }, [match, seasons, setValues]);
  const { values: v, set, errors: e } = form;
  const comp = competitions.find((c) => c.id === v.competition);
  const onSubmit = form.submit(async (values) => {
    const saved = await apiRequest(match ? `/admin/matches/${match.id}` : '/admin/matches', {
      method: match ? 'PUT' : 'POST',
      body: { ...values, kickoffAt: fromLocalInput(values.kickoffAt, settings.timezone) },
    });
    notify(match ? 'Fixture saved.' : 'Fixture created.');
    onSaved(saved);
  });
  const home = teams.find((t) => t.id === v.homeTeam);
  return (
    <Card className="p-4">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={form.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Competition" required error={e.competition}>
            <Select value={v.competition} onChange={(ev) => { set('competition')(ev.target.value); const c = competitions.find((x) => x.id === ev.target.value); if (c?.currentSeason && !v.season) set('season')(c.currentSeason.id); }}>
              <option value="">Choose…</option>
              {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Season" required error={e.season}>
            <Select value={v.season} onChange={set('season')}>
              <option value="">Choose…</option>
              {seasons.map((s) => <option key={s.id} value={s.id}>{seasonLabel(s, seasons)}</option>)}
            </Select>
          </Field>
          <Field label="Home team" required error={e.homeTeam}>
            <Select value={v.homeTeam} onChange={(ev) => { set('homeTeam')(ev.target.value); const t = teams.find((x) => x.id === ev.target.value); if (t?.homeVenue && !v.venue) set('venue')(t.homeVenue); }}>
              <option value="">Choose…</option>
              {(comp?.teams?.length ? teams.filter((t) => comp.teams.some((x) => x.id === t.id) || t.isClubTeam) : teams).map((t) => <option key={t.id} value={t.id}>{t.name}{t.isClubTeam ? ' (club)' : ''}</option>)}
            </Select>
          </Field>
          <Field label="Away team" required error={e.awayTeam}>
            <Select value={v.awayTeam} onChange={set('awayTeam')}>
              <option value="">Choose…</option>
              {(comp?.teams?.length ? teams.filter((t) => comp.teams.some((x) => x.id === t.id) || t.isClubTeam) : teams).map((t) => <option key={t.id} value={t.id}>{t.name}{t.isClubTeam ? ' (club)' : ''}</option>)}
            </Select>
          </Field>
          <Field label={`Kick-off (${settings.timezone})`} required error={e.kickoffAt}>
            <Input type="datetime-local" value={v.kickoffAt} onChange={set('kickoffAt')} />
          </Field>
          <Field label="Venue" error={e.venue} hint={home?.homeVenue ? `Home ground: ${home.homeVenue}` : undefined}>
            <Input value={v.venue} onChange={set('venue')} maxLength={150} />
          </Field>
          <Field label="Round / matchday" error={e.round}><Input value={v.round} onChange={set('round')} maxLength={60} /></Field>
          <Field label="Referee" error={e.referee}><Input value={v.referee} onChange={set('referee')} maxLength={120} /></Field>
          {match && !['completed', 'abandoned'].includes(match.status) && (
            <Field label="Status" error={e.status}>
              <Select value={v.status} onChange={set('status')}>
                <option value="scheduled">Scheduled</option>
                <option value="postponed">Postponed</option>
                <option value="cancelled">Cancelled</option>
                <option value="live">Live</option>
              </Select>
            </Field>
          )}
          <Field label="Status note (public)" error={e.statusNote} hint="e.g. Postponed due to waterlogged pitch"><Input value={v.statusNote} onChange={set('statusNote')} maxLength={300} /></Field>
        </div>
        <p className="text-xs text-slate-500">Need a new opponent? <Link to="/dashboard/teams" className="underline">Add it under Teams</Link> first.</p>
        <Button type="submit" loading={form.submitting}>{match ? 'Save details' : 'Create fixture'}</Button>
      </form>
    </Card>
  );
}

const PAIRS = [
  ['possession', 'Possession (%)'],
  ['shots', 'Shots'],
  ['shotsOnTarget', 'Shots on target'],
  ['corners', 'Corners'],
  ['fouls', 'Fouls'],
  ['offsides', 'Offsides'],
];

function useSquad(team) {
  const state = useApi(team?.isClubTeam ? `/admin/players${qs({ team: team.id, limit: 100 })}` : null);
  return state.data?.items || [];
}

function ResultForm({ match, onSaved }) {
  const { notify } = useToast();
  const homeSquad = useSquad(match.homeTeam);
  const awaySquad = useSquad(match.awayTeam);
  const squads = { home: homeSquad, away: awaySquad };
  const [status, setStatus] = useState(match.status === 'scheduled' || match.status === 'postponed' ? 'completed' : match.status);
  const [score, setScore] = useState({ home: match.score?.home ?? 0, away: match.score?.away ?? 0, homePenalties: match.score?.homePenalties ?? '', awayPenalties: match.score?.awayPenalties ?? '' });
  const [events, setEvents] = useState(match.events || []);
  const [lineups, setLineups] = useState(match.lineups || { home: [], away: [] });
  const [stats, setStats] = useState(() => Object.fromEntries(PAIRS.map(([k]) => [k, { home: match.stats?.[k]?.home ?? '', away: match.stats?.[k]?.away ?? '' }])));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const goals = useMemo(() => {
    const g = { home: 0, away: 0 };
    for (const e of events) {
      if (e.type === 'goal' || e.type === 'penalty_goal') g[e.side] += 1;
      if (e.type === 'own_goal') g[e.side === 'home' ? 'away' : 'home'] += 1;
    }
    return g;
  }, [events]);

  const addEvent = (type = 'goal') => setEvents((list) => [...list, { type, minute: '', addedTime: 0, side: match.homeTeam?.isClubTeam ? 'home' : 'away', player: null, playerName: '', assist: null, assistName: '', playerOff: null, playerOffName: '', note: '' }]);
  const updEvent = (i, patch) => setEvents((list) => list.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  function toggleLineup(side, playerId, on) {
    setLineups((l) => ({ ...l, [side]: on ? [...l[side], { player: playerId, starter: true, minutes: 90 }] : l[side].filter((x) => x.player !== playerId) }));
  }
  function updLineup(side, playerId, patch) {
    setLineups((l) => ({ ...l, [side]: l[side].map((x) => (x.player === playerId ? { ...x, ...patch } : x)) }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const num = (x) => (x === '' || x === null || x === undefined ? null : Number(x));
      await apiRequest(`/admin/matches/${match.id}/result`, {
        method: 'PUT',
        body: {
          status,
          score: { home: Number(score.home), away: Number(score.away), homePenalties: num(score.homePenalties), awayPenalties: num(score.awayPenalties) },
          events: events.map((e) => ({ ...e, minute: Number(e.minute) || 0, addedTime: Number(e.addedTime) || 0, player: e.player || null, assist: e.assist || null, playerOff: e.playerOff || null })),
          lineups: {
            home: lineups.home.map((l) => ({ ...l, minutes: num(l.minutes) })),
            away: lineups.away.map((l) => ({ ...l, minutes: num(l.minutes) })),
          },
          stats: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, { home: num(v.home), away: num(v.away) }])),
        },
      });
      notify('Result saved. Tables and statistics are updated.');
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  // A plain function (not a component) so text inputs keep focus while typing.
  const picker = ({ side, value, name, onPick, label }) =>
    squads[side].length ? (
      <Select aria-label={label} value={value || ''} onChange={(e) => onPick(e.target.value || null, '')}>
        <option value="">{label}…</option>
        {squads[side].map((p) => <option key={p.id} value={p.id}>{p.jerseyNumber ? `${p.jerseyNumber}. ` : ''}{p.fullName}</option>)}
      </Select>
    ) : (
      <Input aria-label={label} value={name} placeholder={`${label} (name)`} onChange={(e) => onPick(null, e.target.value)} maxLength={120} />
    );

  return (
    <div className="space-y-4">
      <FormError error={error} />
      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <Field label={`${match.homeTeam?.name} goals`}><Input type="number" min={0} max={99} value={score.home} onChange={(e) => setScore((s) => ({ ...s, home: e.target.value }))} /></Field>
          <span className="hidden pb-3 text-center text-xl font-bold sm:block">–</span>
          <Field label={`${match.awayTeam?.name} goals`}><Input type="number" min={0} max={99} value={score.away} onChange={(e) => setScore((s) => ({ ...s, away: e.target.value }))} /></Field>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Result status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="completed">Full time</option>
              <option value="live">Live (in progress)</option>
              <option value="abandoned">Abandoned</option>
            </Select>
          </Field>
          <Field label="Home penalties (shoot-out)"><Input type="number" min={0} value={score.homePenalties} onChange={(e) => setScore((s) => ({ ...s, homePenalties: e.target.value }))} /></Field>
          <Field label="Away penalties (shoot-out)"><Input type="number" min={0} value={score.awayPenalties} onChange={(e) => setScore((s) => ({ ...s, awayPenalties: e.target.value }))} /></Field>
        </div>
        {status === 'abandoned' && <Alert tone="warning" className="mt-3">Abandoned matches do not count in the table unless someone with table permissions records that the result stands.</Alert>}
        {goals.home + goals.away > 0 && (goals.home !== Number(score.home) || goals.away !== Number(score.away)) && (
          <Alert tone="warning" className="mt-3">The goals listed below add up to {goals.home}–{goals.away}. They must match the score.</Alert>
        )}
      </Card>

      <Card>
        <CardHeader title="Events" description="Goals, assists, cards and substitutions. Club players are linked; opponents are typed by name." actions={<><Button size="sm" variant="outline" icon={Plus} onClick={() => addEvent('goal')}>Goal</Button><Button size="sm" variant="outline" icon={Plus} onClick={() => addEvent('yellow_card')}>Card</Button><Button size="sm" variant="outline" icon={Plus} onClick={() => addEvent('substitution')}>Substitution</Button></>} />
        {events.length === 0 ? (
          <p className="p-4 text-sm text-slate-600">No events added. The score alone is enough for the table; events power player statistics.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {events.map((ev, i) => (
              <li key={ev.id || i} className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-[9rem_5rem_4rem_8rem_1fr_1fr_auto] lg:items-end">
                <Field label="Type"><Select value={ev.type} onChange={(e) => updEvent(i, { type: e.target.value })}>{Object.entries(EVENT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                <Field label="Minute"><Input type="number" min={0} max={150} value={ev.minute} onChange={(e) => updEvent(i, { minute: e.target.value })} /></Field>
                <Field label="+"><Input type="number" min={0} max={30} value={ev.addedTime} onChange={(e) => updEvent(i, { addedTime: e.target.value })} /></Field>
                <Field label="Team"><Select value={ev.side} onChange={(e) => updEvent(i, { side: e.target.value, player: null, assist: null, playerOff: null })}><option value="home">{match.homeTeam?.shortName || match.homeTeam?.name}</option><option value="away">{match.awayTeam?.shortName || match.awayTeam?.name}</option></Select></Field>
                <Field label={ev.type === 'substitution' ? 'Player on' : ev.type === 'own_goal' ? 'Player (own goal)' : 'Player'}>
                  {picker({ side: ev.side, value: ev.player, name: ev.playerName, label: 'Player', onPick: (player, playerName) => updEvent(i, { player, playerName }) })}
                </Field>
                {['goal', 'penalty_goal'].includes(ev.type) ? (
                  <Field label="Assist (optional)">{picker({ side: ev.side, value: ev.assist, name: ev.assistName, label: 'Assist', onPick: (assist, assistName) => updEvent(i, { assist, assistName }) })}</Field>
                ) : ev.type === 'substitution' ? (
                  <Field label="Player off">{picker({ side: ev.side, value: ev.playerOff, name: ev.playerOffName, label: 'Player off', onPick: (playerOff, playerOffName) => updEvent(i, { playerOff, playerOffName }) })}</Field>
                ) : (
                  <span />
                )}
                <IconButton label="Remove event" icon={Trash2} onClick={() => setEvents((list) => list.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ol>
        )}
      </Card>

      {['home', 'away'].map((side) =>
        squads[side].length ? (
          <Card key={side}>
            <CardHeader title={`${match[`${side}Team`]?.name} line-up`} description="Tick players who took part. Used for appearances, starts and minutes." />
            <ul className="grid gap-1 p-3 xl:grid-cols-2">
              {squads[side].map((p) => {
                const entry = lineups[side].find((l) => l.player === p.id);
                return (
                  <li key={p.id} className="grid grid-cols-1 items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-50 xs:grid-cols-[1fr_8rem_5rem]">
                    <Checkbox label={`${p.jerseyNumber ? `${p.jerseyNumber}. ` : ''}${p.fullName}`} checked={Boolean(entry)} onChange={(e) => toggleLineup(side, p.id, e.target.checked)} />
                    {entry ? (
                      <>
                        <Select aria-label={`${p.fullName}: started or substitute`} value={entry.starter ? 'yes' : 'no'} onChange={(e) => updLineup(side, p.id, { starter: e.target.value === 'yes' })} className="text-sm">
                          <option value="yes">Started</option>
                          <option value="no">Substitute</option>
                        </Select>
                        <Input aria-label={`${p.fullName}: minutes played`} type="number" min={0} max={150} value={entry.minutes ?? ''} onChange={(e) => updLineup(side, p.id, { minutes: e.target.value })} className="text-sm" placeholder="min" />
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null,
      )}

      <Card>
        <CardHeader title="Match statistics (optional)" />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {PAIRS.map(([k, label]) => (
            <fieldset key={k} className="rounded-md border border-slate-200 p-2">
              <legend className="px-1 text-sm font-medium">{label}</legend>
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label={`${label} home`} type="number" min={0} value={stats[k].home} onChange={(e) => setStats((s) => ({ ...s, [k]: { ...s[k], home: e.target.value } }))} placeholder="Home" />
                <Input aria-label={`${label} away`} type="number" min={0} value={stats[k].away} onChange={(e) => setStats((s) => ({ ...s, [k]: { ...s[k], away: e.target.value } }))} placeholder="Away" />
              </div>
            </fieldset>
          ))}
        </div>
      </Card>

      <Button size="lg" onClick={save} loading={busy}>Save result</Button>
      {match.resultRecordedAt && <p className="text-xs text-slate-500">Last recorded {formatDateTime(match.resultRecordedAt)}. Every change is audited.</p>}
    </div>
  );
}

function ReportForm({ match, onSaved }) {
  const { notify } = useToast();
  const [title, setTitle] = useState(match.report?.title || '');
  const [body, setBody] = useState(match.report?.body || '');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState('');
  const played = ['completed', 'abandoned'].includes(match.status);
  async function save(publish) {
    setBusy(publish ? 'publish' : 'save');
    try {
      await apiRequest(`/admin/matches/${match.id}/report`, { method: 'PUT', body: { title, body, publish } });
      notify(publish ? 'Report published on the Match Centre.' : 'Report saved.');
      onSaved();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setBusy('');
    }
  }
  return (
    <Card className="p-4">
      {match.report?.publishedAt && <Alert tone="success" className="mb-3">Published {formatDateTime(match.report.publishedAt)}.</Alert>}
      <div className="space-y-4">
        <Field label="Headline"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></Field>
        <div className="flex gap-2">
          <Button size="sm" variant={preview ? 'outline' : 'secondary'} onClick={() => setPreview(false)}>Write</Button>
          <Button size="sm" variant={preview ? 'secondary' : 'outline'} onClick={() => setPreview(true)}>Preview</Button>
        </div>
        {preview ? (
          <div className="min-h-40 rounded-md border border-slate-200 p-3"><Markdown text={body || '_Nothing to preview._'} /></div>
        ) : (
          <Field label="Report" hint="Use ## for headings, - for lists, **bold**.">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} maxLength={20000} />
          </Field>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => save(false)} loading={busy === 'save'} disabled={!body}>Save {match.report?.publishedAt ? 'and unpublish' : 'draft'}</Button>
          <Button onClick={() => save(true)} loading={busy === 'publish'} disabled={!body || !played}>Publish</Button>
        </div>
        {!played && <p className="text-sm text-slate-600">You can publish the report once the result has been recorded.</p>}
      </div>
    </Card>
  );
}

function StandingsDecision({ match, onSaved }) {
  const { notify } = useToast();
  const form = useForm({ countsForStandings: match.countsForStandings, resultStands: match.resultStands, reason: '' });
  const onSubmit = form.submit(async (v) => {
    await apiRequest(`/admin/matches/${match.id}/standings`, { method: 'PATCH', body: v });
    notify('Decision recorded. The table has been recalculated.');
    onSaved();
  });
  return (
    <Card className="p-4">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={form.formError} />
        <p className="text-sm text-slate-700">Normally every full-time result counts. Use this for official decisions such as a match that must be excluded, or an abandoned match whose result stands.</p>
        <Checkbox checked={form.values.countsForStandings} onChange={form.set('countsForStandings')} label="This match counts in the league table" />
        {match.status === 'abandoned' && <Checkbox checked={form.values.resultStands} onChange={form.set('resultStands')} label="The result of this abandoned match stands (official ruling)" />}
        <Field label="Reason (recorded in the audit log)" required error={form.errors.reason}>
          <Textarea value={form.values.reason} onChange={form.set('reason')} rows={2} maxLength={500} />
        </Field>
        <Button type="submit" loading={form.submitting}>Record decision</Button>
      </form>
    </Card>
  );
}

function HighlightsForm({ match, onSaved }) {
  const { notify } = useToast();
  const videos = useApi('/admin/videos?limit=100');
  const [video, setVideo] = useState(match.highlightsVideo?.id || '');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await apiRequest(`/admin/matches/${match.id}/highlights`, { method: 'PUT', body: { video: video || null } });
      notify('Highlights updated.');
      onSaved();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-4 p-4">
      <Field label="Highlights video" hint="Add the video under Videos first.">
        <Select value={video} onChange={(e) => setVideo(e.target.value)}>
          <option value="">None</option>
          {(videos.data?.items || []).map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
        </Select>
      </Field>
      <Button onClick={save} loading={busy}>Save</Button>
    </Card>
  );
}
