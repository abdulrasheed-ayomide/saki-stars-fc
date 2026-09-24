import { User, Staff, AuditLog, RefreshSession } from '../models/index.js';
import { hashPassword, passwordProblems } from './password.js';
import { STAFF_ROLES } from './permissions.js';

/** Counts Directors who can actually sign in (active staff record linked to a login). */
export function countActiveDirectors() {
  return Staff.countDocuments({ staffRole: 'director', status: 'active', user: { $ne: null } });
}

/**
 * Gives an existing account the Club Director role (creating or reactivating its staff record).
 * Shared by the server start-up bootstrap and `npm run director:create`.
 */
export async function assignDirectorRole(user) {
  let staff = await Staff.findOne({ user: user._id });
  if (staff) {
    staff.staffRole = 'director';
    staff.status = 'active';
    staff.title = staff.title || STAFF_ROLES.director.label;
    await staff.save();
  } else {
    staff = await Staff.create({
      user: user._id,
      fullName: user.name,
      staffRole: 'director',
      title: STAFF_ROLES.director.label,
      category: 'management',
      showOnWebsite: false,
      status: 'active',
    });
  }
  user.role = 'staff';
  user.staff = staff._id;
  await user.save();
  return staff;
}

/**
 * Creates the FIRST Club Director from DIRECTOR_EMAIL / DIRECTOR_PASSWORD (/ DIRECTOR_NAME)
 * when the server starts, so a fresh install (or a handed-over project) has an admin login
 * without anyone running a script.
 *
 * Safety rules:
 * - It only acts while the database has NO active Director. Once one exists, the variables are
 *   ignored, so changing the password later in Account > Security is never undone by a restart.
 * - The password is bcrypt-hashed before it is stored; the plain value never reaches the database.
 * - If someone already registered an ordinary account with DIRECTOR_EMAIL, that account is
 *   promoted, but its password is REPLACED with DIRECTOR_PASSWORD and all its sessions are
 *   signed out. Otherwise whoever registered the address first would become Director.
 */
export async function ensureDirectorFromEnv({ email, name, password, rounds = 12, logger }) {
  if (!email || !password) return { action: 'skipped' };

  if ((await countActiveDirectors()) > 0) {
    logger?.info('A Club Director already exists; DIRECTOR_EMAIL/DIRECTOR_PASSWORD are ignored. You can remove them from the environment.');
    return { action: 'exists' };
  }

  const address = String(email).trim().toLowerCase();
  const displayName = (name || '').trim() || 'Club Director';
  const problems = passwordProblems(password, { email: address, name: displayName });
  if (problems.length) {
    logger?.error('DIRECTOR_PASSWORD was rejected; no Director was created', { problems });
    return { action: 'rejected', problems };
  }

  const passwordHash = await hashPassword(password, rounds);
  let user = await User.findOne({ email: address });
  let action;

  if (!user) {
    user = await User.create({
      email: address,
      name: displayName,
      passwordHash,
      status: 'active',
      emailVerifiedAt: new Date(),
    });
    action = 'created';
  } else {
    if (user.anonymizedAt || user.deletedAt) {
      logger?.error('DIRECTOR_EMAIL belongs to a deleted account; choose a different address. No Director was created.');
      return { action: 'rejected', problems: ['deleted account'] };
    }
    user.passwordHash = passwordHash;
    user.passwordChangedAt = new Date();
    user.status = 'active';
    user.emailVerifiedAt = user.emailVerifiedAt || new Date();
    user.lockedUntil = null;
    user.failedLoginCount = 0;
    await RefreshSession.updateMany(
      { user: user._id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokeReason: 'director_bootstrap' } },
    );
    action = 'promoted';
  }

  const staff = await assignDirectorRole(user);
  await AuditLog.create({
    actor: null,
    actorName: 'Server start-up',
    action: 'director.bootstrapped',
    entityType: 'Staff',
    entityId: String(staff._id),
    metadata: { email: address, source: 'env', mode: action },
  });
  logger?.info('Club Director account is ready. Sign in with DIRECTOR_EMAIL, then remove DIRECTOR_PASSWORD from the environment.', {
    email: address,
    mode: action,
  });
  return { action, userId: user._id, staffId: staff._id };
}
