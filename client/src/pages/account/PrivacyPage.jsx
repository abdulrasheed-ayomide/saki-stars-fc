import { useState } from 'react';
import { Link } from 'react-router';
import { Download, FileCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { apiRequest } from '../../services/apiClient.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatDate } from '../../lib/format.js';
import { userMessage } from '../../lib/errors.js';

/** Consent versions, data export and deletion requests (handled by authorised staff and audited). */
export default function PrivacyPage() {
  useSeo({ title: 'Privacy & data', noindex: true });
  const { user, reload } = useAuth();
  const { settings } = useSettings();
  const { notify } = useToast();
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const v = settings.legalVersions || {};
  const needsAccept = (v.terms && v.terms !== user.consents?.termsVersion) || (v.privacy && v.privacy !== user.consents?.privacyVersion);

  async function accept() {
    setBusy('accept');
    try {
      await apiRequest('/account/consents', { method: 'POST' });
      await reload();
      notify('Thank you. Your acceptance has been recorded.');
    } finally {
      setBusy('');
    }
  }

  async function exportData() {
    setBusy('export');
    try {
      const data = await apiRequest('/account/data-export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-club-data.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setBusy('');
    }
  }

  async function requestDeletion(cancel = false) {
    setBusy('delete');
    try {
      await apiRequest('/account/deletion-request', { method: cancel ? 'DELETE' : 'POST' });
      await reload();
      notify(cancel ? 'Deletion request cancelled.' : 'Your request has been sent to the club.');
    } finally {
      setBusy('');
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <PageHeader title="Privacy & your data" description="See what you agreed to, download your data, or ask the club to delete your account." />
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <FileCheck aria-hidden="true" className="size-5" />
            Terms and privacy
          </h2>
          <p className="mt-2 text-sm text-slate-700">
            You accepted Terms version <strong>{user.consents?.termsVersion || '–'}</strong> and Privacy Policy version <strong>{user.consents?.privacyVersion || '–'}</strong>
            {user.consents?.acceptedAt ? ` on ${formatDate(user.consents.acceptedAt)}` : ''}.
          </p>
          <p className="mt-1 text-sm">
            Read the <Link to="/terms" className="underline">Terms of Use</Link>, <Link to="/privacy" className="underline">Privacy Policy</Link> and <Link to="/cookie-policy" className="underline">Cookie Policy</Link>.
          </p>
          {needsAccept && (
            <Alert tone="warning" className="mt-3" action={<Button size="sm" onClick={accept} loading={busy === 'accept'}>Accept the current versions</Button>}>
              The documents have been updated (Terms {v.terms}, Privacy {v.privacy}).
            </Alert>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Download aria-hidden="true" className="size-5" />
            Download your data
          </h2>
          <p className="mt-2 text-sm text-slate-700">A copy of your account, applications, comments and notifications in a machine-readable file.</p>
          <Button variant="outline" className="mt-3" onClick={exportData} loading={busy === 'export'}>
            Download my data
          </Button>
        </Card>

        <Card className="p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Trash2 aria-hidden="true" className="size-5" />
            Delete your account
          </h2>
          <p className="mt-2 text-sm text-slate-700">
            The club will remove your login and personal information. Official football records (for example goals in a recorded match) stay part of club history but are no longer linked to your personal details.
          </p>
          {user.deletionRequestedAt ? (
            <Alert tone="info" className="mt-3" action={<Button variant="outline" size="sm" onClick={() => requestDeletion(true)} loading={busy === 'delete'}>Cancel request</Button>}>
              You asked for deletion on {formatDate(user.deletionRequestedAt)}. The club will process it and contact you if anything is needed.
            </Alert>
          ) : (
            <Button variant="danger-outline" className="mt-3" onClick={() => setConfirmDelete(true)}>
              Request account deletion
            </Button>
          )}
        </Card>
      </div>
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={() => requestDeletion(false)} loading={busy === 'delete'} title="Request account deletion?" confirmLabel="Send request">
        The club will review and complete your request. You can cancel it until then.
      </ConfirmDialog>
    </>
  );
}
