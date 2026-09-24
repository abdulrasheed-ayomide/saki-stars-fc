import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CheckCircle2, XCircle } from 'lucide-react';
import { apiRequest } from '../../services/apiClient.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { Field, Input } from '../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { PageSpinner } from '../../components/ui/Spinner.jsx';
import { AuthCard } from './AuthCard.jsx';

/** Confirms the email link, or lets the user request a new one. */
export default function VerifyEmailPage() {
  useSeo({ title: 'Confirm email', noindex: true });
  const [params] = useSearchParams();
  const token = params.get('token');
  const { status, user, reload } = useAuth();
  const [result, setResult] = useState({ state: token ? 'verifying' : 'idle', message: '' });
  const [email, setEmail] = useState(params.get('email') || user?.email || '');
  const [resent, setResent] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    apiRequest('/auth/verify-email', { method: 'POST', body: { token }, withAuth: false })
      .then(async (d) => {
        setResult({ state: 'ok', message: d.message });
        if (status === 'authenticated') await reload().catch(() => {});
      })
      .catch((err) => setResult({ state: 'error', message: err.message }));
  }, [token, status, reload]);

  async function resend(e) {
    e.preventDefault();
    try {
      const d = await apiRequest('/auth/resend-verification', { method: 'POST', body: { email }, withAuth: false });
      setResent(d.message);
    } catch (err) {
      setResent(err.message);
    }
  }

  if (result.state === 'verifying') return <PageSpinner label="Confirming your email…" />;

  return (
    <AuthCard title={result.state === 'ok' ? 'Email confirmed' : 'Confirm your email'}>
      {result.state === 'ok' && (
        <div className="text-center">
          <CheckCircle2 aria-hidden="true" className="mx-auto size-10 text-emerald-600" />
          <p className="mt-3 text-slate-700">{result.message}</p>
          <ButtonLink to={status === 'authenticated' ? '/account' : '/login'} className="mt-4 w-full">
            {status === 'authenticated' ? 'Go to my account' : 'Sign in'}
          </ButtonLink>
        </div>
      )}
      {result.state !== 'ok' && (
        <>
          {result.state === 'error' && (
            <Alert tone="error" className="mb-4">
              <span className="flex items-center gap-2">
                <XCircle aria-hidden="true" className="size-4" /> {result.message}
              </span>
            </Alert>
          )}
          {user?.emailVerified ? (
            <Alert tone="success">Your email address is already confirmed.</Alert>
          ) : (
            <form onSubmit={resend} className="space-y-4">
              <p className="text-sm text-slate-700">Enter your email address and we will send a new confirmation link.</p>
              <Field label="Email address" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
              {resent && <Alert tone="info">{resent}</Alert>}
              <Button type="submit" className="w-full" disabled={!email}>
                Send new link
              </Button>
            </form>
          )}
        </>
      )}
    </AuthCard>
  );
}
