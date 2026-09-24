import { User, Staff, Player, RefreshSession } from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { hashPassword, verifyPassword, passwordProblems, getDummyHash } from '../../auth/password.js';
import { REFRESH_COOKIE } from '../../services/token.service.js';
import { resolveGrants } from '../../auth/permissions.js';
import { selfUser } from '../../serializers/index.js';
import { getSettings } from '../../services/settings.service.js';

const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;
const VERIFY_TTL_MS = 24 * 3600 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

const GENERIC_EMAIL_SENT = 'If an account exists for that address, we have sent an email with the next steps.';

/** The current user as the frontend needs it: account, staff role, permissions, player link. */
export async function buildSelf(userOrId) {
  const user = userOrId._id ? userOrId : await User.findById(userOrId).lean();
  const staff = user.staff ? await Staff.findById(user.staff).lean() : null;
  const activeStaff = staff && staff.status === 'active' && user.role === 'staff' ? staff : null;
  const player = user.player ? await Player.findById(user.player).select('slug firstName lastName knownAs hideFullNamePublicly').lean() : null;
  const grants = activeStaff ? [...resolveGrants(activeStaff).entries()].map(([permission, scope]) => ({ permission, scope })) : [];
  return selfUser(user, { staff: activeStaff, grants, player });
}

export function createAuthController({ config, tokens, email, audit, notifications }) {
  const rounds = config.auth.bcryptRounds;

  async function startEmailVerification(user) {
    const token = randomToken(32);
    await User.updateOne(
      { _id: user._id },
      { $set: { emailVerifyTokenHash: sha256(token), emailVerifyExpiresAt: new Date(Date.now() + VERIFY_TTL_MS) } },
    );
    await email.sendVerificationEmail(user, token);
  }

  async function respondWithSession(req, res, user, status = 200) {
    const { accessToken, refreshToken } = await tokens.issueSession(user, { req });
    tokens.setRefreshCookie(res, refreshToken);
    res.status(status).json({ data: { accessToken, user: await buildSelf(user) } });
  }

  return {
    async register(req, res) {
      const { name, email: address, password } = req.valid.body;
      const problems = passwordProblems(password, { email: address, name });
      if (problems.length) throw AppError.validation([{ path: 'password', message: problems.join(' ') }]);

      const existing = await User.findOne({ email: address }).lean();
      if (existing) {
        // Do not reveal that the email is registered, and never create a second account for it.
        await audit(req, { action: 'auth.register_existing', entityType: 'User', entityId: existing._id, actor: existing, metadata: { status: existing.status } });
        await email.sendSecurityNotification(existing, {
          heading: 'Someone tried to register with your email',
          message:
            existing.status === 'deactivated'
              ? 'An account with this email address already exists but was deactivated. To use it again, contact the club and ask for it to be reactivated. A new account cannot be created with the same email.'
              : 'An account with this email address already exists. You can sign in, or use "Forgot password" if you cannot remember your password.',
        });
        return res.status(202).json({ data: { message: 'Check your email to confirm your address and finish signing up.' } });
      }

      const settings = await getSettings();
      const user = await User.create({
        name,
        email: address,
        passwordHash: await hashPassword(password, rounds),
        consents: {
          termsVersion: settings.legal?.terms?.version || '1.0',
          privacyVersion: settings.legal?.privacy?.version || '1.0',
          acceptedAt: new Date(),
        },
      });
      await startEmailVerification(user);
      await audit(req, { action: 'auth.register', entityType: 'User', entityId: user._id, actor: user });
      return res.status(202).json({ data: { message: 'Check your email to confirm your address and finish signing up.' } });
    },

    async verifyEmail(req, res) {
      const hash = sha256(req.valid.body.token);
      const user = await User.findOne({ emailVerifyTokenHash: hash }).select('+emailVerifyTokenHash +emailVerifyExpiresAt');
      if (!user || !user.emailVerifyExpiresAt || user.emailVerifyExpiresAt < new Date()) {
        throw AppError.badRequest('This confirmation link is invalid or has expired. Request a new one.', undefined);
      }
      user.emailVerifiedAt = new Date();
      user.emailVerifyTokenHash = null;
      user.emailVerifyExpiresAt = null;
      if (user.status === 'pending') user.status = 'active';
      await user.save();
      await audit(req, { action: 'auth.email_verified', entityType: 'User', entityId: user._id, actor: user });
      res.json({ data: { message: 'Your email address is confirmed. You can now sign in.' } });
    },

    async resendVerification(req, res) {
      const user = await User.findOne({ email: req.valid.body.email, deletedAt: null }).lean();
      if (user && !user.emailVerifiedAt && ['pending', 'active'].includes(user.status)) {
        await startEmailVerification(user);
      }
      res.status(202).json({ data: { message: GENERIC_EMAIL_SENT } });
    },

    async login(req, res) {
      const { email: address, password } = req.valid.body;
      const user = await User.findOne({ email: address }).select('+passwordHash +failedLoginCount +lockedUntil');
      const invalid = () => AppError.unauthorized('The email or password is incorrect.', 'INVALID_CREDENTIALS');

      if (!user || user.deletedAt) {
        await verifyPassword(password, await getDummyHash(rounds));
        await audit(req, { action: 'auth.login_failed', status: 'failure', metadata: { reason: 'unknown_email' } });
        throw invalid();
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        await audit(req, { action: 'auth.login_blocked', status: 'denied', entityType: 'User', entityId: user._id, actor: user, metadata: { reason: 'locked' } });
        throw new AppError(429, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again after ${LOCK_MINUTES} minutes, or reset your password.`);
      }

      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) {
        user.failedLoginCount = (user.failedLoginCount || 0) + 1;
        let locked = false;
        if (user.failedLoginCount >= MAX_FAILED_LOGINS) {
          user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
          user.failedLoginCount = 0;
          locked = true;
        }
        await user.save();
        await audit(req, { action: 'auth.login_failed', status: 'failure', entityType: 'User', entityId: user._id, actor: user, metadata: { reason: 'bad_password', locked } });
        if (locked) {
          await email.sendSecurityNotification(user, {
            heading: 'Sign-in temporarily locked',
            message: `There were ${MAX_FAILED_LOGINS} failed attempts to sign in to your account, so sign-in is paused for ${LOCK_MINUTES} minutes.`,
          });
        }
        throw invalid();
      }

      if (!['active', 'pending'].includes(user.status)) {
        await audit(req, { action: 'auth.login_blocked', status: 'denied', entityType: 'User', entityId: user._id, actor: user, metadata: { reason: user.status } });
        const messages = {
          suspended: 'This account is suspended. Contact the club for help.',
          deactivated: 'This account has been deactivated. Contact the club if you want it reactivated.',
          rejected: 'This account is not active. Contact the club for help.',
        };
        throw AppError.forbidden(messages[user.status] || messages.rejected, 'ACCOUNT_INACTIVE');
      }

      user.failedLoginCount = 0;
      user.lockedUntil = null;
      user.lastLoginAt = new Date();
      await user.save();
      await audit(req, { action: 'auth.login', entityType: 'User', entityId: user._id, actor: user });
      return respondWithSession(req, res, user.toObject());
    },

    async refresh(req, res) {
      // No refresh cookie simply means "not signed in": answer normally so browsers
      // do not log an error on every page view by anonymous visitors.
      if (!req.cookies?.[REFRESH_COOKIE]) return res.json({ data: null });
      const outcome = await tokens.rotate(req.cookies[REFRESH_COOKIE], req);
      if (outcome.result === 'reuse') {
        const user = await User.findById(outcome.session.user).lean();
        await audit(req, {
          action: 'auth.refresh_token_reuse',
          status: 'denied',
          entityType: 'User',
          entityId: outcome.session.user,
          actor: user,
          metadata: { familyId: outcome.session.familyId },
        });
        if (user) {
          await notifications.notify(user._id, {
            type: 'security',
            title: 'A session was signed out for your safety',
            body: 'An old sign-in token was used again, which can mean it was copied. That session has been signed out.',
            link: '/account/security',
          });
          await email.sendSecurityNotification(user, {
            heading: 'Suspicious sign-in activity',
            message: 'An old sign-in token for your account was used again, which can mean it was copied. We signed out that session.',
          });
        }
        tokens.clearRefreshCookie(res);
        throw AppError.unauthorized('Your session has ended. Please sign in again.', 'SESSION_REVOKED');
      }
      if (outcome.result !== 'ok') {
        // Expired or unknown cookie: clear it and report "not signed in".
        tokens.clearRefreshCookie(res);
        return res.json({ data: null });
      }
      const user = await User.findById(outcome.userId).lean();
      if (!user || user.deletedAt || !['active', 'pending'].includes(user.status)) {
        await tokens.revokeFamily(outcome.familyId, 'account_inactive');
        tokens.clearRefreshCookie(res);
        throw AppError.unauthorized('This account is not active.', 'ACCOUNT_INACTIVE');
      }
      tokens.setRefreshCookie(res, outcome.refreshToken);
      res.json({ data: { accessToken: outcome.accessToken, user: await buildSelf(user) } });
    },

    async logout(req, res) {
      const token = req.cookies?.[REFRESH_COOKIE];
      if (token) {
        const session = await RefreshSession.findOne({ tokenHash: sha256(String(token).slice(0, 200)) }).lean();
        if (session) {
          await tokens.revokeFamily(session.familyId, 'logout');
          await audit(req, { action: 'auth.logout', entityType: 'User', entityId: session.user, actor: { _id: session.user } });
        }
      }
      tokens.clearRefreshCookie(res);
      res.json({ data: { message: 'Signed out.' } });
    },

    async logoutAll(req, res) {
      await tokens.revokeAllForUser(req.auth.user._id, 'logout_all');
      tokens.clearRefreshCookie(res);
      await audit(req, { action: 'auth.logout_all', entityType: 'User', entityId: req.auth.user._id });
      res.json({ data: { message: 'Signed out on every device.' } });
    },

    async forgotPassword(req, res) {
      const user = await User.findOne({ email: req.valid.body.email, deletedAt: null }).lean();
      if (user && ['active', 'pending'].includes(user.status)) {
        const token = randomToken(32);
        await User.updateOne(
          { _id: user._id },
          { $set: { passwordResetTokenHash: sha256(token), passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS) } },
        );
        await email.sendPasswordResetEmail(user, token);
        await audit(req, { action: 'auth.password_reset_requested', entityType: 'User', entityId: user._id, actor: user });
      }
      res.status(202).json({ data: { message: GENERIC_EMAIL_SENT } });
    },

    async resetPassword(req, res) {
      const { token, password } = req.valid.body;
      const user = await User.findOne({ passwordResetTokenHash: sha256(token) }).select('+passwordResetTokenHash +passwordResetExpiresAt');
      if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date() || !['active', 'pending'].includes(user.status)) {
        throw AppError.badRequest('This reset link is invalid or has expired. Request a new one.');
      }
      const problems = passwordProblems(password, { email: user.email, name: user.name });
      if (problems.length) throw AppError.validation([{ path: 'password', message: problems.join(' ') }]);

      user.passwordHash = await hashPassword(password, rounds);
      user.passwordResetTokenHash = null;
      user.passwordResetExpiresAt = null;
      user.passwordChangedAt = new Date();
      user.failedLoginCount = 0;
      user.lockedUntil = null;
      // Following the emailed link proves the user controls the address.
      if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
      if (user.status === 'pending') user.status = 'active';
      await user.save();
      await tokens.revokeAllForUser(user._id, 'password_reset');
      await audit(req, { action: 'auth.password_reset', entityType: 'User', entityId: user._id, actor: user });
      await email.sendSecurityNotification(user, {
        heading: 'Your password was changed',
        message: 'The password for your account was just reset, and all devices were signed out.',
      });
      res.json({ data: { message: 'Your password has been changed. Please sign in with your new password.' } });
    },

    async changePassword(req, res) {
      const { currentPassword, newPassword } = req.valid.body;
      const user = await User.findById(req.auth.user._id).select('+passwordHash');
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        await audit(req, { action: 'auth.password_change_failed', status: 'failure', entityType: 'User', entityId: user._id });
        throw AppError.validation([{ path: 'currentPassword', message: 'Your current password is incorrect.' }]);
      }
      const problems = passwordProblems(newPassword, { email: user.email, name: user.name });
      if (problems.length) throw AppError.validation([{ path: 'newPassword', message: problems.join(' ') }]);

      user.passwordHash = await hashPassword(newPassword, rounds);
      user.passwordChangedAt = new Date();
      await user.save();
      // Sign out every other device; keep this one by issuing a fresh session.
      await tokens.revokeAllForUser(user._id, 'password_changed');
      await audit(req, { action: 'auth.password_changed', entityType: 'User', entityId: user._id });
      await email.sendSecurityNotification(user, {
        heading: 'Your password was changed',
        message: 'The password for your account was changed. Other devices have been signed out.',
      });
      const { accessToken, refreshToken } = await tokens.issueSession(user, { req });
      tokens.setRefreshCookie(res, refreshToken);
      res.json({ data: { accessToken, message: 'Password changed. Other devices have been signed out.' } });
    },

    async me(req, res) {
      res.json({ data: await buildSelf(req.auth.user) });
    },

    async sessions(req, res) {
      const list = await tokens.listSessions(req.auth.user._id);
      res.json({ data: list.map((s) => ({ ...s, current: s.id === req.auth.sessionId })) });
    },

    async revokeSession(req, res) {
      const owns = await RefreshSession.exists({ familyId: req.params.id, user: req.auth.user._id });
      if (!owns) throw AppError.notFound('Session not found.');
      await tokens.revokeFamily(req.params.id, 'revoked_by_user');
      await audit(req, { action: 'auth.session_revoked', entityType: 'User', entityId: req.auth.user._id });
      res.json({ data: { message: 'That device has been signed out.' } });
    },
  };
}
