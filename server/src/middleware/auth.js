import { User, Staff } from '../models/index.js';
import { resolveGrants } from '../auth/permissions.js';
import { AppError } from '../utils/AppError.js';

/**
 * Authentication + authorisation middleware.
 *
 * Every protected request re-reads the account from the database, so suspension,
 * deactivation, password changes, session revocation and permission changes take
 * effect immediately, not when the access token expires.
 */
export function createAuthMiddleware({ tokens, audit }) {
  async function resolveAuth(req) {
    const header = req.get('authorization') || '';
    if (!header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();

    let payload;
    try {
      payload = tokens.verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') throw AppError.unauthorized('Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
      throw AppError.unauthorized('Your session is not valid. Please sign in again.', 'INVALID_TOKEN');
    }

    const user = await User.findById(payload.sub).lean();
    if (!user || user.deletedAt) throw AppError.unauthorized('Your session is not valid. Please sign in again.', 'INVALID_TOKEN');
    if (!['active', 'pending'].includes(user.status)) {
      throw AppError.unauthorized('This account is not active. Contact the club if you think this is a mistake.', 'ACCOUNT_INACTIVE');
    }
    if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
      throw AppError.unauthorized('Your password was changed. Please sign in again.', 'SESSION_REVOKED');
    }
    if (!(await tokens.isFamilyActive(payload.sid))) {
      throw AppError.unauthorized('This session was signed out. Please sign in again.', 'SESSION_REVOKED');
    }

    let staffRecord = null;
    if (user.role === 'staff' && user.staff) staffRecord = await Staff.findById(user.staff).lean();
    const staff = staffRecord && staffRecord.status === 'active' ? staffRecord : null;
    const grants = staff ? resolveGrants(staff) : new Map();

    return {
      user,
      sessionId: payload.sid,
      staff,
      staffRecord,
      grants,
      isDirector: Boolean(staff && staff.staffRole === 'director'),
      assignedTeams: new Set((staff?.assignedTeams || []).map(String)),
      assignedPlayers: new Set((staff?.assignedPlayers || []).map(String)),
      isVerified: Boolean(user.emailVerifiedAt),
    };
  }

  /** Attaches req.auth when a valid token is sent; anonymous otherwise. Never rejects. */
  async function optionalAuth(req, res, next) {
    try {
      req.auth = await resolveAuth(req);
    } catch {
      req.auth = null;
    }
    next();
  }

  async function requireAuth(req, res, next) {
    req.auth = await resolveAuth(req);
    if (!req.auth) throw AppError.unauthorized();
    next();
  }

  function requireVerified(req, res, next) {
    if (!req.auth?.isVerified) {
      throw AppError.forbidden('Please confirm your email address first. Check your inbox for the link.', 'EMAIL_NOT_VERIFIED');
    }
    next();
  }

  async function requireStaff(req, res, next) {
    if (!req.auth?.staff) {
      await audit(req, { action: 'access.denied', status: 'denied', metadata: { reason: 'not_staff', path: req.originalUrl.split('?')[0] } });
      throw AppError.forbidden('This area is for club staff only.');
    }
    next();
  }

  function requirePlayer(req, res, next) {
    if (!req.auth?.user.player) {
      throw AppError.forbidden('This area is for registered club players only.');
    }
    next();
  }

  /**
   * Requires a permission. When `anyOf` is given, any one of them is enough.
   * The broadest matching scope is placed on req.scope for the handler to apply.
   */
  function requirePermission(...permissions) {
    return async function permissionGuard(req, res, next) {
      const auth = req.auth;
      if (!auth) throw AppError.unauthorized();
      if (!auth.staff) {
        await audit(req, { action: 'access.denied', status: 'denied', metadata: { permission: permissions.join('|'), path: req.path } });
        throw AppError.forbidden();
      }
      for (const permission of permissions) {
        const scope = auth.grants.get(permission);
        if (scope) {
          req.scope = scope;
          req.permission = permission;
          return next();
        }
      }
      await audit(req, { action: 'access.denied', status: 'denied', metadata: { permission: permissions.join('|'), path: req.path } });
      throw AppError.forbidden();
    };
  }

  return { resolveAuth, optionalAuth, requireAuth, requireVerified, requireStaff, requirePlayer, requirePermission };
}
