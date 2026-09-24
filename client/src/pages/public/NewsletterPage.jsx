import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { MailCheck, MailX } from 'lucide-react';
import { apiRequest } from '../../services/apiClient.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { StatusMessage } from '../../components/feedback/StatusMessage.jsx';
import { PageSpinner } from '../../components/ui/Spinner.jsx';
import { Button } from '../../components/ui/Button.jsx';

/** Handles the links in newsletter emails: confirm (double opt-in) and unsubscribe. */
export default function NewsletterPage({ action }) {
  useSeo({ title: action === 'confirm' ? 'Confirm subscription' : 'Unsubscribe', noindex: true });
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState({ status: action === 'confirm' ? 'loading' : 'idle', message: '', unsubscribeToken: '' });

  useEffect(() => {
    if (action !== 'confirm') return;
    apiRequest('/newsletter/confirm', { method: 'POST', body: { token }, withAuth: false })
      .then((d) => setState({ status: 'done', message: d.message, unsubscribeToken: d.unsubscribeToken }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [action, token]);

  async function unsubscribe() {
    setState({ status: 'loading', message: '' });
    try {
      const d = await apiRequest('/newsletter/unsubscribe', { method: 'POST', body: { token }, withAuth: false });
      setState({ status: 'done', message: d.message });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  }

  if (state.status === 'loading') return <PageSpinner />;
  if (action === 'unsubscribe' && state.status === 'idle') {
    return (
      <StatusMessage icon={MailX} title="Unsubscribe from club updates" actions={<Button onClick={unsubscribe}>Unsubscribe</Button>}>
        <p>You will no longer receive club update emails.</p>
      </StatusMessage>
    );
  }
  return (
    <StatusMessage icon={state.status === 'error' ? MailX : MailCheck} title={state.status === 'error' ? 'That link did not work' : action === 'confirm' ? 'Subscription confirmed' : 'Unsubscribed'}>
      <p>{state.message}</p>
      {state.unsubscribeToken && (
        <p className="mt-3 text-sm">
          Changed your mind?{' '}
          <Link to={`/newsletter/unsubscribe?token=${encodeURIComponent(state.unsubscribeToken)}`} className="underline">
            Unsubscribe
          </Link>
        </p>
      )}
    </StatusMessage>
  );
}
