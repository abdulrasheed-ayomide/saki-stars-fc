import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, FileText, Link2, Megaphone, Pencil, Plus, Trash2, Upload } from 'lucide-react';
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
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatDate, formatDateTime, toDateInput } from '../../lib/format.js';
import { userMessage } from '../../lib/errors.js';
import { seasonLabel } from '../../lib/seasons.js';
import { FilterBar, Stat, useSeasons, useTeams } from './shared.jsx';

export const TRANSFER_STATUS_LABELS = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};
export const TRANSFER_TYPE_LABELS = { permanent: 'Permanent', loan: 'Loan', loan_return: 'Loan return', free: 'Free transfer', other: 'Other' };
const WINDOW_LABELS = { main: 'Main window', mid_season: 'Mid-season window', outside_window: 'Outside a window' };
const DIRECTION_LABELS = { incoming: 'Incoming', outgoing: 'Outgoing' };
const DOC_KINDS = { contract: 'Contract', clearance: 'Clearance', agreement: 'Agreement', medical: 'Medical', registration: 'Registration', other: 'Other' };
const PLAYER_STATUS_LABELS = { active: 'Active', inactive: 'Inactive', injured: 'Injured', on_loan: 'On loan', released: 'Released', archived: 'Archived' };

/** Buttons for the workflow, in the order they appear. The server decides what is allowed. */
const ACTIONS = {
  submit: { label: 'Submit for approval', variant: 'primary', done: 'Submitted for approval.' },
  approve: { label: 'Approve', variant: 'primary', done: 'Transfer approved.' },
  reject: { label: 'Reject', variant: 'danger-outline', done: 'Transfer rejected.', noteRequired: true },
  start: { label: 'Mark in progress', variant: 'primary', done: 'Marked in progress.' },
  complete: { label: 'Mark completed', variant: 'primary', done: 'Transfer completed.' },
  withdraw: { label: 'Withdraw to draft', variant: 'outline', done: 'Withdrawn to draft.' },
  reopen: { label: 'Reopen as draft', variant: 'outline', done: 'Reopened as a draft.' },
  cancel: { label: 'Cancel transfer', variant: 'danger-outline', done: 'Transfer cancelled.' },
};

/** Same colours as other statuses in the dashboard ("pending approval" shows as pending). */
export function TransferStatusBadge({ status }) {
  return <StatusBadge status={status === 'pending_approval' ? 'pending' : status} label={TRANSFER_STATUS_LABELS[status]} />;
}

function DirectionLabel({ direction }) {
  const Icon = direction === 'incoming' ? ArrowDownLeft : ArrowUpRight;
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${direction === 'incoming' ? 'text-emerald-700' : 'text-brand-700'}`}>
      <Icon aria-hidden="true" className="size-4" />
      {DIRECTION_LABELS[direction]}
    </span>
  );
}

// ------------------------------------------------------------------------------- List
export function TransfersListPage() {
  useSeo({ title: 'Player transfers', noindex: true });
  const { can } = useAuth();
  const navigate = useNavigate();
  const seasons = useSeasons();
  const [f, setF] = useState({ q: '', direction: '', status: '', type: '', season: '', club: '' });
  const [page, setPage] = useState(1);
  const q = useDebounce(f.q, 300);
  const club = useDebounce(f.club, 300);
  const summary = useApi('/admin/transfers/summary');
  const state = useApi(`/admin/transfers${qs({ ...f, q, club, page })}`);
  const upd = (k) => (e) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setPage(1);
  };
  const filtered = Object.values(f).some(Boolean);
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Player transfers"
        description="Private records of players joining and leaving the club. Nothing here is shown on the website."
        actions={can('transfers.manage') && <ButtonLink to="/dashboard/transfers/new" icon={Plus}>New transfer</ButtonLink>}
      />
      {s && (
        <div role="group" className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Transfer summary">
          <Stat label="Incoming" value={s.incoming} />
          <Stat label="Outgoing" value={s.outgoing} />
          <Stat label="Pending approval" value={s.pending} tone="attention" />
          <Stat label="Approved" value={s.approved} />
          <Stat label="Completed" value={s.completed} />
        </div>
      )}
      <FilterBar>
        <Field label="Search">
          <Input type="search" value={f.q} onChange={upd('q')} placeholder="Player, club or reference" />
        </Field>
        <Field label="Direction">
          <Select value={f.direction} onChange={upd('direction')}>
            <option value="">Incoming and outgoing</option>
            {Object.entries(DIRECTION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={upd('status')}>
            <option value="">All statuses</option>
            {Object.entries(TRANSFER_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={f.type} onChange={upd('type')}>
            <option value="">All types</option>
            {Object.entries(TRANSFER_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Season">
          <Select value={f.season} onChange={upd('season')}>
            <option value="">All seasons</option>
            {seasons.map((x) => <option key={x.id} value={x.id}>{seasonLabel(x, seasons)}</option>)}
          </Select>
        </Field>
        <Field label="Club">
          <Input type="search" value={f.club} onChange={upd('club')} placeholder="Other club" />
        </Field>
      </FilterBar>
      <AsyncContent
        state={state}
        context="transfers"
        isEmpty={(d) => !d.items.length}
        empty={
          <EmptyState
            icon={ArrowLeftRight}
            title={filtered ? 'No transfers match these filters' : 'No transfers recorded yet'}
            action={!filtered && can('transfers.manage') && <ButtonLink to="/dashboard/transfers/new" icon={Plus}>Record a transfer</ButtonLink>}
          />
        }
      >
        {(d) => (
          <>
            <p className="mb-2 text-sm text-slate-600" aria-live="polite">{d.total} transfer{d.total === 1 ? '' : 's'}</p>
            <DataTable
              caption="Player transfers"
              rows={d.items}
              onRowClick={(t) => navigate(`/dashboard/transfers/${t.id}`)}
              columns={[
                { key: 'ref', nowrap: true, label: 'Reference', render: (t) => <span className="font-mono text-xs">{t.reference}</span> },
                { key: 'player', label: 'Player', render: (t) => <span className="font-medium">{t.playerName}</span> },
                { key: 'dir', nowrap: true, label: 'Direction', render: (t) => <DirectionLabel direction={t.direction} /> },
                { key: 'clubs', label: 'From → To', render: (t) => `${t.fromClub} → ${t.toClub}` },
                { key: 'type', nowrap: true, label: 'Type', render: (t) => TRANSFER_TYPE_LABELS[t.type] },
                { key: 'date', nowrap: true, label: 'Date', render: (t) => formatDate(t.effectiveDate || t.proposedDate) || '–' },
                { key: 'status', nowrap: true, label: 'Status', render: (t) => <TransferStatusBadge status={t.status} /> },
              ]}
            />
            <Pagination page={d.page} pages={d.pages} onChange={setPage} className="mt-4" />
          </>
        )}
      </AsyncContent>
    </>
  );
}

// ------------------------------------------------------------------------------- Form
function toForm(t) {
  return {
    direction: t?.direction || 'incoming',
    playerMode: t ? (t.player ? 'existing' : 'new') : 'existing',
    player: t?.player?.id || '',
    externalPlayer: {
      firstName: t?.externalPlayer?.firstName || '',
      lastName: t?.externalPlayer?.lastName || '',
      position: t?.externalPlayer?.position || '',
      nationality: t?.externalPlayer?.nationality || '',
      dateOfBirth: toDateInput(t?.externalPlayer?.dateOfBirth),
    },
    otherClub: t ? (t.direction === 'incoming' ? t.fromClub : t.toClub) : '',
    clubTeam: t?.clubTeam?.id || '',
    type: t?.type || 'permanent',
    season: t?.season?.id || '',
    window: t?.window || '',
    proposedDate: toDateInput(t?.proposedDate),
    effectiveDate: toDateInput(t?.effectiveDate),
    loanEndDate: toDateInput(t?.loanEndDate),
    reason: t?.reason || '',
    internalNotes: t?.internalNotes || '',
  };
}

function toBody(v) {
  const existing = v.direction === 'outgoing' || v.playerMode === 'existing';
  return {
    direction: v.direction,
    player: existing ? v.player || null : null,
    externalPlayer: existing ? undefined : { ...v.externalPlayer, dateOfBirth: v.externalPlayer.dateOfBirth || null },
    otherClub: v.otherClub,
    clubTeam: v.clubTeam || null,
    type: v.type,
    season: v.season || null,
    window: v.window,
    proposedDate: v.proposedDate || null,
    effectiveDate: v.effectiveDate || null,
    loanEndDate: v.type === 'loan' ? v.loanEndDate || null : null,
    reason: v.reason,
    internalNotes: v.internalNotes,
  };
}

export function TransferEditPage() {
  const { id } = useParams();
  const isNew = !id;
  useSeo({ title: isNew ? 'New transfer' : 'Edit transfer', noindex: true });
  const state = useApi(isNew ? null : `/admin/transfers/${id}`);
  if (!isNew && !state.data) return <AsyncContent state={state} context="transfers">{() => null}</AsyncContent>;
  if (!isNew && !state.data.canEdit) {
    return (
      <>
        <PageHeader breadcrumbs={[{ label: 'Transfers', to: '/dashboard/transfers' }, { label: state.data.reference, to: `/dashboard/transfers/${id}` }]} title="Edit transfer" />
        <Alert tone="info">Only draft transfers can be edited. Withdraw it (or reopen it) as a draft first.</Alert>
      </>
    );
  }
  return <TransferForm key={state.data?.updatedAt || 'new'} transfer={state.data} />;
}

function TransferForm({ transfer }) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const isNew = !transfer;
  const players = useApi('/admin/transfers/player-options');
  const seasons = useSeasons();
  const teams = useTeams({ clubOnly: true });
  const form = useForm(toForm(transfer));
  const { values: v, set, errors: e } = form;
  const incoming = v.direction === 'incoming';
  const existing = !incoming || v.playerMode === 'existing';

  const onSubmit = form.submit(async (values) => {
    const body = toBody(values);
    const saved = await apiRequest(isNew ? '/admin/transfers' : `/admin/transfers/${transfer.id}`, {
      method: isNew ? 'POST' : 'PUT',
      body: isNew ? body : { ...body, expectedUpdatedAt: transfer.updatedAt },
    });
    notify(isNew ? `Transfer ${saved.reference} saved as a draft.` : 'Transfer saved.');
    navigate(`/dashboard/transfers/${saved.id}`, { replace: isNew });
  });

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Transfers', to: '/dashboard/transfers' }, { label: isNew ? 'New transfer' : transfer.reference }]}
        title={isNew ? 'New transfer' : `Edit ${transfer.reference}`}
        description="Saved as a draft. Nothing changes on the player’s record or the website until you decide."
      />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError error={form.formError} />
        <Card>
          <CardHeader title="Player" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Direction" required error={e.direction}>
              <Select value={v.direction} onChange={set('direction')}>
                <option value="incoming">Incoming: joining the club</option>
                <option value="outgoing">Outgoing: leaving the club</option>
              </Select>
            </Field>
            {incoming && (
              <Field label="Who is joining?">
                <Select value={v.playerMode} onChange={set('playerMode')}>
                  <option value="existing">A player already in the club’s records</option>
                  <option value="new">A new player, not registered yet</option>
                </Select>
              </Field>
            )}
            {existing ? (
              <Field label={incoming ? 'Player' : 'Player leaving'} required error={e.player} className="sm:col-span-2" hint={players.loading ? 'Loading players…' : undefined}>
                <Select value={v.player} onChange={set('player')}>
                  <option value="">Choose a player…</option>
                  {(players.data || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.jerseyNumber != null ? ` (#${p.jerseyNumber})` : ''}
                      {p.team ? ` · ${p.team}` : ''}
                      {p.status !== 'active' ? ` · ${PLAYER_STATUS_LABELS[p.status] || p.status}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <>
                <Field label="First name" required error={e['externalPlayer.firstName']}>
                  <Input value={v.externalPlayer.firstName} onChange={set('externalPlayer.firstName')} maxLength={60} />
                </Field>
                <Field label="Last name" required error={e['externalPlayer.lastName']}>
                  <Input value={v.externalPlayer.lastName} onChange={set('externalPlayer.lastName')} maxLength={60} />
                </Field>
                <Field label="Position" error={e['externalPlayer.position']}>
                  <Input value={v.externalPlayer.position} onChange={set('externalPlayer.position')} maxLength={60} />
                </Field>
                <Field label="Nationality" error={e['externalPlayer.nationality']}>
                  <Input value={v.externalPlayer.nationality} onChange={set('externalPlayer.nationality')} maxLength={60} />
                </Field>
                <Field label="Date of birth" error={e['externalPlayer.dateOfBirth']}>
                  <Input type="date" value={v.externalPlayer.dateOfBirth} onChange={set('externalPlayer.dateOfBirth')} />
                </Field>
                <p className="self-end text-sm text-slate-600 sm:pb-2">
                  No player record is created. Register the player under Players when ready, then link them on the transfer page.
                </p>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Transfer" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label={incoming ? 'Joining from (club)' : 'Moving to (club)'} required error={e.otherClub}>
              <Input value={v.otherClub} onChange={set('otherClub')} maxLength={120} />
            </Field>
            <Field label="Club team" error={e.clubTeam} hint={incoming ? 'The team they join (optional).' : 'The team they leave (optional).'}>
              <Select value={v.clubTeam} onChange={set('clubTeam')}>
                <option value="">Not set</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Type" required error={e.type}>
              <Select value={v.type} onChange={set('type')}>
                {Object.entries(TRANSFER_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Season" error={e.season}>
              <Select value={v.season} onChange={set('season')}>
                <option value="">Not set</option>
                {seasons.map((x) => <option key={x.id} value={x.id}>{seasonLabel(x, seasons)}</option>)}
              </Select>
            </Field>
            <Field label="Transfer window" error={e.window}>
              <Select value={v.window} onChange={set('window')}>
                <option value="">Not set</option>
                {Object.entries(WINDOW_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Proposed date" error={e.proposedDate}>
              <Input type="date" value={v.proposedDate} onChange={set('proposedDate')} />
            </Field>
            <Field label="Effective / completion date" error={e.effectiveDate} hint="Can also be set when the transfer is completed.">
              <Input type="date" value={v.effectiveDate} onChange={set('effectiveDate')} />
            </Field>
            {v.type === 'loan' && (
              <Field label="Loan ends" error={e.loanEndDate}>
                <Input type="date" value={v.loanEndDate} onChange={set('loanEndDate')} />
              </Field>
            )}
          </div>
          <div className="grid gap-4 px-4 pb-4">
            <Field label="Reason" error={e.reason}>
              <Textarea value={v.reason} onChange={set('reason')} rows={2} maxLength={2000} />
            </Field>
            <Field label="Internal notes (private)" error={e.internalNotes} hint="Only staff with transfer access can read these.">
              <Textarea value={v.internalNotes} onChange={set('internalNotes')} rows={3} maxLength={5000} />
            </Field>
          </div>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={form.submitting}>{isNew ? 'Save draft' : 'Save changes'}</Button>
          <ButtonLink to={isNew ? '/dashboard/transfers' : `/dashboard/transfers/${transfer.id}`} variant="outline">Cancel</ButtonLink>
        </div>
      </form>
    </>
  );
}

// ------------------------------------------------------------------------------- Detail
export function TransferDetailPage() {
  const { id } = useParams();
  useSeo({ title: 'Transfer', noindex: true });
  return <TransferDetailLoader key={id} id={id} />;
}

function TransferDetailLoader({ id }) {
  const state = useApi(`/admin/transfers/${id}`);
  // Every change returns the updated record, which is shown straight away.
  const [updated, setUpdated] = useState(null);
  const t = updated || state.data;
  if (!t) return <AsyncContent state={state} context="transfers">{() => null}</AsyncContent>;
  return <TransferDetail transfer={t} onChanged={setUpdated} />;
}

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-slate-900">{children || '–'}</dd>
    </div>
  );
}

function TransferDetail({ transfer: t, onChanged }) {
  const { can } = useAuth();
  const { notify } = useToast();
  const [action, setAction] = useState(null);
  const [drafting, setDrafting] = useState(false);
  const player = t.player;

  async function draftAnnouncement() {
    setDrafting(true);
    try {
      const res = await apiRequest(`/admin/transfers/${t.id}/announcement`, { method: 'POST' });
      notify('News draft created. Review and publish it under News when ready.');
      onChanged(res.transfer);
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setDrafting(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Transfers', to: '/dashboard/transfers' }, { label: t.reference }]}
        title={`${t.playerName}: ${DIRECTION_LABELS[t.direction].toLowerCase()} transfer`}
        description={`${t.reference} · ${t.fromClub} → ${t.toClub}`}
        actions={t.canEdit && <ButtonLink to={`/dashboard/transfers/${t.id}/edit`} variant="outline" icon={Pencil}>Edit</ButtonLink>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TransferStatusBadge status={t.status} />
        <Badge tone="brand">{TRANSFER_TYPE_LABELS[t.type]}</Badge>
        <DirectionLabel direction={t.direction} />
      </div>

      {t.allowedActions.length > 0 && (
        <Card className="mb-4 p-4">
          <h2 className="mb-1 font-semibold">Next steps</h2>
          <p className="mb-3 text-sm text-slate-600">
            {t.status === 'pending_approval'
              ? 'Waiting for approval by someone with transfer approval rights.'
              : t.status === 'approved'
                ? 'Approved. Mark it in progress once the paperwork with the other club has started.'
                : t.status === 'in_progress'
                  ? 'Mark it completed once the move has officially gone through.'
                  : 'Choose what happens next.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(ACTIONS)
              .filter((a) => t.allowedActions.includes(a))
              .map((a) => (
                <Button key={a} variant={ACTIONS[a].variant} onClick={() => setAction(a)}>
                  {ACTIONS[a].label}
                </Button>
              ))}
          </div>
        </Card>
      )}
      {t.status === 'pending_approval' && !t.allowedActions.includes('approve') && can('transfers.approve') && (
        <Alert tone="info" className="mb-4">You submitted this transfer, so someone else must approve it.</Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="grid gap-4 p-4 sm:grid-cols-2">
              <Detail label="Player">
                {player ? (
                  <>
                    {can('players.view', 'players.edit') ? <Link to={`/dashboard/players/${player.id}`} className="text-brand-700 underline">{player.name}</Link> : player.name}
                    <span className="block text-sm font-normal text-slate-600">
                      {[player.position, PLAYER_STATUS_LABELS[player.status], player.archived && 'Archived record'].filter(Boolean).join(' · ')}
                    </span>
                  </>
                ) : (
                  <>
                    {t.playerName}
                    <span className="block text-sm font-normal text-slate-600">
                      Not registered yet{[t.externalPlayer.position, t.externalPlayer.nationality].filter(Boolean).length ? ` · ${[t.externalPlayer.position, t.externalPlayer.nationality].filter(Boolean).join(' · ')}` : ''}
                      {t.externalPlayer.dateOfBirth ? ` · born ${formatDate(t.externalPlayer.dateOfBirth)}` : ''}
                    </span>
                  </>
                )}
              </Detail>
              <Detail label="Club team">{t.clubTeam?.name}</Detail>
              <Detail label="From">{t.fromClub}</Detail>
              <Detail label="To">{t.toClub}</Detail>
              <Detail label="Season">{t.season?.name}</Detail>
              <Detail label="Window">{WINDOW_LABELS[t.window]}</Detail>
              <Detail label="Proposed date">{formatDate(t.proposedDate)}</Detail>
              <Detail label="Effective / completion date">{formatDate(t.effectiveDate)}</Detail>
              {t.type === 'loan' && <Detail label="Loan ends">{formatDate(t.loanEndDate)}</Detail>}
              <Detail label="Created">{`${formatDateTime(t.createdAt)}${t.createdBy?.name ? ` by ${t.createdBy.name}` : ''}`}</Detail>
              <Detail label="Last updated">{`${formatDateTime(t.updatedAt)}${t.updatedBy?.name ? ` by ${t.updatedBy.name}` : ''}`}</Detail>
            </dl>
            {(t.reason || t.internalNotes) && (
              <dl className="grid gap-4 border-t border-slate-100 p-4">
                {t.reason && <Detail label="Reason"><span className="whitespace-pre-line font-normal">{t.reason}</span></Detail>}
                {t.internalNotes && <Detail label="Internal notes (private)"><span className="whitespace-pre-line font-normal">{t.internalNotes}</span></Detail>}
              </dl>
            )}
          </Card>
          {!player && t.status !== 'cancelled' && can('transfers.manage') && <LinkPlayer transfer={t} onChanged={onChanged} />}
          <Documents transfer={t} onChanged={onChanged} />
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Approval" />
            <div className="p-4 text-sm">
              {t.approval ? (
                <>
                  <p>
                    <StatusBadge status={t.approval.decision} label={t.approval.decision === 'approved' ? 'Approved' : 'Rejected'} />{' '}
                    by <strong>{t.approval.by?.name || 'a staff member'}</strong>, {formatDateTime(t.approval.at)}
                  </p>
                  {t.approval.note && <p className="mt-2 whitespace-pre-line text-slate-700">{t.approval.note}</p>}
                </>
              ) : (
                <p className="text-slate-600">{t.submittedAt ? `Submitted ${formatDateTime(t.submittedAt)}; no decision yet.` : 'Not submitted for approval yet.'}</p>
              )}
            </div>
          </Card>
          {t.status === 'completed' && (
            <Card>
              <CardHeader title="Announcement" />
              <div className="space-y-3 p-4 text-sm">
                {t.announcement ? (
                  <p>A news draft was created {formatDateTime(t.announcement.at)}. It is published only through News.</p>
                ) : (
                  <p className="text-slate-600">Completed transfers are never announced automatically.</p>
                )}
                {t.announcement && can('news.create', 'news.edit') && <ButtonLink to="/dashboard/news" variant="outline">Open News</ButtonLink>}
                {t.canDraftAnnouncement && (
                  <Button variant="outline" icon={Megaphone} loading={drafting} onClick={draftAnnouncement}>
                    Create news draft
                  </Button>
                )}
              </div>
            </Card>
          )}
          <History history={t.history} />
        </div>
      </div>

      {action && (
        <ActionDialog
          transfer={t}
          action={action}
          onClose={() => setAction(null)}
          onDone={(next) => {
            setAction(null);
            onChanged(next);
          }}
        />
      )}
    </>
  );
}

function ActionDialog({ transfer: t, action, onClose, onDone }) {
  const { notify } = useToast();
  const meta = ACTIONS[action];
  const afterApproval = action === 'cancel' && ['approved', 'in_progress'].includes(t.status);
  const noteRequired = meta.noteRequired || afterApproval;
  const form = useForm({ note: '', effectiveDate: toDateInput(t.effectiveDate) || toDateInput(new Date()), updatePlayer: false });
  const preview = t.playerUpdatePreview;
  const onSubmit = form.submit(async (values) => {
    if (noteRequired && !values.note.trim()) {
      throw Object.assign(new Error('Give a reason.'), { code: 'VALIDATION_ERROR', details: [{ path: 'note', message: 'Give a reason.' }] });
    }
    const body = { note: values.note };
    if (action === 'complete') Object.assign(body, { effectiveDate: values.effectiveDate || null, updatePlayer: Boolean(values.updatePlayer) });
    const next = await apiRequest(`/admin/transfers/${t.id}/actions/${action}`, { method: 'POST', body });
    notify(meta.done);
    onDone(next);
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`${meta.label}: ${t.reference}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button variant={meta.variant === 'outline' ? 'primary' : meta.variant} onClick={onSubmit} loading={form.submitting}>{meta.label}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError error={form.formError} />
        {action === 'approve' && <p className="text-sm text-slate-700">Your name and the time are recorded as the approval decision.</p>}
        {action === 'complete' && (
          <>
            <Field label="Completion date" required error={form.errors.effectiveDate}>
              <Input type="date" value={form.values.effectiveDate} onChange={form.set('effectiveDate')} />
            </Field>
            {preview && t.canUpdatePlayer ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <Checkbox
                  checked={form.values.updatePlayer}
                  onChange={form.set('updatePlayer')}
                  label="Also update the player’s record"
                  hint={Object.entries(preview)
                    .map(([k, c]) => `${k === 'status' ? 'Status' : 'Joined the club'}: ${k === 'status' ? PLAYER_STATUS_LABELS[c.from] || c.from || 'not set' : formatDate(c.from) || 'not set'} → ${k === 'status' ? PLAYER_STATUS_LABELS[c.to] : formatDate(c.to)}`)
                    .join('; ')}
                />
              </div>
            ) : (
              <p className="text-sm text-slate-600">The player’s record is not changed{!t.player ? ' (this transfer is not linked to a player record)' : !t.canUpdatePlayer && preview ? ' (you need permission to edit this player)' : ''}.</p>
            )}
          </>
        )}
        <Field label={noteRequired ? 'Reason' : 'Note (optional)'} required={noteRequired} error={form.errors.note}>
          <Textarea value={form.values.note} onChange={form.set('note')} rows={3} maxLength={2000} />
        </Field>
      </form>
    </Modal>
  );
}

function LinkPlayer({ transfer: t, onChanged }) {
  const { notify } = useToast();
  const players = useApi('/admin/transfers/player-options');
  const [player, setPlayer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function link() {
    if (!player) return setError('Choose a player.');
    setBusy(true);
    setError(null);
    try {
      const next = await apiRequest(`/admin/transfers/${t.id}/player`, { method: 'PATCH', body: { player } });
      notify('Transfer linked to the player record.');
      onChanged(next);
    } catch (err) {
      setError(userMessage(err, 'save'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader title="Link to a player record" description="Once this player has been registered under Players, link the transfer to their record." />
      <div className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Player" error={error}>
          <Select value={player} onChange={(e) => setPlayer(e.target.value)}>
            <option value="">Choose a player…</option>
            {(players.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.team ? ` · ${p.team}` : ''}</option>)}
          </Select>
        </Field>
        <Button variant="outline" icon={Link2} loading={busy} onClick={link} className={error ? 'sm:mb-6' : ''}>Link player</Button>
      </div>
    </Card>
  );
}

function Documents({ transfer: t, onChanged }) {
  const { notify } = useToast();
  const input = useRef(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('contract');
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState(null);

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const next = await uploadFile(`/admin/transfers/${t.id}/documents`, file, { name: name || file.name.slice(0, 150), kind });
      setName('');
      notify('Document stored privately.');
      onChanged(next);
    } catch (err) {
      notify(userMessage(err, 'upload'), 'error');
    } finally {
      setBusy(false);
    }
  }
  async function open(d) {
    try {
      const { url } = await apiRequest(`/admin/transfers/${t.id}/documents/${d.id}`);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    }
  }
  async function doRemove() {
    try {
      const next = await apiRequest(`/admin/transfers/${t.id}/documents/${remove.id}`, { method: 'DELETE' });
      notify('Document deleted.');
      onChanged(next);
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setRemove(null);
    }
  }

  return (
    <Card>
      <CardHeader title="Private documents" description="Stored privately. Links expire after 5 minutes and every opening is audited." />
      <div className="p-4">
        {t.canManageDocuments && (
          <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
            <Field label="Document name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="e.g. Signed loan agreement" />
            </Field>
            <Field label="Type">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                {Object.entries(DOC_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Button icon={Upload} loading={busy} onClick={() => input.current?.click()}>Upload</Button>
            <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={upload} />
          </div>
        )}
        {t.documents.length ? (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {t.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 p-3">
                <FileText aria-hidden="true" className="size-5 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{d.name}</p>
                  <p className="text-xs text-slate-500">{DOC_KINDS[d.kind]} · {formatDate(d.uploadedAt)}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => open(d)}>Open</Button>
                {t.canManageDocuments && <IconButton label={`Delete ${d.name}`} icon={Trash2} onClick={() => setRemove(d)} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">No documents yet. PDF, JPG or PNG.</p>
        )}
      </div>
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={doRemove} title="Delete document?" confirmLabel="Delete">
        The file is deleted permanently. The deletion is recorded in the transfer history.
      </ConfirmDialog>
    </Card>
  );
}

const HISTORY_LABELS = {
  created: 'Created as a draft',
  edited: 'Edited',
  submit: 'Submitted for approval',
  withdraw: 'Withdrawn to draft',
  approve: 'Approved',
  reject: 'Rejected',
  reopen: 'Reopened as a draft',
  start: 'Marked in progress',
  complete: 'Completed',
  cancel: 'Cancelled',
  player_linked: 'Linked to player record',
  player_updated: 'Player record updated',
  document_added: 'Document added',
  document_removed: 'Document deleted',
  announcement_drafted: 'News draft created',
};

function History({ history }) {
  return (
    <Card>
      <CardHeader title="History" />
      <ol className="divide-y divide-slate-100">
        {history.map((h) => (
          <li key={h.id} className="p-3 text-sm">
            <p className="font-medium text-slate-900">{HISTORY_LABELS[h.action] || h.action}</p>
            <p className="text-xs text-slate-500">
              {formatDateTime(h.at)}
              {h.by?.name ? ` · ${h.by.name}` : ''}
            </p>
            {h.note && <p className="mt-1 whitespace-pre-line text-slate-700">{h.note}</p>}
            {h.action === 'edited' && h.changes?.fields?.length > 0 && <p className="mt-1 text-xs text-slate-500">Changed: {h.changes.fields.join(', ')}</p>}
            {h.action === 'player_updated' && h.changes && (
              <p className="mt-1 text-xs text-slate-500">
                {Object.entries(h.changes).map(([k, c]) => `${k}: ${c.from ?? 'not set'} → ${c.to}`).join('; ')}
              </p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
