import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LogOut, MonitorSmartphone } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { apiRequest, setAccessToken } from '../../services/apiClient.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Field } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { AsyncContent } from '../../components/ui/Feedback.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { PasswordField } from '../auth/PasswordField.jsx';
import { timeAgo } from '../../lib/format.js';

function describeDevice(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' on ');
}

export default function SecurityPage() {
  useSeo({ title: 'Security', noindex: true });
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const sessions = useApi('/auth/sessions');
  const [confirmAll, setConfirmAll] = useState(false);
  const form = useForm({ currentPassword: '', newPassword: '', confirm: '' });

  const onSubmit = form.submit(async (v) => {
    if (v.newPassword !== v.confirm) {
      form.setErrors({ confirm: 'The passwords do not match.' });
      return;
    }
    const res = await apiRequest('/auth/change-password', { method: 'POST', body: { currentPassword: v.currentPassword, newPassword: v.newPassword } });
    setAccessToken(res.accessToken);
    form.setValues({ currentPassword: '', newPassword: '', confirm: '' });
    notify(res.message);
    sessions.reload();
  });

  async function revoke(id) {
    await apiRequest(`/auth/sessions/${id}`, { method: 'DELETE' });
    notify('Device signed out.');
    sessions.reload();
  }

  async function signOutEverywhere() {
    await apiRequest('/auth/logout-all', { method: 'POST' });
    await logout();
    navigate('/login');
  }

  return (
    <>
      <PageHeader title="Security" description="Change your password and see where you are signed in." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-semibold">Change password</h2>
          <form onSubmit={onSubmit} className="mt-3 space-y-3" noValidate>
            <FormError error={form.formError} />
            <Field label="Current password" error={form.errors.currentPassword} required>
              <PasswordField value={form.values.currentPassword} onChange={form.set('currentPassword')} />
            </Field>
            <Field label="New password" error={form.errors.newPassword} required>
              <PasswordField value={form.values.newPassword} onChange={form.set('newPassword')} autoComplete="new-password" showRules />
            </Field>
            <Field label="Repeat new password" error={form.errors.confirm} required>
              <PasswordField value={form.values.confirm} onChange={form.set('confirm')} autoComplete="new-password" />
            </Field>
            <p className="text-xs text-slate-500">Other devices will be signed out.</p>
            <Button type="submit" loading={form.submitting}>
              Change password
            </Button>
          </form>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">Where you are signed in</h2>
          <AsyncContent state={sessions}>
            {(list) => (
              <ul className="mt-3 divide-y divide-slate-100">
                {list.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2">
                    <MonitorSmartphone aria-hidden="true" className="size-5 shrink-0 text-slate-500" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">
                        {describeDevice(s.userAgent)} {s.current && <Badge tone="success">This device</Badge>}
                      </p>
                      <p className="text-xs text-slate-500">Last active {timeAgo(s.lastUsedAt)}</p>
                    </div>
                    {!s.current && (
                      <Button variant="outline" size="sm" onClick={() => revoke(s.id)}>
                        Sign out
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </AsyncContent>
          <Button variant="danger-outline" icon={LogOut} className="mt-4" onClick={() => setConfirmAll(true)}>
            Sign out everywhere
          </Button>
        </Card>
      </div>
      <ConfirmDialog open={confirmAll} onClose={() => setConfirmAll(false)} onConfirm={signOutEverywhere} title="Sign out on every device?" confirmLabel="Sign out everywhere">
        You will need to sign in again on every phone and computer, including this one.
      </ConfirmDialog>
    </>
  );
}
