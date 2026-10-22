import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { isSecurityNoticeEnabled, SECURITY_NOTICE_REPEAT_MS } from '../../config/securityNotice.js';

// Time the notice was last dismissed, per signed-in user. Kept in memory only, so moving between
// dashboard pages (or briefly visiting the public site) does not show it again before it is due.
// A full page reload or a new sign-in starts fresh.
const lastDismissed = new Map();

/** Exposed for tests only. */
export function resetSecurityNotice() {
  lastDismissed.clear();
}

const otherDialogOpen = () => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
const RETRY_MS = 5000;

/**
 * A calm security reminder for staff. It is a reminder only: it does not detect, count or claim
 * any attack. Shown when the dashboard opens and again two minutes after each dismissal (OK,
 * Cancel, Escape or the close button). Never two at once, and it waits while another dialog is
 * open so it does not interrupt someone mid-task. The timer is cleared on unmount and sign-out.
 */
export function SecurityNotice({ enabled = isSecurityNoticeEnabled(), repeatMs = SECURITY_NOTICE_REPEAT_MS }) {
  const { status, isStaff, user } = useAuth();
  const userId = status === 'authenticated' && isStaff ? user?.id : null;
  const active = Boolean(enabled && userId);
  // The user the notice is currently showing for (null = closed). Comparing it with the current
  // user means a sign-out or account switch closes it without any extra effect.
  const [openFor, setOpenFor] = useState(null);
  const open = active && openFor === userId;

  useEffect(() => {
    if (!active || open) return undefined;
    let timer;
    const due = () => {
      // Another dialog (a form, a confirmation) is open: try again shortly instead of stacking.
      if (otherDialogOpen()) {
        timer = setTimeout(due, RETRY_MS);
        return;
      }
      setOpenFor(userId);
    };
    const last = lastDismissed.get(userId);
    const wait = last == null ? 0 : Math.max(0, last + repeatMs - Date.now());
    timer = setTimeout(due, wait);
    return () => clearTimeout(timer);
  }, [active, open, userId, repeatMs]);

  // Signed out: forget dismissals so the next person to sign in on this browser sees it.
  useEffect(() => {
    if (status === 'anonymous') lastDismissed.clear();
  }, [status]);

  if (!open) return null;

  const dismiss = () => {
    lastDismissed.set(userId, Date.now());
    setOpenFor(null);
  };

  return (
    <Modal
      open
      onClose={dismiss}
      size="sm"
      title={
        <span className="text-red-800">
          Warning <span aria-hidden="true">⚠</span>
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={dismiss}>
            Cancel
          </Button>
          <Button variant="danger" onClick={dismiss} data-autofocus>
            OK
          </Button>
        </>
      }
    >
      <div className="flex gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-red-900">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-red-700" />
        <p className="text-sm leading-relaxed">
          <strong className="font-semibold">Security Reminder:</strong> Please ensure the website&apos;s authentication, access controls, and security
          monitoring are properly configured. Review any suspicious login activity and report concerns to the responsible administrator.
        </p>
      </div>
    </Modal>
  );
}
