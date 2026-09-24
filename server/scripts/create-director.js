/**
 * Creates the FIRST Club Director, or recovers Director access if every Director has lost it.
 *
 * Public registration can never create a Director. This script needs direct database
 * access (the MONGODB_URI), so only the person who controls the club's infrastructure can run it.
 *
 * Usage (from the server folder):
 *   npm run director:create                 first Director, asks for details
 *   npm run director:create -- --recover    add/restore a Director when one already exists
 *
 * Non-interactive (e.g. CI): set DIRECTOR_EMAIL, DIRECTOR_NAME and DIRECTOR_PASSWORD.
 * Every run is written to the audit log.
 */
import mongoose from 'mongoose';
import { connectForScript, ask } from './_db.js';
import { User, AuditLog, RefreshSession } from '../src/models/index.js';
import { hashPassword, passwordProblems } from '../src/auth/password.js';
import { assignDirectorRole, countActiveDirectors } from '../src/auth/bootstrapDirector.js';

const recover = process.argv.includes('--recover');

await connectForScript();

const existing = await countActiveDirectors();
if (existing > 0 && !recover) {
  console.error(
    `There is already ${existing} active Director. For safety this script stops here.\n` +
      'If every Director has lost access (or left the club), run it again with --recover.',
  );
  await mongoose.disconnect();
  process.exit(1);
}

const email = (process.env.DIRECTOR_EMAIL || (await ask('Director email: '))).toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error('That is not a valid email address.');
  process.exit(1);
}

let user = await User.findOne({ email }).select('+passwordHash');
let name = user?.name;
let password = null;

if (!user) {
  name = process.env.DIRECTOR_NAME || (await ask('Full name: '));
  password = process.env.DIRECTOR_PASSWORD || (await ask('Password (min 10 characters, letters and numbers): ', { hidden: true }));
  const problems = passwordProblems(password, { email, name });
  if (problems.length) {
    console.error(`Password rejected: ${problems.join(' ')}`);
    process.exit(1);
  }
  user = await User.create({
    email,
    name,
    passwordHash: await hashPassword(password, 12),
    status: 'active',
    emailVerifiedAt: new Date(),
  });
  console.log('Created a new account.');
} else {
  if (user.anonymizedAt) {
    console.error('That account was deleted. Use a different email address.');
    process.exit(1);
  }
  // An ordinary account (e.g. made through the public Register page) must get a NEW password
  // before it becomes Director: otherwise whoever registered this address first — possibly not
  // you — would gain full admin access with a password only they know.
  const mustReset = user.role !== 'staff';
  if (process.env.DIRECTOR_PASSWORD || recover || mustReset) {
    const prompt = mustReset
      ? 'This email belongs to an ordinary account. Set a new password for it: '
      : 'Set a new password for this account (leave empty to keep the current one): ';
    const reset = process.env.DIRECTOR_PASSWORD || (await ask(prompt, { hidden: true }));
    if (!reset && mustReset) {
      console.error('A new password is required to turn an ordinary account into a Director.');
      process.exit(1);
    }
    if (reset) {
      const problems = passwordProblems(reset, { email, name: user.name });
      if (problems.length) {
        console.error(`Password rejected: ${problems.join(' ')}`);
        process.exit(1);
      }
      user.passwordHash = await hashPassword(reset, 12);
      user.passwordChangedAt = new Date();
      await RefreshSession.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: 'director_script' } });
    }
  }
  user.status = 'active';
  user.emailVerifiedAt = user.emailVerifiedAt || new Date();
  user.lockedUntil = null;
  user.failedLoginCount = 0;
  console.log('Using the existing account for this email.');
}

const staff = await assignDirectorRole(user);

await AuditLog.create({
  actor: null,
  actorName: 'Server script',
  action: recover ? 'director.recovered' : 'director.bootstrapped',
  entityType: 'Staff',
  entityId: String(staff._id),
  metadata: { email, host: process.env.HOSTNAME || process.env.COMPUTERNAME || '' },
});

console.log(`\nDone. ${user.name} <${email}> is now a Club Director.`);
console.log('Sign in on the website and open the Staff Dashboard.');
await mongoose.disconnect();
