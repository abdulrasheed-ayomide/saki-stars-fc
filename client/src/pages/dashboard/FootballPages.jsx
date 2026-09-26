import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, ListOrdered, Pencil, Plus, Shield, Trash2, Trophy, Undo2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useApi, qs } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { apiRequest } from '../../services/apiClient.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { AsyncContent, EmptyState, Alert } from '../../components/ui/Feedback.jsx';
import { StatusBadge, Badge } from '../../components/ui/Badge.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Field, Input, Select, Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { Modal, ConfirmDialog } from '../../components/ui/Modal.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { MediaUpload } from '../../components/ui/ImageUpload.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { TeamLogo } from '../../components/football/TeamLogo.jsx';
import { StandingsTable } from '../../components/football/StandingsTable.jsx';
import { formatDate, toDateInput } from '../../lib/format.js';
import { FilterBar, useCompetitions, useSeasons, useTeams } from './shared.jsx';
import { userMessage } from '../../lib/errors.js';
import { seasonLabel, seasonStatusLabel, suggestNewSeason } from '../../lib/seasons.js';

// ---------------------------------------------------------------------------------- Teams
function TeamForm({ team, onClose, onSaved }) {
  const competitions = useCompetitions();
  const seasons = useSeasons();
  const { notify } = useToast();
  const form = useForm({
    name: team?.name || '',
    shortName: team?.shortName || '',
    isClubTeam: team ? team.isClubTeam : true,
    logo: team?.logo || null,
    description: team?.description || '',
    category: team?.category || '',
    ageGroup: team?.ageGroup || '',
    homeVenue: team?.homeVenue || '',
    competitions: (team?.competitions || []).map((c) => c.id),
    season: team?.season?.id || '',
    status: team?.status || 'active',
    displayOrder: team?.displayOrder ?? 100,
    containsMinors: Boolean(team?.containsMinors),
  });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    await apiRequest(team ? `/admin/teams/${team.id}` : '/admin/teams', {
      method: team ? 'PUT' : 'POST',
      body: { ...values, season: values.season || null, displayOrder: Number(values.displayOrder) || 100, logo: values.logo || null },
    });
    notify(team ? 'Team saved.' : 'Team created.');
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={team ? `Edit ${team.name}` : 'Add team'} size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Save</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={form.formError} />
        <Checkbox checked={v.isClubTeam} onChange={set('isClubTeam')} label="This is one of our club's teams" hint="Untick for opponents. Opponents are needed to record fixtures and full league tables." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={e.name}><Input value={v.name} onChange={set('name')} maxLength={100} /></Field>
          <Field label="Short name" error={e.shortName}><Input value={v.shortName} onChange={set('shortName')} maxLength={30} /></Field>
          {v.isClubTeam && (
            <>
              <Field label="Category" error={e.category} hint="e.g. Senior, Youth, Academy"><Input value={v.category} onChange={set('category')} maxLength={60} /></Field>
              <Field label="Age group" error={e.ageGroup} hint="e.g. U17, Open"><Input value={v.ageGroup} onChange={set('ageGroup')} maxLength={30} /></Field>
              <Field label="Current season" error={e.season}>
                <Select value={v.season} onChange={set('season')}>
                  <option value="">Use the club's current season</option>
                  {seasons.map((s) => <option key={s.id} value={s.id}>{seasonLabel(s, seasons)}</option>)}
                </Select>
              </Field>
              <Field label="Display order" error={e.displayOrder}><Input type="number" value={v.displayOrder} onChange={set('displayOrder')} /></Field>
            </>
          )}
          <Field label="Home ground" error={e.homeVenue}><Input value={v.homeVenue} onChange={set('homeVenue')} maxLength={150} /></Field>
          <Field label="Status" error={e.status}>
            <Select value={v.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
        </div>
        <MediaUpload label="Crest / logo" folder="teams" value={v.logo} onChange={set('logo')} aspect="aspect-square" />
        {v.isClubTeam && (
          <>
            <Field label="Description" error={e.description}><Textarea value={v.description} onChange={set('description')} rows={3} maxLength={4000} /></Field>
            <Checkbox checked={v.containsMinors} onChange={set('containsMinors')} label="This squad includes players under 18" />
          </>
        )}
        <fieldset>
          <legend className="text-sm font-medium">Competitions</legend>
          <ul className="mt-2 grid gap-1 xs:grid-cols-2">
            {competitions.map((c) => (
              <li key={c.id}>
                <Checkbox label={c.name} checked={v.competitions.includes(c.id)} onChange={(ev) => set('competitions')(ev.target.checked ? [...v.competitions, c.id] : v.competitions.filter((x) => x !== c.id))} />
              </li>
            ))}
          </ul>
        </fieldset>
      </form>
    </Modal>
  );
}

export function TeamsAdminPage() {
  useSeo({ title: 'Teams', noindex: true });
  const [f, setF] = useState({ q: '', isClubTeam: 'true', status: '' });
  const [page, setPage] = useState(1);
  const q = useDebounce(f.q, 300);
  const state = useApi(`/admin/teams${qs({ ...f, q, page })}`);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const { notify } = useToast();
  async function remove() {
    try {
      await apiRequest(`/admin/teams/${del.id}`, { method: 'DELETE' });
      notify('Team deleted.');
      state.reload();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setDel(null);
    }
  }
  return (
    <>
      <PageHeader title="Teams" description="Club teams and the opponents they play." actions={<Button icon={Plus} onClick={() => setEdit('new')}>Add team</Button>} />
      <FilterBar>
        <Field label="Search"><Input type="search" value={f.q} onChange={(e) => setF((x) => ({ ...x, q: e.target.value }))} /></Field>
        <Field label="Show">
          <Select value={f.isClubTeam} onChange={(e) => { setF((x) => ({ ...x, isClubTeam: e.target.value })); setPage(1); }}>
            <option value="true">Club teams</option>
            <option value="false">Opponents</option>
            <option value="">All</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
      </FilterBar>
      <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Shield} title="No teams yet" action={<Button icon={Plus} onClick={() => setEdit('new')}>Add the first team</Button>} />}>
        {(d) => (
          <>
            <DataTable
              caption="Teams"
              rows={d.items}
              columns={[
                { key: 'name', label: 'Team', render: (t) => <span className="flex items-center gap-2 font-medium"><TeamLogo team={t} size="sm" />{t.name}</span> },
                { key: 'type', nowrap: true, label: 'Type', render: (t) => (t.isClubTeam ? <Badge tone="brand">Club</Badge> : 'Opponent') },
                { key: 'cat', label: 'Category', minWidth: '10rem', render: (t) => [t.category, t.ageGroup].filter(Boolean).join(' · ') || '–' },
                { key: 'players', nowrap: true, label: 'Players', render: (t) => t.playerCount },
                { key: 'comps', label: 'Competitions', render: (t) => t.competitions.map((c) => c.shortName || c.name).join(', ') || '–' },
                { key: 'status', nowrap: true, label: 'Status', render: (t) => <StatusBadge status={t.status} /> },
                { key: 'actions', nowrap: true, label: <span className="sr-only">Actions</span>, render: (t) => <span className="flex gap-1"><IconButton label={`Edit ${t.name}`} icon={Pencil} onClick={() => setEdit(t)} /><IconButton label={`Delete ${t.name}`} icon={Trash2} onClick={() => setDel(t)} /></span> },
              ]}
            />
            <Pagination page={d.page} pages={d.pages} onChange={setPage} className="mt-4" />
          </>
        )}
      </AsyncContent>
      {edit && <TeamForm team={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); state.reload(); }} />}
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} title={`Delete ${del?.name}?`} confirmLabel="Delete">
        Teams with matches or players cannot be deleted; set them to Archived instead to keep the history.
      </ConfirmDialog>
    </>
  );
}

// ---------------------------------------------------------------------------------- Seasons
export function SeasonsAdminPage() {
  useSeo({ title: 'Seasons', noindex: true });
  const state = useApi('/admin/seasons');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const { notify } = useToast();
  async function remove() {
    try {
      await apiRequest(`/admin/seasons/${del.id}`, { method: 'DELETE' });
      notify('Season deleted.');
      state.reload();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setDel(null);
    }
  }
  return (
    <>
      <PageHeader title="Seasons" description="Fixtures, tables and statistics are grouped by season. Past seasons stay available." actions={<Button icon={Plus} onClick={() => setEdit('new')}>Add season</Button>} />
      <AsyncContent state={state} isEmpty={(d) => !d.length} empty={<EmptyState icon={CalendarDays} title="No seasons yet" action={<Button icon={Plus} onClick={() => setEdit('new')}>Add the first season</Button>} />}>
        {(list) => (
          <DataTable
            caption="Seasons"
            rows={list}
            columns={[
              { key: 'name', label: 'Season', render: (s) => <span className="inline-flex flex-wrap items-center gap-1.5 font-medium">{s.name} <Badge tone={s.isCurrent ? 'success' : 'neutral'}>{seasonStatusLabel(s, list)}</Badge></span> },
              { key: 'dates', nowrap: true, label: 'Dates', render: (s) => `${formatDate(s.startDate)} – ${formatDate(s.endDate)}` },
              { key: 'matches', nowrap: true, label: 'Matches', render: (s) => s.matchCount },
              { key: 'status', nowrap: true, label: 'Status', render: (s) => <StatusBadge status={s.status} /> },
              { key: 'a', nowrap: true, label: <span className="sr-only">Actions</span>, render: (s) => <span className="flex gap-1"><IconButton label={`Edit ${s.name}`} icon={Pencil} onClick={() => setEdit(s)} /><IconButton label={`Delete ${s.name}`} icon={Trash2} onClick={() => setDel(s)} /></span> },
            ]}
          />
        )}
      </AsyncContent>
      {edit && <SeasonForm season={edit === 'new' ? null : edit} existing={state.data || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); state.reload(); }} />}
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} title={`Delete season ${del?.name}?`} confirmLabel="Delete">
        Seasons with matches cannot be deleted. Archive them instead.
      </ConfirmDialog>
    </>
  );
}

function SeasonForm({ season, existing = [], onClose, onSaved }) {
  const { notify } = useToast();
  const next = suggestNewSeason(existing);
  const form = useForm({
    name: season?.name || next.name,
    startDate: toDateInput(season?.startDate) || next.startDate,
    endDate: toDateInput(season?.endDate) || next.endDate,
    // A brand-new season only becomes current automatically when it is the club's first one.
    isCurrent: season ? season.isCurrent : existing.length === 0,
    status: season?.status || 'active',
  });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    await apiRequest(season ? `/admin/seasons/${season.id}` : '/admin/seasons', { method: season ? 'PUT' : 'POST', body: values });
    notify('Season saved.');
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={season ? `Edit ${season.name}` : 'Add season'} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Save</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={form.formError} />
        <Field label="Season (year)" required error={e.name} hint="Usually the year, e.g. 2026. Use 2026/27 if a season crosses two years."><Input value={v.name} onChange={set('name')} maxLength={40} /></Field>
        <div className="grid gap-4 xs:grid-cols-2">
          <Field label="Starts" required error={e.startDate}><Input type="date" value={v.startDate} onChange={set('startDate')} /></Field>
          <Field label="Ends" required error={e.endDate}><Input type="date" value={v.endDate} onChange={set('endDate')} /></Field>
        </div>
        <Field label="Status" error={e.status}>
          <Select value={v.status} onChange={set('status')}>
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
        <Checkbox checked={v.isCurrent} onChange={set('isCurrent')} label="This is the current season" />
        <p className="text-xs text-slate-600">Making this season current does not change any other season’s fixtures, results or tables; they stay filed under their own season.</p>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------- Competitions
const TIE_BREAKERS = [
  ['goal_difference', 'Goal difference'],
  ['goals_for', 'Goals scored'],
  ['head_to_head', 'Head-to-head points'],
  ['wins', 'Number of wins'],
  ['name', 'Alphabetical (last resort)'],
];

function CompetitionForm({ competition, onClose, onSaved }) {
  const seasons = useSeasons();
  const teams = useTeams();
  const { notify } = useToast();
  const c = competition;
  const form = useForm({
    name: c?.name || '',
    shortName: c?.shortName || '',
    logo: c?.logo || null,
    description: c?.description || '',
    organizer: c?.organizer || '',
    type: c?.type || 'league',
    rules: {
      pointsWin: c?.rules?.pointsWin ?? 3,
      pointsDraw: c?.rules?.pointsDraw ?? 1,
      pointsLoss: c?.rules?.pointsLoss ?? 0,
      tieBreakers: c?.rules?.tieBreakers?.filter((t) => t !== 'points') ?? ['goal_difference', 'goals_for', 'head_to_head', 'name'],
      countsForStandings: c?.rules?.countsForStandings ?? true,
    },
    seasons: (c?.seasons || []).map((s) => s.id),
    currentSeason: c?.currentSeason?.id || '',
    teams: (c?.teams || []).map((t) => t.id),
    status: c?.status || 'active',
    displayOrder: c?.displayOrder ?? 100,
  });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    await apiRequest(c ? `/admin/competitions/${c.id}` : '/admin/competitions', {
      method: c ? 'PUT' : 'POST',
      body: {
        ...values,
        logo: values.logo || null,
        currentSeason: values.currentSeason || null,
        displayOrder: Number(values.displayOrder) || 100,
        rules: { ...values.rules, pointsWin: Number(values.rules.pointsWin), pointsDraw: Number(values.rules.pointsDraw), pointsLoss: Number(values.rules.pointsLoss), tieBreakers: ['points', ...values.rules.tieBreakers] },
      },
    });
    notify('Competition saved.');
    onSaved();
  });
  const toggle = (key, id, on) => set(key)(on ? [...v[key], id] : v[key].filter((x) => x !== id));
  const clubCurrent = seasons.find((s) => s.isCurrent);
  // Choosing a competition's current season also links that season to the competition.
  const chooseCurrent = (ev) => {
    const id = ev.target.value;
    form.setValues((f) => ({ ...f, currentSeason: id, seasons: id && !f.seasons.includes(id) ? [...f.seasons, id] : f.seasons }));
  };
  const moveTb = (i, d) => {
    const list = [...v.rules.tieBreakers];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set('rules.tieBreakers')(list);
  };
  return (
    <Modal open onClose={onClose} title={c ? `Edit ${c.name}` : 'Add competition'} size="xl" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Save</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={form.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={e.name}><Input value={v.name} onChange={set('name')} maxLength={120} /></Field>
          <Field label="Short name" error={e.shortName} hint="e.g. NLO"><Input value={v.shortName} onChange={set('shortName')} maxLength={30} /></Field>
          <Field label="Organiser" error={e.organizer}><Input value={v.organizer} onChange={set('organizer')} maxLength={150} /></Field>
          <Field label="Type" error={e.type}>
            <Select value={v.type} onChange={set('type')}>
              <option value="league">League</option>
              <option value="cup">Cup / knockout</option>
              <option value="friendly">Friendlies (never affect tables)</option>
            </Select>
          </Field>
          <Field label="Status" error={e.status}>
            <Select value={v.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          <Field label="Display order" error={e.displayOrder}><Input type="number" value={v.displayOrder} onChange={set('displayOrder')} /></Field>
        </div>
        <MediaUpload label="Logo" folder="competitions" value={v.logo} onChange={set('logo')} aspect="aspect-square" />
        <Field label="Description" error={e.description}><Textarea value={v.description} onChange={set('description')} rows={3} maxLength={4000} /></Field>
        {v.type !== 'friendly' && (
          <fieldset className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold">Table rules</legend>
            <div className="grid gap-3 xs:grid-cols-3">
              <Field label="Points for a win"><Input type="number" min={0} max={10} value={v.rules.pointsWin} onChange={set('rules.pointsWin')} /></Field>
              <Field label="Points for a draw"><Input type="number" min={0} max={10} value={v.rules.pointsDraw} onChange={set('rules.pointsDraw')} /></Field>
              <Field label="Points for a loss"><Input type="number" min={0} max={10} value={v.rules.pointsLoss} onChange={set('rules.pointsLoss')} /></Field>
            </div>
            <p className="mt-3 text-sm font-medium">When teams are level on points, separate them by (in order):</p>
            <ol className="mt-1 space-y-1">
              {v.rules.tieBreakers.map((tb, i) => (
                <li key={tb} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-right text-slate-500">{i + 1}.</span>
                  <span className="flex-1">{TIE_BREAKERS.find(([k]) => k === tb)?.[1]}</span>
                  <Button size="sm" variant="ghost" onClick={() => moveTb(i, -1)} disabled={i === 0} aria-label="Move up">↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => moveTb(i, 1)} disabled={i === v.rules.tieBreakers.length - 1} aria-label="Move down">↓</Button>
                  <Button size="sm" variant="ghost" onClick={() => set('rules.tieBreakers')(v.rules.tieBreakers.filter((x) => x !== tb))} aria-label="Remove">✕</Button>
                </li>
              ))}
            </ol>
            <div className="mt-2 flex flex-wrap gap-2">
              {TIE_BREAKERS.filter(([k]) => !v.rules.tieBreakers.includes(k)).map(([k, l]) => (
                <Button key={k} size="sm" variant="outline" icon={Plus} onClick={() => set('rules.tieBreakers')([...v.rules.tieBreakers, k])}>{l}</Button>
              ))}
            </div>
            <Checkbox className="mt-3" checked={v.rules.countsForStandings} onChange={set('rules.countsForStandings')} label="Results in this competition produce a league table" />
          </fieldset>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-medium">Seasons</legend>
            <ul className="mt-1 space-y-1">
              {seasons.map((s) => (
                <li key={s.id}><Checkbox label={seasonLabel(s, seasons)} checked={v.seasons.includes(s.id)} onChange={(ev) => toggle('seasons', s.id, ev.target.checked)} /></li>
              ))}
            </ul>
            {!seasons.length && (
              <p className="mt-1 text-sm text-slate-600">
                No seasons yet. Add one (for example 2026) on the <Link to="/dashboard/seasons" className="font-medium text-brand-700 underline">Seasons</Link> page.
              </p>
            )}
            <Field label="Current season" className="mt-2" hint="Which season this competition’s table and fixtures show by default. Past seasons stay available.">
              <Select value={v.currentSeason} onChange={chooseCurrent}>
                <option value="">Follow the club’s current season{clubCurrent ? ` (${clubCurrent.name})` : ''}</option>
                {seasons.map((s) => <option key={s.id} value={s.id}>{seasonLabel(s, seasons)}</option>)}
              </Select>
            </Field>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">Teams taking part</legend>
            <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto">
              {teams.map((t) => (
                <li key={t.id}><Checkbox label={`${t.name}${t.isClubTeam ? ' (club)' : ''}`} checked={v.teams.includes(t.id)} onChange={(ev) => toggle('teams', t.id, ev.target.checked)} /></li>
              ))}
            </ul>
          </fieldset>
        </div>
      </form>
    </Modal>
  );
}

export function CompetitionsAdminPage() {
  useSeo({ title: 'Competitions', noindex: true });
  const state = useApi('/admin/competitions');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const { notify } = useToast();
  async function remove() {
    try {
      await apiRequest(`/admin/competitions/${del.id}`, { method: 'DELETE' });
      notify('Competition deleted.');
      state.reload();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setDel(null);
    }
  }
  return (
    <>
      <PageHeader title="Competitions" description="Leagues, cups and friendlies, each with its own points and tie-break rules." actions={<Button icon={Plus} onClick={() => setEdit('new')}>Add competition</Button>} />
      <AsyncContent state={state} isEmpty={(d) => !d.length} empty={<EmptyState icon={Trophy} title="No competitions yet" action={<Button icon={Plus} onClick={() => setEdit('new')}>Add a competition</Button>} />}>
        {(list) => (
          <DataTable
            caption="Competitions"
            rows={list}
            columns={[
              { key: 'name', label: 'Competition', render: (c) => <span className="font-medium">{c.name}</span> },
              { key: 'type', nowrap: true, label: 'Type', render: (c) => ({ league: 'League', cup: 'Cup', friendly: 'Friendlies' })[c.type] },
              { key: 'rules', nowrap: true, label: 'Points', render: (c) => (c.type === 'friendly' ? '–' : `${c.rules.pointsWin}/${c.rules.pointsDraw}/${c.rules.pointsLoss}`) },
              { key: 'season', nowrap: true, label: 'Current season', render: (c) => c.currentSeason?.name || '–' },
              { key: 'teams', nowrap: true, label: 'Teams', render: (c) => c.teams.length },
              { key: 'status', nowrap: true, label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
              { key: 'a', nowrap: true, label: <span className="sr-only">Actions</span>, render: (c) => <span className="flex gap-1"><IconButton label={`Edit ${c.name}`} icon={Pencil} onClick={() => setEdit(c)} /><IconButton label={`Delete ${c.name}`} icon={Trash2} onClick={() => setDel(c)} /></span> },
            ]}
          />
        )}
      </AsyncContent>
      {edit && <CompetitionForm competition={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); state.reload(); }} />}
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} title={`Delete ${del?.name}?`} confirmLabel="Delete">
        Competitions with matches cannot be deleted; archive them instead.
      </ConfirmDialog>
    </>
  );
}

// ---------------------------------------------------------------------------------- Standings
export function StandingsAdminPage() {
  useSeo({ title: 'Standings', noindex: true });
  const { can } = useAuth();
  const competitions = useCompetitions().filter((c) => c.type !== 'friendly');
  const seasons = useSeasons();
  const [compId, setCompId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const comp = competitions.find((c) => c.id === compId) || competitions[0];
  const table = useApi(comp ? `/competitions/${comp.id}/standings${qs({ season: seasonId })}` : null);
  const adjustments = useApi(comp ? `/admin/competitions/${comp.id}/adjustments` : null);
  const [adding, setAdding] = useState(false);
  const [revoke, setRevoke] = useState(null);
  const { notify } = useToast();

  async function doRevoke() {
    try {
      await apiRequest(`/admin/competitions/${comp.id}/adjustments/${revoke.id}`, { method: 'DELETE' });
      notify('Correction revoked. The table has been recalculated.');
      table.reload();
      adjustments.reload();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setRevoke(null);
    }
  }

  return (
    <>
      <PageHeader title="Standings" description="Tables are calculated automatically from recorded results. Corrections are explicit, explained and recorded in the audit log." actions={can('standings.override') && comp && <Button icon={Plus} onClick={() => setAdding(true)}>Add correction</Button>} />
      {!competitions.length ? (
        <EmptyState icon={ListOrdered} title="No league competitions yet" action={<Link to="/dashboard/competitions" className="font-semibold underline">Add a competition</Link>} />
      ) : (
        <>
          <FilterBar>
            <Field label="Competition">
              <Select value={comp?.id || ''} onChange={(e) => setCompId(e.target.value)}>
                {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Season">
              <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
                <option value="">Current</option>
                {seasons.map((s) => <option key={s.id} value={s.id}>{seasonLabel(s, seasons)}</option>)}
              </Select>
            </Field>
          </FilterBar>
          <AsyncContent state={table} isEmpty={(d) => !d.rows.length} empty={<EmptyState icon={ListOrdered} title="No results recorded yet for this season" />}>
            {(d) => <StandingsTable rows={d.rows} />}
          </AsyncContent>
          <Card className="mt-6">
            <CardHeader title="Corrections" description="Points deductions, awarded matches and other official decisions." />
            <AsyncContent state={adjustments} isEmpty={(d) => !d.length} empty={<p className="p-4 text-sm text-slate-600">No corrections.</p>}>
              {(list) => (
                <ul className="divide-y divide-slate-100">
                  {list.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-start gap-3 p-4 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {a.team?.name}: {a.points > 0 ? '+' : ''}{a.points} pts{a.goalsFor ? `, GF ${a.goalsFor > 0 ? '+' : ''}${a.goalsFor}` : ''}{a.goalsAgainst ? `, GA ${a.goalsAgainst > 0 ? '+' : ''}${a.goalsAgainst}` : ''} · {a.season?.name}
                        </p>
                        <p className="text-slate-700">{a.reason}</p>
                        <p className="text-xs text-slate-500">By {a.createdBy} on {formatDate(a.createdAt)}{a.revokedAt ? ` · Revoked by ${a.revokedBy} on ${formatDate(a.revokedAt)}` : ''}</p>
                      </div>
                      {a.revokedAt ? <Badge>Revoked</Badge> : can('standings.override') && <Button size="sm" variant="outline" icon={Undo2} onClick={() => setRevoke(a)}>Revoke</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </AsyncContent>
          </Card>
        </>
      )}
      {adding && comp && <AdjustmentForm competition={comp} seasons={seasons} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); table.reload(); adjustments.reload(); }} />}
      <ConfirmDialog open={Boolean(revoke)} onClose={() => setRevoke(null)} onConfirm={doRevoke} title="Revoke this correction?" confirmLabel="Revoke" tone="primary">
        The table will be recalculated without it. The correction stays visible in the history.
      </ConfirmDialog>
    </>
  );
}

function AdjustmentForm({ competition, seasons, onClose, onSaved }) {
  const { notify } = useToast();
  const form = useForm({ season: competition.currentSeason?.id || seasons[0]?.id || '', team: '', points: 0, goalsFor: 0, goalsAgainst: 0, reason: '' });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    await apiRequest(`/admin/competitions/${competition.id}/adjustments`, { method: 'POST', body: { ...values, points: Number(values.points), goalsFor: Number(values.goalsFor), goalsAgainst: Number(values.goalsAgainst) } });
    notify('Correction applied.');
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={`Correction · ${competition.name}`} size="md" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Apply correction</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={form.formError} />
        <Alert tone="info">Use this only for official decisions (for example a points deduction). It is shown on the public table and recorded in the audit log.</Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Season" required error={e.season}>
            <Select value={v.season} onChange={set('season')}>
              {seasons.map((s) => <option key={s.id} value={s.id}>{seasonLabel(s, seasons)}</option>)}
            </Select>
          </Field>
          <Field label="Team" required error={e.team}>
            <Select value={v.team} onChange={set('team')}>
              <option value="">Choose…</option>
              {competition.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Points (+/-)" error={e.points}><Input type="number" value={v.points} onChange={set('points')} /></Field>
          <Field label="Goals for (+/-)" error={e.goalsFor}><Input type="number" value={v.goalsFor} onChange={set('goalsFor')} /></Field>
          <Field label="Goals against (+/-)" error={e.goalsAgainst}><Input type="number" value={v.goalsAgainst} onChange={set('goalsAgainst')} /></Field>
        </div>
        <Field label="Reason" required error={e.reason} hint="e.g. 3-point deduction for fielding an ineligible player (League ruling of 12 March).">
          <Textarea value={v.reason} onChange={set('reason')} rows={3} maxLength={500} />
        </Field>
      </form>
    </Modal>
  );
}

