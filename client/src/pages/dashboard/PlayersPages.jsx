import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Archive, ExternalLink, FileText, Lock, Plus, ShieldAlert, Shirt, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useApi, qs } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { apiRequest, uploadFile } from '../../services/apiClient.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { AsyncContent, EmptyState, Alert } from '../../components/ui/Feedback.jsx';
import { StatusBadge, Badge } from '../../components/ui/Badge.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button.jsx';
import { Field, Input, Select, Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { MediaUpload } from '../../components/ui/ImageUpload.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { StatGrid } from '../../components/football/StatGrid.jsx';
import { POSITIONS } from '../../lib/labels.js';
import { formatDate, toDateInput } from '../../lib/format.js';
import { FilterBar, useTeams } from './shared.jsx';
import { userMessage } from '../../lib/errors.js';

const STATUSES = [
  ['active', 'Active'],
  ['injured', 'Injured'],
  ['on_loan', 'On loan'],
  ['inactive', 'Inactive'],
  ['released', 'Released'],
  ['archived', 'Archived'],
];

export function PlayersListPage() {
  useSeo({ title: 'Players', noindex: true });
  const { can } = useAuth();
  const navigate = useNavigate();
  const teams = useTeams({ clubOnly: true });
  const [f, setF] = useState({ q: '', team: '', position: '', status: '' });
  const [page, setPage] = useState(1);
  const q = useDebounce(f.q, 300);
  const state = useApi(`/admin/players${qs({ ...f, q, page })}`);
  const upd = (k) => (e) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setPage(1);
  };
  return (
    <>
      <PageHeader
        title="Players"
        description="Player records. You only see players within your permitted scope."
        actions={can('players.create') && <ButtonLink to="/dashboard/players/new" icon={Plus}>Add player</ButtonLink>}
      />
      <FilterBar>
        <Field label="Search">
          <Input type="search" value={f.q} onChange={upd('q')} placeholder="Name" />
        </Field>
        <Field label="Team">
          <Select value={f.team} onChange={upd('team')}>
            <option value="">All teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Position">
          <Select value={f.position} onChange={upd('position')}>
            <option value="">All</option>
            {POSITIONS.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={upd('status')}>
            <option value="">All</option>
            {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
      </FilterBar>
      <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Shirt} title="No players found" />}>
        {(d) => (
          <>
            <DataTable
              caption="Players"
              rows={d.items}
              onRowClick={(p) => navigate(`/dashboard/players/${p.id}`)}
              columns={[
                { key: 'no', label: '#', render: (p) => p.jerseyNumber ?? '–', className: 'w-12' },
                { key: 'name', label: 'Name', render: (p) => <span className="font-medium">{p.fullName}</span> },
                { key: 'pos', label: 'Position', render: (p) => p.position },
                { key: 'team', label: 'Team', render: (p) => p.team?.name || '–' },
                { key: 'flags', label: '', render: (p) => <span className="flex flex-wrap gap-1">{p.isMinor && <Badge tone="warning">U18</Badge>}{p.hasAccount && <Badge tone="brand">Portal</Badge>}{!p.showOnWebsite && <Badge>Hidden</Badge>}</span> },
                { key: 'status', label: 'Status', render: (p) => <StatusBadge status={p.status} label={STATUSES.find(([k]) => k === p.status)?.[1]} /> },
              ]}
            />
            <Pagination page={d.page} pages={d.pages} onChange={setPage} className="mt-4" />
          </>
        )}
      </AsyncContent>
    </>
  );
}

function toForm(p) {
  const r = p?.restricted || {};
  const s = p?.sensitive || {};
  return {
    firstName: p?.firstName || '',
    lastName: p?.lastName || '',
    knownAs: p?.knownAs || '',
    photo: p?.photo || null,
    position: p?.position || 'Midfielder',
    detailedPosition: p?.detailedPosition || '',
    jerseyNumber: p?.jerseyNumber ?? '',
    team: p?.team?.id || '',
    nationality: p?.nationality || '',
    bio: p?.bio || '',
    preferredFoot: p?.preferredFoot || '',
    featured: Boolean(p?.featured),
    showOnWebsite: p ? p.showOnWebsite : true,
    status: p?.status || 'active',
    joinedAt: toDateInput(p?.joinedAt),
    hidePhotoPublicly: Boolean(p?.hidePhotoPublicly),
    hideFullNamePublicly: Boolean(p?.hideFullNamePublicly),
    statAdjustments: p?.statAdjustments || { appearances: 0, goals: 0, assists: 0 },
    restricted: {
      dateOfBirth: toDateInput(r.dateOfBirth),
      phone: r.phone || '',
      email: r.email || '',
      address: r.address || '',
      emergencyContact: { name: r.emergencyContact?.name || '', relationship: r.emergencyContact?.relationship || '', phone: r.emergencyContact?.phone || '' },
      guardian: { name: r.guardian?.name || '', relationship: r.guardian?.relationship || '', phone: r.guardian?.phone || '', email: r.guardian?.email || '' },
      internalNotes: r.internalNotes || '',
    },
    sensitive: { nationalId: s.nationalId || '', medicalNotes: s.medicalNotes || '' },
  };
}

function toBody(v, { restricted, sensitive, canAdjust }) {
  const body = {
    ...v,
    jerseyNumber: v.jerseyNumber === '' ? null : Number(v.jerseyNumber),
    team: v.team || null,
    joinedAt: v.joinedAt || null,
    photo: v.photo || null,
    restricted: restricted ? { ...v.restricted, dateOfBirth: v.restricted.dateOfBirth || null } : undefined,
    sensitive: sensitive ? v.sensitive : undefined,
    statAdjustments: canAdjust ? { appearances: Number(v.statAdjustments.appearances) || 0, goals: Number(v.statAdjustments.goals) || 0, assists: Number(v.statAdjustments.assists) || 0 } : undefined,
  };
  return body;
}

/** Create / edit a player. Private sections only appear (and are only saved) with the right permission and scope. */
export function PlayerEditPage() {
  const { id } = useParams();
  const isNew = !id;
  useSeo({ title: isNew ? 'Add player' : 'Player', noindex: true });
  const state = useApi(isNew ? null : `/admin/players/${id}`);
  if (!isNew && !state.data) return <AsyncContent state={state}>{() => null}</AsyncContent>;
  return <PlayerForm key={state.data?.updatedAt || 'new'} player={state.data} onSaved={state.reload} />;
}

function PlayerForm({ player, onSaved }) {
  const { can } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const teams = useTeams({ clubOnly: true });
  const isNew = !player;
  const canEdit = isNew ? can('players.create') : player.canEdit;
  const showRestricted = isNew ? can('players.sensitive.view') : Boolean(player.restricted);
  const showSensitive = isNew ? can('players.highly_sensitive.view') : Boolean(player.sensitive);
  const canAdjust = can('players.create');
  const form = useForm(toForm(player));
  const { values: v, set, errors: e } = form;
  const [archive, setArchive] = useState(false);

  const onSubmit = form.submit(async (values) => {
    const body = toBody(values, { restricted: showRestricted, sensitive: showSensitive, canAdjust });
    const saved = await apiRequest(isNew ? '/admin/players' : `/admin/players/${player.id}`, { method: isNew ? 'POST' : 'PUT', body });
    notify(isNew ? 'Player created.' : 'Player saved.');
    if (isNew) navigate(`/dashboard/players/${saved.id}`, { replace: true });
    else onSaved();
  });

  async function doArchive() {
    try {
      await apiRequest(`/admin/players/${player.id}`, { method: 'DELETE' });
      notify('Player archived. Their match history is kept.');
      navigate('/dashboard/players');
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Players', to: '/dashboard/players' }, { label: isNew ? 'New player' : player.fullName }]}
        title={isNew ? 'Add player' : player.fullName}
        description={isNew ? 'Create a player record. Only public football information is shown on the website.' : `${player.position}${player.team ? ` · ${player.team.name}` : ''}`}
        actions={
          !isNew && (
            <>
              {player.showOnWebsite && player.status !== 'archived' && (
                <ButtonLink to={`/players/${player.slug}`} variant="outline" icon={ExternalLink} target="_blank">
                  Public profile
                </ButtonLink>
              )}
              {can('players.create') && (
                <Button variant="danger-outline" icon={Archive} onClick={() => setArchive(true)}>
                  Archive
                </Button>
              )}
            </>
          )
        }
      />
      {!isNew && player.linkedUser && <Alert tone="info" className="mb-4">Linked to the website account {player.linkedUser.email} (Player Portal access).</Alert>}
      {!canEdit && <Alert tone="info" className="mb-4">You can view this player but not edit them.</Alert>}

      {!isNew && player.stats && (
        <Card className="mb-4 p-4">
          <h2 className="mb-3 font-semibold">Career statistics (from recorded matches)</h2>
          <StatGrid stats={player.stats} />
        </Card>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError error={form.formError} />
        <fieldset disabled={!canEdit} className="space-y-4">
          <Card>
            <CardHeader title="Public profile" description="This information can appear on the website." />
            <div className="grid gap-4 p-4 lg:grid-cols-[16rem_1fr]">
              <MediaUpload label="Photo" folder="players" value={v.photo} onChange={set('photo')} aspect="aspect-[4/5]" />
              <div className="grid content-start gap-4 sm:grid-cols-2">
                <Field label="First name" required error={e.firstName}>
                  <Input value={v.firstName} onChange={set('firstName')} maxLength={60} />
                </Field>
                <Field label="Last name" required error={e.lastName}>
                  <Input value={v.lastName} onChange={set('lastName')} maxLength={60} />
                </Field>
                <Field label="Known as (optional)" error={e.knownAs}>
                  <Input value={v.knownAs} onChange={set('knownAs')} maxLength={60} />
                </Field>
                <Field label="Nationality" error={e.nationality}>
                  <Input value={v.nationality} onChange={set('nationality')} maxLength={60} />
                </Field>
                <Field label="Team" error={e.team}>
                  <Select value={v.team} onChange={set('team')}>
                    <option value="">No team</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </Field>
                <Field label="Shirt number" error={e.jerseyNumber}>
                  <Input type="number" min={1} max={99} value={v.jerseyNumber} onChange={set('jerseyNumber')} />
                </Field>
                <Field label="Position" required error={e.position}>
                  <Select value={v.position} onChange={set('position')}>
                    {POSITIONS.map((p) => <option key={p}>{p}</option>)}
                  </Select>
                </Field>
                <Field label="Detailed position" error={e.detailedPosition} hint="e.g. Left winger">
                  <Input value={v.detailedPosition} onChange={set('detailedPosition')} maxLength={60} />
                </Field>
                <Field label="Preferred foot" error={e.preferredFoot}>
                  <Select value={v.preferredFoot} onChange={set('preferredFoot')}>
                    <option value="">Not set</option>
                    <option value="right">Right</option>
                    <option value="left">Left</option>
                    <option value="both">Both</option>
                  </Select>
                </Field>
                <Field label="Status" error={e.status}>
                  <Select value={v.status} onChange={set('status')}>
                    {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Joined the club" error={e.joinedAt}>
                  <Input type="date" value={v.joinedAt} onChange={set('joinedAt')} />
                </Field>
              </div>
            </div>
            <div className="space-y-3 px-4 pb-4">
              <Field label="Public biography" error={e.bio}>
                <Textarea value={v.bio} onChange={set('bio')} rows={4} maxLength={4000} />
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Checkbox checked={v.showOnWebsite} onChange={set('showOnWebsite')} label="Show on the public website" />
                <Checkbox checked={v.featured} onChange={set('featured')} label="Feature on the homepage" />
                <Checkbox checked={v.hideFullNamePublicly} onChange={set('hideFullNamePublicly')} label="Hide surname publicly" hint="Recommended for under-18s." />
                <Checkbox checked={v.hidePhotoPublicly} onChange={set('hidePhotoPublicly')} label="Hide photo publicly" />
              </div>
            </div>
          </Card>

          {canAdjust && (
            <Card>
              <CardHeader title="Historical statistics" description="Official totals from before this website existed. They are added to career totals only." />
              <div className="grid gap-4 p-4 sm:grid-cols-3">
                {['appearances', 'goals', 'assists'].map((k) => (
                  <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                    <Input type="number" min={0} max={2000} value={v.statAdjustments[k]} onChange={set(`statAdjustments.${k}`)} />
                  </Field>
                ))}
              </div>
            </Card>
          )}

          {showRestricted && (
            <Card className="border-amber-200">
              <CardHeader title={<span className="flex items-center gap-2"><Lock aria-hidden="true" className="size-4" /> Restricted information</span>} description="Never shown publicly. Viewing it is recorded in the audit log." />
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Field label="Date of birth" error={e['restricted.dateOfBirth']}>
                  <Input type="date" value={v.restricted.dateOfBirth} onChange={set('restricted.dateOfBirth')} />
                </Field>
                <Field label="Phone" error={e['restricted.phone']}>
                  <Input value={v.restricted.phone} onChange={set('restricted.phone')} maxLength={40} />
                </Field>
                <Field label="Contact email" error={e['restricted.email']}>
                  <Input type="email" value={v.restricted.email} onChange={set('restricted.email')} maxLength={254} />
                </Field>
                <Field label="Address" error={e['restricted.address']}>
                  <Input value={v.restricted.address} onChange={set('restricted.address')} maxLength={400} />
                </Field>
                {['name', 'relationship', 'phone'].map((k) => (
                  <Field key={k} label={`Emergency contact ${k}`}>
                    <Input value={v.restricted.emergencyContact[k]} onChange={set(`restricted.emergencyContact.${k}`)} maxLength={120} />
                  </Field>
                ))}
                {['name', 'relationship', 'phone', 'email'].map((k) => (
                  <Field key={`g${k}`} label={`Parent/guardian ${k}`}>
                    <Input value={v.restricted.guardian[k]} onChange={set(`restricted.guardian.${k}`)} maxLength={254} />
                  </Field>
                ))}
                <Field label="Internal notes (staff only)" className="sm:col-span-2">
                  <Textarea value={v.restricted.internalNotes} onChange={set('restricted.internalNotes')} rows={3} maxLength={5000} />
                </Field>
              </div>
            </Card>
          )}

          {showSensitive && (
            <Card className="border-red-200">
              <CardHeader title={<span className="flex items-center gap-2"><ShieldAlert aria-hidden="true" className="size-4" /> Highly sensitive</span>} description="Only store this if the club genuinely needs it." />
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Field label="National ID (NIN)">
                  <Input value={v.sensitive.nationalId} onChange={set('sensitive.nationalId')} maxLength={60} autoComplete="off" />
                </Field>
                <Field label="Medical notes" className="sm:col-span-2">
                  <Textarea value={v.sensitive.medicalNotes} onChange={set('sensitive.medicalNotes')} rows={3} maxLength={5000} />
                </Field>
              </div>
            </Card>
          )}
        </fieldset>
        {canEdit && (
          <Button type="submit" size="lg" loading={form.submitting}>
            {isNew ? 'Create player' : 'Save changes'}
          </Button>
        )}
      </form>

      {!isNew && player.restricted && <Documents player={player} onChanged={onSaved} canHighly={Boolean(player.sensitive)} />}

      <ConfirmDialog open={archive} onClose={() => setArchive(false)} onConfirm={doArchive} title="Archive this player?" confirmLabel="Archive">
        The player is removed from squads and the website. Their appearances and goals stay in match history.
      </ConfirmDialog>
      {!isNew && <p className="mt-6 text-xs text-slate-500">Created {formatDate(player.createdAt)} · Updated {formatDate(player.updatedAt)}</p>}
      <Link to="/dashboard/players" className="sr-only">Back to players</Link>
    </>
  );
}

const DOC_KINDS = [
  ['registration', 'Registration form'],
  ['consent', 'Consent form'],
  ['id', 'Identity document'],
  ['medical', 'Medical'],
  ['other', 'Other'],
];

function Documents({ player, onChanged, canHighly }) {
  const { notify } = useToast();
  const input = useRef(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('registration');
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState(null);

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await uploadFile(`/admin/players/${player.id}/documents`, file, { name: name || file.name.slice(0, 150), kind });
      setName('');
      notify('Document stored privately.');
      onChanged();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setBusy(false);
    }
  }
  async function open(d) {
    try {
      const { url } = await apiRequest(`/admin/players/${player.id}/documents/${d.id}`);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    }
  }
  async function doRemove() {
    try {
      await apiRequest(`/admin/players/${player.id}/documents/${remove.id}`, { method: 'DELETE' });
      notify('Document deleted.');
      onChanged();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setRemove(null);
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader title="Private documents" description="Stored privately in Cloudinary. Links expire after 5 minutes and every opening is audited." />
      <div className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
          </Field>
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {DOC_KINDS.filter(([k]) => canHighly || !['id', 'medical'].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Button icon={Upload} loading={busy} onClick={() => input.current?.click()}>Upload</Button>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={upload} />
        </div>
        {player.restricted.documents.length ? (
          <ul className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200">
            {player.restricted.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 p-3">
                <FileText aria-hidden="true" className="size-5 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-slate-500">{DOC_KINDS.find(([k]) => k === d.kind)?.[1]} · {formatDate(d.uploadedAt)}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => open(d)}>Open</Button>
                <IconButton label="Delete document" icon={Trash2} onClick={() => setRemove(d)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-600">No documents yet.</p>
        )}
      </div>
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={doRemove} title="Delete document?" confirmLabel="Delete">
        The file is deleted permanently.
      </ConfirmDialog>
    </Card>
  );
}
