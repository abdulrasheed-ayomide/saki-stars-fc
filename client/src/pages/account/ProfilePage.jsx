import { LayoutDashboard, Shirt } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { apiRequest } from '../../services/apiClient.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatDate } from '../../lib/format.js';
import { USER_STATUS_LABELS } from '../../lib/labels.js';

export default function ProfilePage() {
  useSeo({ title: 'My account', noindex: true });
  const { user, reload, isPlayer, isStaff } = useAuth();
  const { notify } = useToast();
  const form = useForm({ name: user.name });
  const onSubmit = form.submit(async (v) => {
    await apiRequest('/account/profile', { method: 'PATCH', body: v });
    await reload();
    notify('Profile saved.');
  });

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]}`} description="Manage your account and see your applications." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-semibold text-slate-900">Account</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-slate-500">Status</dt>
              <dd>
                <StatusBadge status={user.status} label={USER_STATUS_LABELS[user.status]} />
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-slate-500">Member since</dt>
              <dd>{formatDate(user.createdAt)}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-slate-500">Club role</dt>
              <dd className="font-medium">{isStaff ? user.staff.roleLabel : isPlayer ? 'Registered player' : 'Supporter'}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {isPlayer && (
              <ButtonLink to="/portal" icon={Shirt}>
                Player Portal
              </ButtonLink>
            )}
            {isStaff && (
              <ButtonLink to="/dashboard" icon={LayoutDashboard}>
                Staff Dashboard
              </ButtonLink>
            )}
            {!isPlayer && !isStaff && (
              <ButtonLink to="/account/applications" variant="secondary">
                Apply to join the club
              </ButtonLink>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold text-slate-900">Your details</h2>
          <form onSubmit={onSubmit} className="mt-3 space-y-3" noValidate>
            <FormError error={form.formError} />
            <Field label="Full name" error={form.errors.name}>
              <Input value={form.values.name} onChange={form.set('name')} maxLength={120} autoComplete="name" />
            </Field>
            <p className="text-xs text-slate-500">To change your email address, contact the club.</p>
            <Button type="submit" loading={form.submitting} disabled={form.values.name.trim() === user.name}>
              Save
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
