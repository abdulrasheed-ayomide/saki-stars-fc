import bcrypt from 'bcryptjs';

const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'iloveyou1',
  'football1', 'football123', 'sakistars', 'sakistars1', 'welcome123', 'admin1234', 'letmein123', 'abc12345',
]);

/** Returns a list of problems (empty when the password is acceptable). */
export function passwordProblems(password, { email = '', name = '' } = {}) {
  const problems = [];
  if (typeof password !== 'string' || password.length < 10) problems.push('Use at least 10 characters.');
  if (typeof password === 'string' && password.length > 128) problems.push('Use at most 128 characters.');
  if (!/[A-Za-z]/.test(password || '') || !/[0-9]/.test(password || '')) problems.push('Include at least one letter and one number.');
  const lower = String(password || '').toLowerCase();
  if (COMMON.has(lower)) problems.push('This password is too common.');
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) problems.push('Do not include your email address in your password.');
  const first = String(name).split(/\s+/)[0]?.toLowerCase() || '';
  if (first.length >= 4 && lower.includes(first)) problems.push('Do not include your name in your password.');
  return problems;
}

export function hashPassword(password, rounds) {
  return bcrypt.hash(password, rounds);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

let dummy = null;
/** Compared against when the email is unknown, so response time does not reveal whether an account exists. */
export async function getDummyHash(rounds) {
  if (!dummy) dummy = await bcrypt.hash('not-a-real-password-0', rounds);
  return dummy;
}
