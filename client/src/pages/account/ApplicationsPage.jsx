import { useState } from 'react';
import { ClipboardList, Shirt, Briefcase } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { useApi } from '../../hooks/useApi.js';
import { apiRequest } from '../../services/apiClient.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Field, Input, Select, Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Alert, AsyncContent, EmptyState } from '../../components/ui/Feedback.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { Modal, ConfirmDialog } from '../../components/ui/Modal.jsx';
import { formatDate } from '../../lib/format.js';
import { POSITIONS, APPLY_ROLES, STAFF_ROLE_LABELS } from '../../lib/labels.js';

function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return age;
}

function PlayerApplicationForm({ onDone }) {
  const teams = useApi('/teams');
  const { user } = useAuth();
  const [first, ...rest] = user.name.split(' ');
  const form = useForm({
    firstName: first || '',
    lastName: rest.join(' '),
    dateOfBirth: '',
    nationality: 'Nigeria',
    phone: '',
    address: '',
    position: '',
    preferredFoot: '',
    preferredTeam: '',
    previousClubs: '',
    experience: '',
    statement: '',
    emergencyContact: { name: '', relationship: '', phone: '' },
    guardian: { name: '', relationship: '', phone: '', email: '', consent: false },
  });
  const { values: v, set, errors: e } = form;
  const minor = ageFrom(v.dateOfBirth) !== null && ageFrom(v.dateOfBirth) < 18;

  const onSubmit = form.submit(async (values) => {
    const body = { ...values, preferredTeam: values.preferredTeam || null };
    if (!minor) delete body.guardian;
    await apiRequest('/account/applications/player', { method: 'POST', body });
    onDone('Your player application has been sent to the club.');
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormError error={form.formError} />
      <p className="text-sm text-slate-600">Your personal details are private. They are only seen by authorised club staff and are never shown on the public website.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required error={e.firstName}>
          <Input value={v.firstName} onChange={set('firstName')} maxLength={60} />
        </Field>
        <Field label="Last name" required error={e.lastName}>
          <Input value={v.lastName} onChange={set('lastName')} maxLength={60} />
        </Field>
        <Field label="Date of birth" required error={e.dateOfBirth}>
          <Input type="date" value={v.dateOfBirth} onChange={set('dateOfBirth')} max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <Field label="Nationality" error={e.nationality}>
          <Input value={v.nationality} onChange={set('nationality')} maxLength={60} />
        </Field>
        <Field label="Phone number" required error={e.phone}>
          <Input type="tel" value={v.phone} onChange={set('phone')} autoComplete="tel" maxLength={40} />
        </Field>
        <Field label="Home address" error={e.address}>
          <Input value={v.address} onChange={set('address')} autoComplete="street-address" maxLength={400} />
        </Field>
        <Field label="Position" required error={e.position}>
          <Select value={v.position} onChange={set('position')}>
            <option value="">Choose…</option>
            {POSITIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Preferred foot" error={e.preferredFoot}>
          <Select value={v.preferredFoot} onChange={set('preferredFoot')}>
            <option value="">Not specified</option>
            <option value="right">Right</option>
            <option value="left">Left</option>
            <option value="both">Both</option>
          </Select>
        </Field>
        <Field label="Team you are applying for" error={e.preferredTeam} className="sm:col-span-2">
          <Select value={v.preferredTeam} onChange={set('preferredTeam')}>
            <option value="">Let the club decide</option>
            {(teams.data || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.ageGroup ? ` (${t.ageGroup})` : ''}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Previous clubs" error={e.previousClubs}>
        <Textarea value={v.previousClubs} onChange={set('previousClubs')} rows={2} maxLength={1000} />
      </Field>
      <Field label="Football experience" error={e.experience}>
        <Textarea value={v.experience} onChange={set('experience')} rows={3} maxLength={2000} />
      </Field>
      <Field label="Why do you want to join?" error={e.statement}>
        <Textarea value={v.statement} onChange={set('statement')} rows={3} maxLength={2000} />
      </Field>
      <fieldset className="rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold">Emergency contact</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name" error={e['emergencyContact.name']}>
            <Input value={v.emergencyContact.name} onChange={set('emergencyContact.name')} maxLength={120} />
          </Field>
          <Field label="Relationship" error={e['emergencyContact.relationship']}>
            <Input value={v.emergencyContact.relationship} onChange={set('emergencyContact.relationship')} maxLength={60} />
          </Field>
          <Field label="Phone" error={e['emergencyContact.phone']}>
            <Input type="tel" value={v.emergencyContact.phone} onChange={set('emergencyContact.phone')} maxLength={40} />
          </Field>
        </div>
      </fieldset>
      {minor && (
        <fieldset className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <legend className="px-1 text-sm font-semibold text-amber-900">Parent or guardian (required for players under 18)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Guardian's full name" required error={e['guardian.name']}>
              <Input value={v.guardian.name} onChange={set('guardian.name')} maxLength={120} />
            </Field>
            <Field label="Relationship to the player" required error={e['guardian.relationship']}>
              <Input value={v.guardian.relationship} onChange={set('guardian.relationship')} maxLength={60} placeholder="e.g. Mother" />
            </Field>
            <Field label="Guardian's phone" required error={e['guardian.phone']}>
              <Input type="tel" value={v.guardian.phone} onChange={set('guardian.phone')} maxLength={40} />
            </Field>
            <Field label="Guardian's email" error={e['guardian.email']}>
              <Input type="email" value={v.guardian.email} onChange={set('guardian.email')} maxLength={254} />
            </Field>
          </div>
          <Checkbox
            className="mt-3"
            checked={v.guardian.consent}
            onChange={set('guardian.consent')}
            label="I am the parent or guardian, and I consent to the club processing this young person's data for football registration, as described in the Privacy Policy."
          />
          {e['guardian.consent'] && <p className="mt-1 text-sm text-red-700">{e['guardian.consent']}</p>}
        </fieldset>
      )}
      <Button type="submit" loading={form.submitting}>
        Submit application
      </Button>
    </form>
  );
}

function StaffApplicationForm({ onDone }) {
  const { user } = useAuth();
  const teams = useApi('/teams');
  const form = useForm({ fullName: user.name, requestedRole: '', phone: '', experience: '', qualifications: '', statement: '', preferredTeam: '' });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    await apiRequest('/account/applications/staff', { method: 'POST', body: { ...values, preferredTeam: values.preferredTeam || null } });
    onDone('Your staff application has been sent to the Club Director.');
  });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormError error={form.formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={e.fullName}>
          <Input value={v.fullName} onChange={set('fullName')} maxLength={120} />
        </Field>
        <Field label="Role you are applying for" required error={e.requestedRole}>
          <Select value={v.requestedRole} onChange={set('requestedRole')}>
            <option value="">Choose…</option>
            {APPLY_ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Phone number" required error={e.phone}>
          <Input type="tel" value={v.phone} onChange={set('phone')} maxLength={40} />
        </Field>
        <Field label="Team (if relevant)" error={e.preferredTeam}>
          <Select value={v.preferredTeam} onChange={set('preferredTeam')}>
            <option value="">Not specific to a team</option>
            {(teams.data || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Experience" error={e.experience}>
        <Textarea value={v.experience} onChange={set('experience')} rows={4} maxLength={3000} />
      </Field>
      <Field label="Qualifications and licences" error={e.qualifications}>
        <Textarea value={v.qualifications} onChange={set('qualifications')} rows={2} maxLength={2000} />
      </Field>
      <Field label="Anything else the Director should know" error={e.statement}>
        <Textarea value={v.statement} onChange={set('statement')} rows={3} maxLength={2000} />
      </Field>
      <p className="text-xs text-slate-500">The Director decides the final role and what you can access. Nobody can give themselves a staff role.</p>
      <Button type="submit" loading={form.submitting}>
        Submit application
      </Button>
    </form>
  );
}

/** Apply to become a player or staff member, and follow the review status. */
export default function ApplicationsPage() {
  useSeo({ title: 'Applications', noindex: true });
  const { user, isPlayer, isStaff } = useAuth();
  const { settings } = useSettings();
  const { notify } = useToast();
  const list = useApi('/account/applications');
  const [open, setOpen] = useState(null);
  const [withdraw, setWithdraw] = useState(null);
  const pending = (list.data || []).filter((a) => a.status === 'pending');
  const hasPending = (kind) => pending.some((a) => a.kind === kind);

  function done(message) {
    setOpen(null);
    notify(message);
    list.reload();
  }

  async function confirmWithdraw() {
    try {
      await apiRequest(`/account/applications/${withdraw.kind}/${withdraw.id}/withdraw`, { method: 'POST' });
      notify('Application withdrawn.');
      list.reload();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setWithdraw(null);
    }
  }

  return (
    <>
      <PageHeader title="Applications" description="Apply to join the club as a player or as a member of staff. The Club Director reviews every application." />
      {!user.emailVerified && <Alert tone="warning" className="mb-4">Confirm your email address before applying.</Alert>}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col p-4">
          <Shirt aria-hidden="true" className="size-6 text-brand-700" />
          <h2 className="mt-2 font-semibold">Become a registered player</h2>
          <p className="mt-1 flex-1 text-sm text-slate-600">For trials and squad registration. Players under 18 need a parent or guardian’s consent.</p>
          <Button
            className="mt-3 self-start"
            onClick={() => setOpen('player')}
            disabled={!user.emailVerified || isPlayer || hasPending('player') || settings.features?.playerApplications === false}
          >
            {isPlayer ? 'You are a registered player' : hasPending('player') ? 'Application pending' : settings.features?.playerApplications === false ? 'Applications closed' : 'Apply as a player'}
          </Button>
        </Card>
        <Card className="flex flex-col p-4">
          <Briefcase aria-hidden="true" className="size-6 text-brand-700" />
          <h2 className="mt-2 font-semibold">Join the staff</h2>
          <p className="mt-1 flex-1 text-sm text-slate-600">Coaching, media, scouting, IT and management roles.</p>
          <Button
            className="mt-3 self-start"
            onClick={() => setOpen('staff')}
            disabled={!user.emailVerified || isStaff || hasPending('staff') || settings.features?.staffApplications === false}
          >
            {isStaff ? 'You are a staff member' : hasPending('staff') ? 'Application pending' : settings.features?.staffApplications === false ? 'Applications closed' : 'Apply for a staff role'}
          </Button>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Your applications</h2>
      <AsyncContent state={list} isEmpty={(d) => !d.length} empty={<EmptyState icon={ClipboardList} title="You have not applied yet" />}>
        {(apps) => (
          <ul className="space-y-3">
            {apps.map((a) => (
              <li key={a.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{a.kind === 'player' ? `Player application · ${a.position}` : `Staff application · ${a.requestedRoleLabel}`}</p>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Sent {formatDate(a.createdAt)}
                    {a.reviewedAt ? ` · Reviewed ${formatDate(a.reviewedAt)}` : ''}
                  </p>
                  {a.reviewNote && <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700">Message from the club: {a.reviewNote}</p>}
                  {a.status === 'pending' && (
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setWithdraw(a)}>
                      Withdraw application
                    </Button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </AsyncContent>

      <Modal open={open === 'player'} onClose={() => setOpen(null)} title="Player application" size="lg">
        <PlayerApplicationForm onDone={done} />
      </Modal>
      <Modal open={open === 'staff'} onClose={() => setOpen(null)} title="Staff application" size="lg">
        <StaffApplicationForm onDone={done} />
      </Modal>
      <ConfirmDialog open={Boolean(withdraw)} onClose={() => setWithdraw(null)} onConfirm={confirmWithdraw} title="Withdraw application?" confirmLabel="Withdraw">
        The club will no longer review this application. You can apply again later.
      </ConfirmDialog>
    </>
  );
}
