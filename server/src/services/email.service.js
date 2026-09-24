import { Resend } from 'resend';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Minimal, accessible, single-column email layout that renders in Gmail/Outlook/Yahoo. */
function layout({ clubName, heading, paragraphs, action, footer }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1e293b">${escapeHtml(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#0b1f4d;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:6px">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#475569">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:8px" cellpadding="0" cellspacing="0">
  <tr><td style="background:#0b1f4d;color:#ffffff;padding:16px 24px;font-weight:700;font-size:18px;border-radius:8px 8px 0 0">${escapeHtml(clubName)}</td></tr>
  <tr><td style="padding:24px"><h1 style="margin:0 0 16px;font-size:20px;color:#0b1f4d">${escapeHtml(heading)}</h1>${body}${button}
  ${footer ? `<p style="margin:24px 0 0;font-size:12px;color:#64748b">${escapeHtml(footer)}</p>` : ''}</td></tr>
  </table></td></tr></table></body></html>`;
  const text = [heading, '', ...paragraphs, ...(action ? ['', `${action.label}: ${action.url}`] : []), ...(footer ? ['', footer] : [])].join('\n');
  return { html, text };
}

/**
 * Email service abstraction. Production uses Resend; development can use the console
 * transport, which prints messages to the terminal instead of sending them.
 */
export function createEmailService({ config, logger, getClubName = async () => 'Saki Stars Sports Club' }) {
  const { transport, resendApiKey, from, replyTo } = config.email;
  const resend = transport === 'resend' && resendApiKey ? new Resend(resendApiKey) : null;
  const appUrl = config.appUrl;
  const sent = []; // kept for tests only (disabled transport)

  async function send({ to, subject, heading, paragraphs, action, footer }) {
    const clubName = await getClubName();
    const { html, text } = layout({ clubName, heading, paragraphs, action, footer });

    if (transport === 'disabled') {
      sent.push({ to, subject, text, action });
      return { delivered: false };
    }
    if (transport === 'console') {
      // Development only (refused in production by config). Written straight to the terminal,
      // not the application log, so links never end up in stored logs.
      process.stdout.write(`\n==== Email (development console transport) ====\nTo: ${to}\nSubject: ${subject}\n\n${text}\n===============================================\n\n`);
      return { delivered: true };
    }
    try {
      const { error } = await resend.emails.send({
        from,
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { replyTo } : {}),
      });
      if (error) throw new Error(error.message || 'Resend error');
      return { delivered: true };
    } catch (err) {
      logger.error('Email could not be sent', { subject, reason: err.message });
      return { delivered: false };
    }
  }

  const link = (path) => `${appUrl}${path}`;

  return {
    isEnabled: transport !== 'disabled',
    outbox: sent,

    sendVerificationEmail: (user, token) =>
      send({
        to: user.email,
        subject: 'Confirm your email address',
        heading: `Welcome, ${user.name}`,
        paragraphs: ['Please confirm your email address to finish creating your account. The link is valid for 24 hours.'],
        action: { label: 'Confirm email address', url: link(`/verify-email?token=${encodeURIComponent(token)}`) },
        footer: 'If you did not create an account, you can ignore this email.',
      }),

    sendPasswordResetEmail: (user, token) =>
      send({
        to: user.email,
        subject: 'Reset your password',
        heading: 'Reset your password',
        paragraphs: ['We received a request to reset your password. The link is valid for 30 minutes and can be used once.'],
        action: { label: 'Choose a new password', url: link(`/reset-password?token=${encodeURIComponent(token)}`) },
        footer: 'If you did not ask for this, you can ignore this email. Your password has not changed.',
      }),

    sendSecurityNotification: (user, { heading, message }) =>
      send({
        to: user.email,
        subject: `Security notice: ${heading}`,
        heading,
        paragraphs: [message, 'If this was not you, reset your password straight away and contact the club.'],
        action: { label: 'Reset password', url: link('/forgot-password') },
      }),

    sendPlayerApprovalEmail: (user, { approved, note }) =>
      send({
        to: user.email,
        subject: approved ? 'Your player application was approved' : 'Update on your player application',
        heading: approved ? 'You are now a registered player' : 'Player application update',
        paragraphs: approved
          ? ['Congratulations. Your application has been approved and your player profile is ready.', ...(note ? [note] : [])]
          : ['Thank you for applying. After review, the club is unable to accept your application at this time.', ...(note ? [note] : [])],
        action: approved ? { label: 'Open the Player Portal', url: link('/portal') } : { label: 'View your account', url: link('/account') },
      }),

    sendStaffApprovalEmail: (user, { approved, roleLabel, note }) =>
      send({
        to: user.email,
        subject: approved ? 'Your staff application was approved' : 'Update on your staff application',
        heading: approved ? `Welcome to the staff: ${roleLabel}` : 'Staff application update',
        paragraphs: approved
          ? [`Your staff application has been approved. Your role is ${roleLabel}.`, ...(note ? [note] : [])]
          : ['Thank you for applying. After review, the club is unable to accept your staff application at this time.', ...(note ? [note] : [])],
        action: approved ? { label: 'Open the Staff Dashboard', url: link('/dashboard') } : { label: 'View your account', url: link('/account') },
      }),

    sendNewsletterConfirmation: (email, token) =>
      send({
        to: email,
        subject: 'Confirm your club updates subscription',
        heading: 'Confirm your subscription',
        paragraphs: ['Please confirm that you want to receive club updates by email.'],
        action: { label: 'Confirm subscription', url: link(`/newsletter/confirm?token=${encodeURIComponent(token)}`) },
        footer: 'If you did not ask for this, ignore this email and you will not be subscribed.',
      }),

    sendContactForward: (to, message) =>
      send({
        to,
        subject: `Website contact: ${message.subject}`,
        heading: 'New message from the website contact form',
        paragraphs: [
          `From: ${message.name} <${message.email}>${message.phone ? `, ${message.phone}` : ''}`,
          `Subject: ${message.subject}`,
          message.message,
        ],
        action: { label: 'Open in the dashboard', url: link('/dashboard/contact') },
      }),
  };
}
