import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { MailCheck } from 'lucide-react';
import { apiRequest } from '../../services/apiClient.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { Field, Input, Checkbox } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { AuthCard } from './AuthCard.jsx';
import { PasswordField } from './PasswordField.jsx';

/**
 * Public registration always creates a normal user. Player and staff roles are only
 * granted later through the application and approval workflow.
 */
export default function RegisterPage() {
  useSeo({ title: 'Create account', noindex: true });
  const { status } = useAuth();
  const [done, setDone] = useState(null);
  const form = useForm({ name: '', email: '', password: '', acceptTerms: false });
  const { values, set, errors } = form;

  const onSubmit = form.submit(async (v) => {
    const res = await apiRequest('/auth/register', { method: 'POST', body: v, withAuth: false });
    setDone({ email: v.email, message: res.message });
  });

  if (status === 'authenticated') return <Navigate to="/account" replace />;

  if (done) {
    return (
      <AuthCard title="Check your email">
        <div className="text-center">
          <MailCheck aria-hidden="true" className="mx-auto size-10 text-brand-700" />
          <p className="mt-3 text-slate-700">
            We sent a confirmation link to <strong>{done.email}</strong>. Open it to activate your account. It is valid for 24 hours.
          </p>
          <p className="mt-3 text-sm text-slate-600">
            No email after a few minutes? Check your spam folder, or{' '}
            <Link to={`/verify-email?email=${encodeURIComponent(done.email)}`} className="font-semibold underline">
              request a new link
            </Link>
            .
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      description="Free for fans, players and staff. Comment on news, follow the club, and apply to join as a player or staff member."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError error={form.formError} context="register" />
        <Field label="Full name" error={errors.name} required>
          <Input value={values.name} onChange={set('name')} autoComplete="name" maxLength={120} autoFocus />
        </Field>
        <Field label="Email address" error={errors.email} required hint="Any email address works, e.g. Gmail or Yahoo.">
          <Input type="email" value={values.email} onChange={set('email')} autoComplete="email" maxLength={254} />
        </Field>
        <Field label="Password" error={errors.password} required>
          <PasswordField value={values.password} onChange={set('password')} autoComplete="new-password" showRules />
        </Field>
        <div>
          <Checkbox
            checked={values.acceptTerms}
            onChange={set('acceptTerms')}
            label={
              <>
                I accept the{' '}
                <Link to="/terms" target="_blank" className="underline">
                  Terms of Use
                </Link>{' '}
                and{' '}
                <Link to="/privacy" target="_blank" className="underline">
                  Privacy Policy
                </Link>
                .
              </>
            }
          />
          {errors.acceptTerms && <p className="mt-1 text-sm text-red-700">{errors.acceptTerms}</p>}
        </div>
        <Alert tone="info">If you are under 18, please ask a parent or guardian before creating an account.</Alert>
        <Button type="submit" className="w-full" size="lg" loading={form.submitting} disabled={!values.acceptTerms}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
