import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Check, ClipboardCheck, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useApi, qs } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { apiRequest } from '../../services/apiClient.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { AsyncContent, EmptyState, Alert } from '../../components/ui/Feedback.jsx';
import { StatusBadge, Badge } from '../../components/ui/Badge.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, Input, Select, Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatDate, formatDateTime } from '../../lib/format.js';
import { POSITIONS, STAFF_ROLE_LABELS } from '../../lib/labels.js';
import { useTeams } from './shared.jsx';
import { AccessEditor } from './StaffPages.jsx';
import { userMessage } from '../../lib/errors.js';

export default function ApplicationsPage() {
  useSeo({ title: 'Applications', noindex: true });
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || (can('applications.players.review') ? 'players' : 'staff');
  const status = params.get('status') || 'pending';
  const page = Number(params.get('page') || 1);
  const state = useApi(`/admin/applications/${tab}${qs({ status, page })}`);
  const navigate = useNavigate();

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const columns =
    tab === 'players'
      ? [
          { key: 'name', label: 'Applicant', render: (a) => <span className="font-medium">{a.firstName} {a.lastName}</span> },
          { key: 'position', label: 'Position' },
          { key: 'team', label: 'Team wanted', render: (a) => a.preferredTeam?.name || '–' },
          { key: 'minor', nowrap: true, label: 'Age group', render: (a) => (a.isMinor ? <Badge tone="warning">Under 18</Badge> : 'Adult') },
          { key: 'date', nowrap: true, label: 'Received', render: (a) => formatDate(a.createdAt) },
          { key: 'status', nowrap: true, label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
        ]
      : [
          { key: 'name', label: 'Applicant', render: (a) => <span className="font-medium">{a.fullName}</span> },
          { key: 'role', label: 'Role requested', render: (a) => a.requestedRoleLabel },
          { key: 'email', truncate: true, label: 'Email', render: (a) => a.user?.email },
          { key: 'date', nowrap: true, label: 'Received', render: (a) => formatDate(a.createdAt) },
          { key: 'status', nowrap: true, label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
        ];

  return (
    <>
      <PageHeader title="Applications" description="Review people who want to join the club as players or staff." />
      <Tabs
        label="Application type"
        value={tab}
        onChange={(v) => set('tab', v)}
        tabs={[...(can('applications.players.review') ? [{ value: 'players', label: 'Players' }] : []), ...(can('applications.staff.review') ? [{ value: 'staff', label: 'Staff' }] : [])]}
        className="mb-4"
      />
      <div className="mb-4 w-full max-w-xs">
        <Field label="Status">
          <Select value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="all">All</option>
          </Select>
        </Field>
      </div>
      <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={ClipboardCheck} title={status === 'pending' ? 'No applications waiting' : 'No applications'} />}>
        {(d) => (
          <>
            <DataTable columns={columns} rows={d.items} onRowClick={(a) => navigate(`/dashboard/applications/${tab}/${a.id}`)} caption="Applications" />
            <Pagination page={d.page} pages={d.pages} onChange={(p) => set('page', p)} className="mt-4" />
          </>
        )}
      </AsyncContent>
    </>
  );
}

function Row({ label, children }) {
  if (children === undefined || children === null || children === '') return null;
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="whitespace-pre-line text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export function ApplicationDetailPage() {
  const { kind, id } = useParams();
  useSeo({ title: 'Application', noindex: true });
  const state = useApi(`/admin/applications/${kind}/${id}`);
  const [dialog, setDialog] = useState(null);
  const a = state.data;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Applications', to: `/dashboard/applications?tab=${kind}` }, { label: a ? (kind === 'players' ? `${a.firstName} ${a.lastName}` : a.fullName) : '…' }]}
        title={a ? (kind === 'players' ? `${a.firstName} ${a.lastName}` : a.fullName) : 'Application'}
        description={a ? `${kind === 'players' ? 'Player' : 'Staff'} application received ${formatDateTime(a.createdAt)}` : ''}
        actions={
          a?.status === 'pending' && (
            <>
              <Button icon={Check} onClick={() => setDialog('approve')}>
                Approve
              </Button>
              <Button variant="danger-outline" icon={X} onClick={() => setDialog('reject')}>
                Reject
              </Button>
            </>
          )
        }
      />
      <AsyncContent state={state}>
        {(app) => (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card className="p-4">
              {kind === 'players' && app.isMinor && <Alert tone="warning" className="mb-3">This applicant is under 18. Guardian consent was recorded on {formatDateTime(app.guardian?.consentGivenAt)}.</Alert>}
              <dl className="divide-y divide-slate-100">
                <Row label="Account">{app.user ? `${app.user.name} <${app.user.email}>` : 'Deleted'}</Row>
                {kind === 'players' ? (
                  <>
                    <Row label="Date of birth">{app.dateOfBirth ? `${formatDate(app.dateOfBirth)} (age ${app.age})` : ''}</Row>
                    <Row label="Nationality">{app.nationality}</Row>
                    <Row label="Phone">{app.phone}</Row>
                    <Row label="Address">{app.address}</Row>
                    <Row label="Position">{app.position}</Row>
                    <Row label="Preferred foot">{app.preferredFoot}</Row>
                    <Row label="Team wanted">{app.preferredTeam?.name || 'Club to decide'}</Row>
                    <Row label="Previous clubs">{app.previousClubs}</Row>
                    <Row label="Experience">{app.experience}</Row>
                    <Row label="Statement">{app.statement}</Row>
                    <Row label="Emergency contact">{[app.emergencyContact?.name, app.emergencyContact?.relationship, app.emergencyContact?.phone].filter(Boolean).join(' · ')}</Row>
                    {app.isMinor && <Row label="Guardian">{[app.guardian?.name, app.guardian?.relationship, app.guardian?.phone, app.guardian?.email].filter(Boolean).join(' · ')}</Row>}
                  </>
                ) : (
                  <>
                    <Row label="Role requested">{app.requestedRoleLabel}</Row>
                    <Row label="Phone">{app.phone}</Row>
                    <Row label="Team">{app.preferredTeam?.name}</Row>
                    <Row label="Experience">{app.experience}</Row>
                    <Row label="Qualifications">{app.qualifications}</Row>
                    <Row label="Statement">{app.statement}</Row>
                  </>
                )}
              </dl>
            </Card>
            <Card className="h-fit p-4">
              <h2 className="font-semibold">Decision</h2>
              <p className="mt-2">
                <StatusBadge status={app.status} />
              </p>
              {app.reviewedAt && (
                <p className="mt-2 text-sm text-slate-600">
                  {app.reviewedBy?.name ? `By ${app.reviewedBy.name} on ` : ''}
                  {formatDateTime(app.reviewedAt)}
                </p>
              )}
              {app.reviewNote && <p className="mt-2 rounded bg-slate-50 p-2 text-sm">{app.reviewNote}</p>}
              {app.player && (
                <Link to={`/dashboard/players/${app.player}`} className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 underline">
                  Open player record
                </Link>
              )}
            </Card>
          </div>
        )}
      </AsyncContent>
      {a && dialog === 'approve' && (kind === 'players' ? <ApprovePlayer app={a} onClose={() => setDialog(null)} onDone={state.reload} /> : <ApproveStaff app={a} onClose={() => setDialog(null)} onDone={state.reload} />)}
      {a && dialog === 'reject' && <Reject kind={kind} app={a} onClose={() => setDialog(null)} onDone={state.reload} />}
    </>
  );
}

function ApprovePlayer({ app, onClose, onDone }) {
  const teams = useTeams({ clubOnly: true });
  const { notify } = useToast();
  const unlinked = useApi('/admin/players?limit=100');
  const form = useForm({ team: app.preferredTeam?.id || '', position: app.position, jerseyNumber: '', linkPlayer: '', showOnWebsite: true, note: '' });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    await apiRequest(`/admin/applications/players/${app.id}/approve`, {
      method: 'POST',
      body: { ...values, team: values.team || null, jerseyNumber: values.jerseyNumber ? Number(values.jerseyNumber) : null, linkPlayer: values.linkPlayer || null },
    });
    notify('Application approved. The player profile is ready.');
    onClose();
    onDone();
  });
  return (
    <Modal open onClose={onClose} title="Approve player application" size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Approve</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError error={form.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team" error={e.team}>
            <Select value={v.team} onChange={set('team')}>
              <option value="">No team yet</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Position" error={e.position}>
            <Select value={v.position} onChange={set('position')}>
              {POSITIONS.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Shirt number" error={e.jerseyNumber}>
            <Input type="number" min={1} max={99} value={v.jerseyNumber} onChange={set('jerseyNumber')} />
          </Field>
          <Field label="Link to an existing player record (optional)" error={e.linkPlayer} hint="Use this if the club already created this player's profile.">
            <Select value={v.linkPlayer} onChange={set('linkPlayer')}>
              <option value="">Create a new player profile</option>
              {(unlinked.data?.items || []).filter((p) => !p.hasAccount).map((p) => (
                <option key={p.id} value={p.id}>{p.fullName}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Checkbox checked={v.showOnWebsite} onChange={set('showOnWebsite')} label="Show a public profile on the website" hint={app.isMinor ? 'For under-18s only the first name and surname initial are shown, with no private details.' : 'Only public football information is ever shown.'} />
        <Field label="Message to the applicant (optional)" error={e.note}>
          <Textarea value={v.note} onChange={set('note')} rows={3} maxLength={2000} />
        </Field>
      </form>
    </Modal>
  );
}

function ApproveStaff({ app, onClose, onDone }) {
  const { notify } = useToast();
  const [access, setAccess] = useState({ staffRole: app.requestedRole, grants: null, assignedTeams: [], assignedPlayers: [] });
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/applications/staff/${app.id}/approve`, {
        method: 'POST',
        body: { staffRole: access.staffRole, grants: access.grants ?? undefined, assignedTeams: access.assignedTeams, assignedPlayers: access.assignedPlayers, note },
      });
      notify(`Approved as ${STAFF_ROLE_LABELS[access.staffRole]}.`);
      onClose();
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Approve staff application" description="Choose the role, what they can access, and which teams or players they are responsible for." size="xl" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Approve</Button></>}>
      <FormError error={error} />
      <AccessEditor value={access} onChange={setAccess} />
      <Field label="Message to the applicant (optional)" className="mt-4">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />
      </Field>
    </Modal>
  );
}

function Reject({ kind, app, onClose, onDone }) {
  const { notify } = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await apiRequest(`/admin/applications/${kind}/${app.id}/reject`, { method: 'POST', body: { note } });
      notify('Application rejected. The applicant has been told.');
      onClose();
      onDone();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Reject application" size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={submit} loading={busy}>Reject</Button></>}>
      <Field label="Message to the applicant (optional)" hint="Be kind and brief. This is shown to the applicant.">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
      </Field>
    </Modal>
  );
}
