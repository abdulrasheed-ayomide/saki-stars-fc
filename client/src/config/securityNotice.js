/**
 * Security-awareness reminder shown inside the staff dashboard.
 *
 * SECURITY_NOTICE_ENABLED comes from the PUBLIC build variable VITE_SECURITY_NOTICE_ENABLED
 * (every VITE_ value is bundled into the browser code: it is a display switch, not a secret and
 * not a security control). On unless set to "false" (or "0" / "off"); a rebuild applies a change.
 */
export function isSecurityNoticeEnabled(value = import.meta.env.VITE_SECURITY_NOTICE_ENABLED) {
  return !['false', '0', 'off', 'no'].includes(String(value ?? 'true').trim().toLowerCase());
}

export const SECURITY_NOTICE_ENABLED = isSecurityNoticeEnabled();

/** How long after the notice is dismissed it appears again (while staying in the dashboard). */
export const SECURITY_NOTICE_REPEAT_MS = 2 * 60 * 1000;
