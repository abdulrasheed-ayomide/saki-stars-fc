import { Link, Navigate, useSearchParams } from 'react-router';
import { LogIn } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { Field, Input } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { AuthCard } from './AuthCard.jsx';
import { PasswordField } from './PasswordField.jsx';

/** Only same-site paths are allowed as "next", so a link cannot send users to another website. */
export function safeNext(next, fallback = '/account') {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

export default function LoginPage() {
  useSeo({ title: 'Sign in', noindex: true });
  const { login, status, user } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), '');
  const form = useForm({ email: '', password: '' });
  const { values, set, errors } = form;

  // Signing in updates the session; the redirect below then sends people to the right place.
  const onSubmit = form.submit((v) => login(v.email, v.password));

  if (status === 'authenticated') {
    const home = user?.staff ? '/dashboard' : user?.player ? '/portal' : '/account';
    return <Navigate to={next || home} replace />;
  }

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError error={form.formError} context="login" />
        <Field label="Email address" error={errors.email} required>
          <Input type="email" value={values.email} onChange={set('email')} autoComplete="email" autoFocus />
        </Field>
        <Field label="Password" error={errors.password} required>
          <PasswordField value={values.password} onChange={set('password')} />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="inline-flex min-h-10 items-center text-sm font-medium text-brand-700 underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={form.submitting} icon={LogIn}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
