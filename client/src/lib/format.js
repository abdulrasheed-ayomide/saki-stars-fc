const DEFAULT_TZ = 'Africa/Lagos';

function fmt(value, options, timeZone = DEFAULT_TZ) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-GB', options).format(d);
  }
}

/** All times are stored in UTC and shown in the club's time zone (Settings). */
export const formatDate = (v, tz) => fmt(v, { day: 'numeric', month: 'short', year: 'numeric' }, tz);
export const formatDateLong = (v, tz) => fmt(v, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, tz);
export const formatDay = (v, tz) => fmt(v, { weekday: 'short', day: 'numeric', month: 'short' }, tz);
export const formatTime = (v, tz) => fmt(v, { hour: '2-digit', minute: '2-digit', hour12: false }, tz);
export const formatDateTime = (v, tz) => fmt(v, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }, tz);
export const formatMonthYear = (v, tz) => fmt(v, { month: 'long', year: 'numeric' }, tz);

export function timeAgo(value) {
  if (!value) return '';
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return formatDate(value);
}

/** Value for <input type="datetime-local"> in the club's time zone. */
export function toLocalInput(value, timeZone = DEFAULT_TZ) {
  if (!value) return '';
  const d = new Date(value);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
}

/** Converts a datetime-local value typed in the club's time zone to an ISO (UTC) string. */
export function fromLocalInput(value, timeZone = DEFAULT_TZ) {
  if (!value) return null;
  const [date, time] = value.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Find the zone offset at that moment and correct for it.
  const asZone = new Date(new Date(guess).toLocaleString('en-US', { timeZone }));
  const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess - (asZone - asUtc)).toISOString();
}

export function toDateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export function formatNumber(n) {
  return new Intl.NumberFormat('en-GB').format(n ?? 0);
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function pluralize(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
