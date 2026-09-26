import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Ban, Plus, RotateCcw, Trash2, UserCog, UserMinus, UserPlus } from 'lucide-react';
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
import { Button } from '../../components/ui/Button.jsx';
import { Field, Input, Select, Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { Modal, ConfirmDialog } from '../../components/ui/Modal.jsx';
import { MediaUpload } from '../../components/ui/ImageUpload.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { STAFF_ROLE_LABELS, SCOPE_LABELS } from '../../lib/labels.js';
import { toDateInput } from '../../lib/format.js';
import { FilterBar, useTeams } from './shared.jsx';
import { userMessage } from '../../lib/errors.js';

/**
 * Role + permissions + scope editor. The recommended permissions for each role are
 * filled in automatically; the Director can then adjust them. The server refuses any
 * permission the editor is not allowed to grant.
 */
export function AccessEditor({ value, onChange, disabled = false }) {
  const catalogue = useApi('/admin/staff/permissions');
  const { isDirector, scopeOf } = useAuth();
  const teams = useTeams({ clubOnly: true });
  const [playerQuery, setPlayerQuery] = useState('');
  const q = useDebounce(playerQuery, 300);
  const players = useApi(`/admin/players${qs({ q: q.length >= 2 ? q : '', limit: 50 })}`);
  const cat = catalogue.data;

  const roleDefaults = useMemo(() => {
    const map = {};
    for (const r of cat?.roles || []) map[r.key] = r.defaultGrants;
    return map;
  }, [cat]);

  // Fill in the recommended permissions the first time a role is shown.
  useEffect(() => {
    if (cat && value.grants === null && value.staffRole !== 'director') {
      onChange({ ...value, grants: roleDefaults[value.staffRole] || [] });
    }
  }, [cat, value, roleDefaults, onChange]);

  if (catalogue.error) return <Alert tone="error">{userMessage(catalogue.error, 'dashboard')}</Alert>;
  if (!cat) return <p className="text-sm text-slate-600">Loading permissions…</p>;

  const grants = value.grants || [];
  const grantMap = new Map(grants.map((g) => [g.permission, g.scope]));
  const groups = [...new Set(cat.permissions.map((p) => p.group))];
  const setGrant = (permission, scope) => {
    const next = grants.filter((g) => g.permission !== permission);
    if (scope) next.push({ permission, scope });
    onChange({ ...value, grants: next });
  };
  const needsTeams = grants.some((g) => g.scope === 'assigned_teams');
  const needsPlayers = grants.some((g) => g.scope === 'assigned_players');
  const selectedPlayers = new Set(value.assignedPlayers);

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <Field label="Role">
        <Select value={value.staffRole} onChange={(e) => onChange({ ...value, staffRole: e.target.value, grants: e.target.value === 'director' ? [] : roleDefaults[e.target.value] || [] })}>
          {cat.roles
            .filter((r) => r.key !== 'director' || isDirector)
            .map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
        </Select>
      </Field>

      {value.staffRole === 'director' ? (
        <Alert tone="warning" title="Club Director">
          Directors hold every permission for the whole club, including managing other staff. Only appoint people who run the club.
        </Alert>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-800">Permissions</p>
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => onChange({ ...value, grants: roleDefaults[value.staffRole] || [] })}>
              Use recommended for {STAFF_ROLE_LABELS[value.staffRole]}
            </Button>
          </div>
          <div className="mt-2 max-h-[45vh] space-y-3 overflow-y-auto rounded-md border border-slate-200 p-3">
            {groups.map((group) => (
              <div key={group}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</p>
                <ul className="mt-1 space-y-1">
                  {cat.permissions
                    .filter((p) => p.group === group)
                    .map((p) => {
                      const current = grantMap.get(p.key) || '';
                      const allowedToGrant = isDirector || Boolean(scopeOf(p.key));
                      return (
                        <li key={p.key} className="grid items-center gap-1 sm:grid-cols-[1fr_13rem]">
                          <span className={`text-sm ${allowedToGrant ? 'text-slate-800' : 'text-slate-400'}`}>{p.label}</span>
                          <select
                            aria-label={p.label}
                            value={current}
                            disabled={!allowedToGrant}
                            onChange={(e) => setGrant(p.key, e.target.value)}
                            className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm disabled:bg-slate-100"
                          >
                            <option value="">No access</option>
                            {p.scopes.map((s) => (
                              <option key={s} value={s}>
                                {SCOPE_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {(needsTeams || value.assignedTeams.length > 0) && value.staffRole !== 'director' && (
        <div>
          <p className="text-sm font-medium text-slate-800">Assigned teams</p>
          <p className="text-xs text-slate-500">Permissions set to “Assigned teams only” apply to these teams.</p>
          <ul className="mt-2 grid gap-1 xs:grid-cols-2">
            {teams.map((t) => (
              <li key={t.id}>
                <Checkbox
                  label={t.name}
                  checked={value.assignedTeams.includes(t.id)}
                  onChange={(e) => onChange({ ...value, assignedTeams: e.target.checked ? [...value.assignedTeams, t.id] : value.assignedTeams.filter((x) => x !== t.id) })}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {(needsPlayers || value.assignedPlayers.length > 0) && value.staffRole !== 'director' && (
        <div>
          <p className="text-sm font-medium text-slate-800">Assigned players ({value.assignedPlayers.length})</p>
          <Input type="search" className="mt-1" placeholder="Search players to add" value={playerQuery} onChange={(e) => setPlayerQuery(e.target.value)} aria-label="Search players" />
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {(players.data?.items || []).map((p) => (
              <li key={p.id}>
                <Checkbox
                  label={`${p.fullName}${p.team ? ` (${p.team.name})` : ''}`}
                  checked={selectedPlayers.has(p.id)}
                  onChange={(e) => onChange({ ...value, assignedPlayers: e.target.checked ? [...value.assignedPlayers, p.id] : value.assignedPlayers.filter((x) => x !== p.id) })}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  );
}

export function StaffListPage() {
  useSeo({ title: 'Staff', noindex: true });
  const { can } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ q: '', role: '', status: '' });
  const q = useDebounce(filters.q, 300);
  const state = useApi(`/admin/staff${qs({ ...filters, q })}`);
  const [dialog, setDialog] = useState(null);

  return (
    <>
      <PageHeader
        title="Staff"
        description="Staff accounts, roles, permissions and public profiles."
        actions={
          <>
            {can('staff.manage') && (
              <Button icon={UserPlus} onClick={() => setDialog('appoint')}>
                Appoint staff member
              </Button>
            )}
            {can('staff.profiles.manage') && (
              <Button variant="outline" icon={Plus} onClick={() => setDialog('profile')}>
                Add public profile
              </Button>
            )}
          </>
        }
      />
      <FilterBar>
        <Field label="Search">
          <Input type="search" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Name" />
        </Field>
        <Field label="Role">
          <Select value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}>
            <option value="">All roles</option>
            {Object.entries(STAFF_ROLE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="removed">Removed</option>
          </Select>
        </Field>
      </FilterBar>
      <AsyncContent state={state} isEmpty={(d) => !d.length} empty={<EmptyState icon={UserCog} title="No staff found" />}>
        {(list) => (
          <DataTable
            caption="Staff"
            rows={list}
            onRowClick={(s) => navigate(`/dashboard/staff/${s.id}`)}
            columns={[
              { key: 'name', label: 'Name', render: (s) => <span className="font-medium">{s.fullName}</span> },
              { key: 'role', label: 'Role', render: (s) => s.roleLabel },
              { key: 'title', label: 'Title', render: (s) => s.title },
              { key: 'login', nowrap: true, label: 'Login', render: (s) => (s.user ? s.user.email || 'Yes' : <Badge>Profile only</Badge>) },
              { key: 'web', nowrap: true, label: 'On website', render: (s) => (s.showOnWebsite ? 'Yes' : 'No') },
              { key: 'status', nowrap: true, label: 'Status', render: (s) => <StatusBadge status={s.status} /> },
            ]}
          />
        )}
      </AsyncContent>
      {dialog === 'appoint' && <AppointDialog onClose={() => setDialog(null)} onDone={(s) => navigate(`/dashboard/staff/${s.id}`)} />}
      {dialog === 'profile' && <ProfileDialog onClose={() => setDialog(null)} onDone={(s) => navigate(`/dashboard/staff/${s.id}`)} />}
    </>
  );
}

function AppointDialog({ onClose, onDone }) {
  const { notify } = useToast();
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState({ staffRole: 'team_manager', grants: null, assignedTeams: [], assignedPlayers: [] });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const s = await apiRequest('/admin/staff/appoint', { method: 'POST', body: { email, ...access, grants: access.grants ?? undefined } });
      notify(`${s.fullName} is now ${STAFF_ROLE_LABELS[access.staffRole]}.`);
      onDone(s);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Appoint a staff member" description="The person must already have a website account with a confirmed email address." size="xl" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!email}>Appoint</Button></>}>
      <FormError error={error} />
      <Field label="Their account email" required error={error?.details?.find?.((d) => d.path === 'email')?.message} className="mb-4">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <AccessEditor value={access} onChange={setAccess} />
    </Modal>
  );
}

const CATEGORIES = [
  ['management', 'Management'],
  ['coaching', 'Coaching'],
  ['operations', 'Operations'],
  ['medical', 'Medical'],
  ['other', 'Other'],
];

function ProfileFields({ form }) {
  const teams = useTeams({ clubOnly: true });
  const { values: v, set, errors: e } = form;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={e.fullName}>
          <Input value={v.fullName} onChange={set('fullName')} maxLength={120} />
        </Field>
        <Field label="Official title" error={e.title} hint="e.g. Head Coach, Club Director">
          <Input value={v.title} onChange={set('title')} maxLength={120} />
        </Field>
        <Field label="Group on the website" error={e.category}>
          <Select value={v.category} onChange={set('category')}>
            {CATEGORIES.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Department" error={e.department}>
          <Input value={v.department} onChange={set('department')} maxLength={120} />
        </Field>
        <Field label="Team" error={e.team}>
          <Select value={v.team || ''} onChange={set('team')}>
            <option value="">None</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date joined" error={e.dateJoined}>
          <Input type="date" value={v.dateJoined || ''} onChange={set('dateJoined')} />
        </Field>
      </div>
      <MediaUpload label="Photo" folder="staff" value={v.photo} onChange={set('photo')} aspect="aspect-square" />
      <Field label="Biography" error={e.bio}>
        <Textarea value={v.bio} onChange={set('bio')} rows={4} maxLength={3000} />
      </Field>
      <Field label="Professional background" error={e.background}>
        <Textarea value={v.background} onChange={set('background')} rows={3} maxLength={3000} />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Checkbox checked={v.showOnWebsite} onChange={set('showOnWebsite')} label="Show on the public website" />
        <Checkbox checked={v.showDateJoined} onChange={set('showDateJoined')} label="Show date joined publicly" />
      </div>
      <Field label="Display order" hint="Lower numbers appear first." error={e.displayOrder}>
        <Input type="number" min={0} max={1000} value={v.displayOrder} onChange={set('displayOrder')} className="max-w-32" />
      </Field>
      <fieldset className="rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold">Private (never shown publicly)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Private phone" error={e.privatePhone}>
            <Input value={v.privatePhone} onChange={set('privatePhone')} maxLength={40} />
          </Field>
          <Field label="Internal notes" error={e.internalNotes}>
            <Textarea value={v.internalNotes} onChange={set('internalNotes')} rows={2} maxLength={3000} />
          </Field>
        </div>
      </fieldset>
    </div>
  );
}

function profileBody(v) {
  return {
    ...v,
    team: v.team || null,
    dateJoined: v.dateJoined || null,
    displayOrder: Number(v.displayOrder) || 100,
    photo: v.photo || null,
  };
}

const EMPTY_PROFILE = { fullName: '', title: '', department: '', category: 'coaching', team: '', bio: '', background: '', photo: null, dateJoined: '', showDateJoined: false, showOnWebsite: true, displayOrder: 100, privatePhone: '', internalNotes: '' };

function ProfileDialog({ onClose, onDone }) {
  const { notify } = useToast();
  const form = useForm(EMPTY_PROFILE);
  const onSubmit = form.submit(async (v) => {
    const s = await apiRequest('/admin/staff', { method: 'POST', body: profileBody(v) });
    notify('Profile created.');
    onDone(s);
  });
  return (
    <Modal open onClose={onClose} title="Add a public staff profile" description="For people shown on the website who do not need a login, such as coaches." size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Create profile</Button></>}>
      <FormError error={form.formError} />
      <ProfileFields form={form} />
    </Modal>
  );
}

export function StaffDetailPage() {
  const { id } = useParams();
  useSeo({ title: 'Staff member', noindex: true });
  const { can, user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const state = useApi(`/admin/staff/${id}`);
  const s = state.data;
  const [statusDialog, setStatusDialog] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const isSelf = s?.user?.id === user.id;

  async function changeStatus() {
    setBusy(true);
    try {
      if (statusDialog === 'delete') {
        await apiRequest(`/admin/staff/${id}`, { method: 'DELETE' });
        notify('Profile deleted.');
        navigate('/dashboard/staff');
        return;
      }
      await apiRequest(`/admin/staff/${id}/${statusDialog}`, { method: 'POST', body: reason ? { reason } : {} });
      notify('Staff status updated.');
      state.reload();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setBusy(false);
      setStatusDialog(null);
      setReason('');
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Staff', to: '/dashboard/staff' }, { label: s?.fullName || '…' }]}
        title={s?.fullName || 'Staff member'}
        description={s ? `${s.roleLabel}${s.user?.email ? ` · ${s.user.email}` : ' · public profile without login'}` : ''}
        actions={
          s &&
          can('staff.manage') &&
          s.user &&
          !isSelf && (
            <>
              {s.status === 'active' && (
                <Button variant="outline" icon={Ban} onClick={() => setStatusDialog('suspend')}>
                  Suspend
                </Button>
              )}
              {s.status !== 'active' && (
                <Button variant="outline" icon={RotateCcw} onClick={() => setStatusDialog('reactivate')}>
                  Reactivate
                </Button>
              )}
              {s.status !== 'removed' && (
                <Button variant="danger-outline" icon={UserMinus} onClick={() => setStatusDialog('remove')}>
                  Remove staff access
                </Button>
              )}
            </>
          )
        }
      />
      <AsyncContent state={state}>
        {(staff) => (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={staff.status} />
              {staff.showOnWebsite && <Badge tone="brand">On website</Badge>}
              {isSelf && <Badge tone="warning">This is you: you cannot change your own access</Badge>}
            </div>
            {staff.user && (can('staff.manage') ? <AccessCard staff={staff} disabled={isSelf} onSaved={state.reload} /> : <ReadOnlyAccess staff={staff} />)}
            {can('staff.profiles.manage') ? <ProfileCard staff={staff} onSaved={state.reload} /> : null}
            {can('staff.profiles.manage') && !staff.user && (
              <Button variant="danger-outline" icon={Trash2} onClick={() => setStatusDialog('delete')}>
                Delete this profile
              </Button>
            )}
          </div>
        )}
      </AsyncContent>
      <ConfirmDialog
        open={Boolean(statusDialog)}
        onClose={() => setStatusDialog(null)}
        onConfirm={changeStatus}
        loading={busy}
        tone={statusDialog === 'reactivate' ? 'primary' : 'danger'}
        title={{ suspend: 'Suspend staff access?', reactivate: 'Restore staff access?', remove: 'Remove staff access?', delete: 'Delete profile?' }[statusDialog] || ''}
        confirmLabel={{ suspend: 'Suspend', reactivate: 'Restore', remove: 'Remove access', delete: 'Delete' }[statusDialog]}
      >
        {statusDialog === 'delete' ? (
          <p>This public profile will be removed from the website.</p>
        ) : (
          <>
            <p className="mb-3">
              {statusDialog === 'suspend' && 'They will be signed out immediately and lose all staff access until restored.'}
              {statusDialog === 'remove' && 'They keep a normal website account, but lose every staff permission. Their past work stays in club records.'}
              {statusDialog === 'reactivate' && 'Their previous role and permissions will apply again.'}
            </p>
            <Field label={statusDialog === 'reactivate' ? 'Note (optional)' : 'Reason'} required={statusDialog !== 'reactivate'}>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </Field>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}

function ReadOnlyAccess({ staff }) {
  return (
    <Card>
      <CardHeader title="Role and permissions" />
      <ul className="grid gap-1 p-4 text-sm sm:grid-cols-2">
        {staff.role === 'director' ? <li>All permissions (Club Director)</li> : staff.grants.map((g) => <li key={g.permission}>{g.permission} · {SCOPE_LABELS[g.scope]}</li>)}
      </ul>
    </Card>
  );
}

function AccessCard({ staff, disabled, onSaved }) {
  const { notify } = useToast();
  const [value, setValue] = useState({
    staffRole: staff.role,
    grants: staff.grants,
    assignedTeams: staff.assignedTeams.map((t) => t.id),
    assignedPlayers: staff.assignedPlayers.map((p) => p.id),
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/staff/${staff.id}/access`, { method: 'PUT', body: { ...value, grants: value.grants ?? undefined } });
      notify('Access updated. It takes effect immediately.');
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader title="Role, permissions and scope" description="Changes take effect on their next action. Every change is recorded in the audit log." />
      <div className="p-4">
        <FormError error={error} />
        <AccessEditor value={value} onChange={setValue} disabled={disabled || staff.status === 'removed'} />
        {staff.assignedPlayers.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Currently assigned players: {staff.assignedPlayers.map((p) => p.name).filter(Boolean).join(', ') || staff.assignedPlayers.length}
          </p>
        )}
        {!disabled && staff.status !== 'removed' && (
          <Button className="mt-4" onClick={save} loading={busy}>
            Save access
          </Button>
        )}
      </div>
    </Card>
  );
}

function ProfileCard({ staff, onSaved }) {
  const { notify } = useToast();
  const form = useForm({
    fullName: staff.fullName,
    title: staff.title,
    department: staff.department,
    category: staff.category,
    team: staff.team?.id || '',
    bio: staff.bio,
    background: staff.background,
    photo: staff.photo,
    dateJoined: toDateInput(staff.dateJoined),
    showDateJoined: staff.showDateJoined,
    showOnWebsite: staff.showOnWebsite,
    displayOrder: staff.displayOrder,
    privatePhone: staff.privatePhone,
    internalNotes: staff.internalNotes,
  });
  const onSubmit = form.submit(async (v) => {
    await apiRequest(`/admin/staff/${staff.id}/profile`, { method: 'PUT', body: profileBody(v) });
    notify('Profile saved.');
    onSaved();
  });
  return (
    <Card>
      <CardHeader title="Profile" description="Only name, title, department, team, biography, background, photo and (optionally) date joined are ever shown publicly." />
      <form onSubmit={onSubmit} className="p-4" noValidate>
        <FormError error={form.formError} />
        <ProfileFields form={form} />
        <Button type="submit" className="mt-4" loading={form.submitting}>
          Save profile
        </Button>
      </form>
    </Card>
  );
}

