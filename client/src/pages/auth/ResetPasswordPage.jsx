import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { apiRequest } from '../../services/apiClient.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { Field } from '../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { AuthCard } from './AuthCard.jsx';
import { PasswordField } from './PasswordField.jsx';

export default function ResetPasswordPage() {
  useSeo({ title: 'Choose a new password', noindex: true });
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [done, setDone] = useState(null);
  const form = useForm({ password: '', confirm: '' });
  const onSubmit = form.submit(async (v) => {
    if (v.password !== v.confirm) {
      form.setErrors({ confirm: 'The passwords do not match.' });
      return;
    }
    const res = await apiRequest('/auth/reset-password', { method: 'POST', body: { token, password: v.password }, withAuth: false });
    setDone(res.message);
  });

  if (!token) {
    return (
      <AuthCard title="Reset link missing">
        <Alert tone="error">This page needs the link from your password reset email.</Alert>
        <ButtonLink to="/forgot-password" className="mt-4 w-full">
          Request a new link
        </ButtonLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <>
          <Alert tone="success">{done}</Alert>
          <ButtonLink to="/login" className="mt-4 w-full">
            Sign in
          </ButtonLink>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError error={form.formError} context="passwordReset" />
          {form.formError?.code === 'BAD_REQUEST' && (
            <p className="text-sm">
              <Link to="/forgot-password" className="font-semibold underline">
                Request a new reset link
              </Link>
            </p>
          )}
          <Field label="New password" error={form.errors.password} required>
            <PasswordField value={form.values.password} onChange={form.set('password')} autoComplete="new-password" showRules autoFocus />
          </Field>
          <Field label="Repeat new password" error={form.errors.confirm} required>
            <PasswordField value={form.values.confirm} onChange={form.set('confirm')} autoComplete="new-password" />
          </Field>
          <p className="text-xs text-slate-500">For your security, every device signed in to your account will be signed out.</p>
          <Button type="submit" className="w-full" loading={form.submitting}>
            Save new password
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
