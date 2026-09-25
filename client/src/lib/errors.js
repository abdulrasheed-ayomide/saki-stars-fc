/**
 * One place that turns ANY failure into words a club member can read.
 *
 *   technical error ──► classifyError() ──► userMessage(err, context) ──► screen
 *
 * The technical detail stays on the error object (`developerMessage`, `cause`) and in the
 * browser console, never on the page. Use userMessage() wherever an error is shown:
 * toasts, form alerts, error states.
 */

/**
 * What each part of the site calls itself when it cannot load or save.
 * `unavailable` completes "…. Please try again in a moment." for server/unknown failures.
 */
export const ERROR_CONTEXTS = {
  default: { title: 'This could not be loaded', unavailable: 'We couldn’t load this information right now.' },
  fixtures: { title: 'Fixtures are temporarily unavailable', unavailable: 'Fixtures are temporarily unavailable.' },
  results: { title: 'Results are temporarily unavailable', unavailable: 'Match results are temporarily unavailable.' },
  match: { title: 'This match could not be loaded', unavailable: 'Match details are temporarily unavailable.' },
  players: { title: 'Players could not be loaded', unavailable: 'Player information is temporarily unavailable.' },
  teams: { title: 'Teams could not be loaded', unavailable: 'Team information is temporarily unavailable.' },
  competitions: { title: 'Competitions could not be loaded', unavailable: 'Competition information is temporarily unavailable.' },
  standings: { title: 'The table could not be loaded', unavailable: 'The league table is temporarily unavailable.' },
  news: { title: 'News could not be loaded', unavailable: 'News could not be loaded right now.' },
  videos: { title: 'Videos could not be loaded', unavailable: 'Videos are temporarily unavailable.' },
  gallery: { title: 'The gallery could not be loaded', unavailable: 'The gallery is temporarily unavailable.' },
  staff: { title: 'Staff could not be loaded', unavailable: 'Staff information is temporarily unavailable.' },
  search: { title: 'Search is not working right now', unavailable: 'Search is temporarily unavailable.' },
  comments: { title: 'Comments could not be loaded', unavailable: 'Comments are temporarily unavailable.' },
  page: { title: 'This page could not be loaded', unavailable: 'This page is temporarily unavailable.' },
  dashboard: { title: 'This could not be loaded', unavailable: 'We couldn’t load this information right now.' },
  // Actions (forms and buttons)
  action: { title: 'That didn’t work', unavailable: 'We couldn’t complete that action right now.' },
  save: { title: 'Not saved', unavailable: 'We couldn’t save your changes right now.' },
  contact: { title: 'Message not sent', unavailable: 'We couldn’t send your message right now.' },
  login: { title: 'Could not sign in', unavailable: 'We couldn’t sign you in right now.' },
  register: { title: 'Could not register', unavailable: 'We couldn’t complete your registration right now.' },
  passwordReset: { title: 'Could not reset password', unavailable: 'We couldn’t process your password reset request right now.' },
  newsletter: { title: 'Could not subscribe', unavailable: 'We couldn’t update your newsletter subscription right now.' },
  upload: { title: 'Upload failed', unavailable: 'We couldn’t upload this file.' },
  application: { title: 'Application not sent', unavailable: 'We couldn’t submit your application right now.' },
};

const GENERIC = {
  network: 'We’re having trouble connecting right now. Please check your connection and try again.',
  timeout: 'The request is taking longer than expected. Please try again.',
  unexpected: 'Something went wrong. Please try again.',
  unauthenticated: 'Your session has expired. Please sign in again.',
  forbidden: 'You don’t have permission to access this area.',
  notFound: 'We couldn’t find what you were looking for. It may have been moved or removed.',
  rateLimited: 'You’re doing that too often. Please wait a moment and try again.',
  invalid: 'Please check the details you entered and try again.',
};

// Server text that must never be shown even though it came from our own API.
const TECHNICAL_TEXT =
  /No endpoint matches|not valid JSON|encoding|Cast to|ValidationError|Mongo|E11000|ECONN|ENOTFOUND|TypeError|ReferenceError|is not a function|undefined|null|stack|at \S+ \(|\bJWT\b|jsonwebtoken|Token(Expired)?Error|https?:\/\//i;

/** Returns true when a message written by our API is plain, intentional user text. */
export function isSafeServerMessage(message) {
  return typeof message === 'string' && message.length > 0 && message.length <= 300 && !TECHNICAL_TEXT.test(message);
}

/**
 * Sorts any thrown value into a category:
 * network | timeout | aborted | server | unauthenticated | forbidden | notFound |
 * validation | rateLimited | client | unexpected
 */
export function classifyError(err) {
  if (!err) return 'unexpected';
  if (err.kind) return err.kind;
  if (err.name === 'AbortError') return 'aborted';
  const status = Number(err.status) || 0;
  if (status === 0) return err.code === 'TIMEOUT' ? 'timeout' : err.code === 'NETWORK_ERROR' ? 'network' : 'unexpected';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 408) return 'timeout';
  if (status === 422 || err.code === 'VALIDATION_ERROR') return 'validation';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'server';
  return 'client';
}

/**
 * The sentence to show for an error. `context` is a key of ERROR_CONTEXTS
 * (e.g. 'fixtures', 'contact') and only changes the wording for failures that
 * are not the user's fault (server down, unknown bug).
 */
export function userMessage(err, context = 'default') {
  const ctx = ERROR_CONTEXTS[context] || ERROR_CONTEXTS.default;
  const kind = classifyError(err);
  // Messages our API wrote deliberately for people ("The email or password is incorrect.").
  const serverText = err?.serverMessageSafe ? err.serverMessage : null;

  switch (kind) {
    case 'network':
      return GENERIC.network;
    case 'timeout':
      return GENERIC.timeout;
    case 'unauthenticated':
      return serverText || GENERIC.unauthenticated;
    case 'forbidden':
      return serverText || GENERIC.forbidden;
    case 'notFound':
      return serverText || GENERIC.notFound;
    case 'rateLimited':
      return serverText || GENERIC.rateLimited;
    case 'validation':
    case 'client':
      return serverText || GENERIC.invalid;
    case 'server':
    case 'aborted':
    case 'unexpected':
    default:
      return `${ctx.unavailable} Please try again in a moment.`;
  }
}

/** Heading for an error panel in a given part of the site. */
export function errorTitle(context = 'default') {
  return (ERROR_CONTEXTS[context] || ERROR_CONTEXTS.default).title;
}

/** Whether offering "Try again" makes sense (it does not for permission or not-found errors). */
export function isRetryable(err) {
  return ['network', 'timeout', 'server', 'unexpected', 'rateLimited', 'aborted'].includes(classifyError(err));
}

/**
 * Field messages from the API's VALIDATION_ERROR details. The club's own rules are written for
 * people; generic schema errors ("Invalid input: expected string, received number") are replaced.
 */
export function fieldMessage(message) {
  if (!isSafeServerMessage(message) || /expected .* received|invalid_type|Invalid input|Required$|Unrecognized key/i.test(message)) {
    return 'Please check this field.';
  }
  return message;
}

/** Logs the real error for developers without showing it to users. */
export function logError(err, where = '') {
  if (typeof console === 'undefined') return;
  const kind = classifyError(err);
  // Expected, user-caused errors are noise in production; unexpected ones are always worth a line.
  if (import.meta.env?.DEV || ['unexpected', 'server'].includes(kind)) {
    console.error(`[SakiStars]${where ? ` ${where}:` : ''}`, err?.developerMessage || err?.message || err, err?.cause || '');
  }
}
