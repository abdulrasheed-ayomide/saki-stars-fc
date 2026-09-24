import { useState } from 'react';
import { Link } from 'react-router';
import { apiRequest } from '../../services/apiClient.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { Field, Input } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { AuthCard } from './AuthCard.jsx';

export default function ForgotPasswordPage() {
  useSeo({ title: 'Forgot password', noindex: true });
  const [sent, setSent] = useState(null);
  const form = useForm({ email: '' });
  const onSubmit = form.submit(async (v) => {
    const res = await apiRequest('/auth/forgot-password', { method: 'POST', body: v, withAuth: false });
    setSent(res.message);
  });
  return (
    <AuthCard title="Reset your password" description="Enter your email address and we will send you a link to choose a new password." footer={<Link to="/login" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">Back to sign in</Link>}>
      {sent ? (
        <Alert tone="success" title="Check your email">
          {sent} The link is valid for 30 minutes.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError error={form.formError} />
          <Field label="Email address" error={form.errors.email} required>
            <Input type="email" value={form.values.email} onChange={form.set('email')} autoComplete="email" autoFocus />
          </Field>
          <Button type="submit" className="w-full" loading={form.submitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
