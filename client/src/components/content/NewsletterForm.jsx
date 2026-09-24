import { useState } from 'react';
import { apiRequest } from '../../services/apiClient.js';
import { Button } from '../ui/Button.jsx';

/** Double opt-in subscription: the person must click the link in the confirmation email. */
export function NewsletterForm({ tone = 'dark' }) {
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [state, setState] = useState({ status: 'idle', message: '' });

  async function submit(e) {
    e.preventDefault();
    setState({ status: 'busy', message: '' });
    try {
      const res = await apiRequest('/newsletter/subscribe', { method: 'POST', body: { email, website }, withAuth: false });
      setState({ status: 'done', message: res.message });
      setEmail('');
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  }

  const dark = tone === 'dark';
  return (
    <form onSubmit={submit} className="w-full max-w-md" noValidate>
      <label htmlFor="newsletter-email" className={`block text-sm font-medium ${dark ? 'text-brand-100' : 'text-slate-800'}`}>
        Email address
      </label>
      <div className="mt-1 flex flex-col gap-2 xs:flex-row">
        <input
          id="newsletter-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-slate-900"
          placeholder="you@example.com"
        />
        {/* Honeypot for bots; hidden from people and screen readers. */}
        <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <Button type="submit" variant={dark ? 'light' : 'primary'} loading={state.status === 'busy'} disabled={!email}>
          Subscribe
        </Button>
      </div>
      <p aria-live="polite" className={`mt-2 text-sm ${state.status === 'error' ? (dark ? 'text-red-200' : 'text-red-700') : dark ? 'text-brand-100' : 'text-slate-700'}`}>
        {state.message}
      </p>
    </form>
  );
}
