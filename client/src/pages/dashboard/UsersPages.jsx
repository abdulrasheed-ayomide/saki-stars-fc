import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Ban, LogOut, RotateCcw, Trash2, UserX, Users } from 'lucide-react';
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
import { Field, Input, Select } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatDate, formatDateTime, timeAgo } from '../../lib/format.js';
import { USER_STATUS_LABELS } from '../../lib/labels.js';
import { FilterBar } from './shared.jsx';

export function UsersListPage() {
  useSeo({ title: 'Users', noindex: true });
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const debounced = useDebounce(q, 300);
  const status = params.get('status') || '';
  const role = params.get('role') || '';
  const deletionRequested = params.get('deletionRequested') || '';
  const page = Number(params.get('page') || 1);
  const state = useApi(`/admin/users${qs({ q: debounced, status, role, deletionRequested, page })}`);
  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  return (
    <>
      <PageHeader title="Users" description="Every website account. Passwords and sign-in secrets are never shown." />
      <FilterBar>
        <Field label="Search">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All</option>
            {Object.entries(USER_STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={role} onChange={(e) => set('role', e.target.value)}>
            <option value="">All</option>
            <option value="user">Supporters</option>
            <option value="player">Players</option>
            <option value="staff">Staff</option>
          </Select>
        </Field>
        <Field label="Deletion requests">
          <Select value={deletionRequested} onChange={(e) => set('deletionRequested', e.target.value)}>
            <option value="">Any</option>
            <option value="true">Only deletion requests</option>
          </Select>
        </Field>
      </FilterBar>
      <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Users} title="No users match" />}>
        {(d) => (
          <>
            <p className="mb-2 text-sm text-slate-600">{d.total} account{d.total === 1 ? '' : 's'}</p>
            <DataTable
              caption="Users"
              rows={d.items}
              onRowClick={(u) => navigate(`/dashboard/users/${u.id}`)}
              columns={[
                { key: 'name', label: 'Name', render: (u) => <span className="font-medium">{u.name}</span> },
                { key: 'email', label: 'Email' },
                { key: 'role', label: 'Type', render: (u) => ({ user: 'Supporter', player: 'Player', staff: 'Staff' })[u.role] },
                { key: 'status', label: 'Status', render: (u) => <><StatusBadge status={u.status} label={USER_STATUS_LABELS[u.status]} /> {u.deletionRequestedAt && <Badge tone="danger">Deletion requested</Badge>}</> },
                { key: 'last', label: 'Last sign-in', render: (u) => (u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never') },
                { key: 'created', label: 'Joined', render: (u) => formatDate(u.createdAt) },
              ]}
            />
            <Pagination page={d.page} pages={d.pages} onChange={(p) => set('page', p)} className="mt-4" />
          </>
        )}
      </AsyncContent>
    </>
  );
}

const ACTIONS = {
  suspend: { title: 'Suspend account', label: 'Suspend', needsReason: true, text: 'The person is signed out everywhere and cannot sign in until the account is reactivated.' },
  reactivate: { title: 'Reactivate account', label: 'Reactivate', needsReason: false, text: 'The person will be able to sign in again.' },
  deactivate: { title: 'Deactivate account', label: 'Deactivate', needsReason: true, text: 'Use this when someone leaves or asks to close their account. Their data stays until it is deleted.' },
  'revoke-sessions': { title: 'Sign out everywhere', label: 'Sign out', needsReason: false, text: 'Ends every active session for this account. They can sign in again.' },
  anonymize: { title: 'Delete personal data', label: 'Delete permanently', needsReason: true, danger: true, text: 'Permanently removes the login and personal information. Club football history (appearances, goals) is kept without personal details. This cannot be undone.' },
};

export function UserDetailPage() {
  const { id } = useParams();
  useSeo({ title: 'User', noindex: true });
  const { can, user: me } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const state = useApi(`/admin/users/${id}`);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const u = state.data;
  const self = u?.id === me.id;

  async function run() {
    setBusy(true);
    try {
      const body = action === 'anonymize' ? { reason, confirm } : reason ? { reason } : {};
      await apiRequest(`/admin/users/${id}/${action}`, { method: 'POST', body });
      notify('Done. This action was recorded in the audit log.');
      setAction(null);
      setReason('');
      setConfirm('');
      if (action === 'anonymize') navigate('/dashboard/users');
      else state.reload();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const def = action ? ACTIONS[action] : null;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Users', to: '/dashboard/users' }, { label: u?.name || '…' }]}
        title={u?.name || 'User'}
        description={u?.email}
        actions={
          u &&
          can('users.manage') &&
          !self && (
            <>
              {u.status === 'active' || u.status === 'pending' ? (
                <Button variant="outline" icon={Ban} onClick={() => setAction('suspend')}>Suspend</Button>
              ) : (
                <Button variant="outline" icon={RotateCcw} onClick={() => setAction('reactivate')}>Reactivate</Button>
              )}
              <Button variant="outline" icon={LogOut} onClick={() => setAction('revoke-sessions')}>Sign out everywhere</Button>
              {u.status !== 'deactivated' && <Button variant="outline" icon={UserX} onClick={() => setAction('deactivate')}>Deactivate</Button>}
              <Button variant="danger-outline" icon={Trash2} onClick={() => setAction('anonymize')}>Delete personal data</Button>
            </>
          )
        }
      />
      <AsyncContent state={state}>
        {(user) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              {user.deletionRequestedAt && <Alert tone="warning" className="mb-3">This person asked for their account to be deleted on {formatDate(user.deletionRequestedAt)}.</Alert>}
              <dl className="grid gap-2 text-sm">
                {[
                  ['Status', <StatusBadge key="s" status={user.status} label={USER_STATUS_LABELS[user.status]} />],
                  ['Email confirmed', user.emailVerified ? 'Yes' : 'No'],
                  ['Type', ({ user: 'Supporter', player: 'Player', staff: 'Staff' })[user.role]],
                  ['Staff role', user.staff ? `${user.staff.title || user.staff.role} (${user.staff.status})` : '–'],
                  ['Joined', formatDateTime(user.createdAt)],
                  ['Last sign-in', user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'],
                  ['Status reason', user.statusReason || '–'],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-wrap justify-between gap-2">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {user.player && can('players.view', 'players.edit') && <Link to={`/dashboard/players/${user.player}`} className="font-semibold text-brand-700 underline">Player record</Link>}
                {user.staff && can('staff.view', 'staff.manage') && <Link to={`/dashboard/staff/${user.staff.id}`} className="font-semibold text-brand-700 underline">Staff record</Link>}
              </div>
            </Card>
            <Card>
              <CardHeader title="Active sessions" description="Devices currently signed in." />
              <ul className="divide-y divide-slate-100 text-sm">
                {user.sessions.length ? (
                  user.sessions.map((s) => (
                    <li key={s.id} className="px-4 py-2">
                      <p className="truncate">{s.userAgent || 'Unknown device'}</p>
                      <p className="text-xs text-slate-500">Last active {timeAgo(s.lastUsedAt)} · IP {s.ip || 'unknown'}</p>
                    </li>
                  ))
                ) : (
                  <li className="px-4 py-3 text-slate-600">No active sessions.</li>
                )}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Applications" />
              <ul className="divide-y divide-slate-100 text-sm">
                {user.applications.length ? (
                  user.applications.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2">
                      <Link to={`/dashboard/applications/${a.kind === 'player' ? 'players' : 'staff'}/${a.id}`} className="underline">
                        {a.kind === 'player' ? 'Player' : `Staff (${a.role})`} · {formatDate(a.createdAt)}
                      </Link>
                      <StatusBadge status={a.status} />
                    </li>
                  ))
                ) : (
                  <li className="px-4 py-3 text-slate-600">None.</li>
                )}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Recent activity" />
              <ul className="divide-y divide-slate-100 text-sm">
                {user.recentActivity.length ? (
                  user.recentActivity.map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 px-4 py-2">
                      <span>{a.action}</span>
                      <span className="text-xs text-slate-500">{timeAgo(a.at)}</span>
                    </li>
                  ))
                ) : (
                  <li className="px-4 py-3 text-slate-600">No recorded activity.</li>
                )}
              </ul>
            </Card>
          </div>
        )}
      </AsyncContent>
      <Modal
        open={Boolean(def)}
        onClose={() => setAction(null)}
        title={def?.title || ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button variant={def?.danger || action === 'suspend' || action === 'deactivate' ? 'danger' : 'primary'} onClick={run} loading={busy} disabled={(def?.needsReason && reason.trim().length < 5) || (action === 'anonymize' && confirm !== 'DELETE')}>
              {def?.label}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">{def?.text}</p>
        {def?.needsReason && (
          <Field label="Reason (recorded in the audit log)" className="mt-3" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
        )}
        {action === 'anonymize' && (
          <Field label='Type DELETE to confirm' className="mt-3" required>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </Field>
        )}
      </Modal>
    </>
  );
}
