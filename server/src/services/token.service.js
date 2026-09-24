import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { RefreshSession } from '../models/index.js';
import { randomToken, sha256 } from '../utils/crypto.js';

export const REFRESH_COOKIE = 'ssfc_rt';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
// Two tabs refreshing at the same moment is normal; only reuse after this window is treated as theft.
const ROTATION_GRACE_MS = 15_000;

export function createTokenService(config) {
  const { jwtSecret, accessTokenTtlMinutes, refreshTokenTtlDays, cookieSecure, cookieSameSite, cookieDomain } = config.auth;

  function signAccessToken(user, familyId) {
    return jwt.sign({ sub: String(user._id), sid: familyId, typ: 'access' }, jwtSecret, {
      algorithm: 'HS256',
      expiresIn: `${accessTokenTtlMinutes}m`,
      issuer: 'sakistarsfc',
    });
  }

  function verifyAccessToken(token) {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], issuer: 'sakistarsfc' });
    if (payload.typ !== 'access') throw new Error('wrong token type');
    return payload;
  }

  function cookieOptions(maxAgeMs) {
    return {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      domain: cookieDomain,
      path: REFRESH_COOKIE_PATH,
      ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
    };
  }

  function setRefreshCookie(res, token) {
    res.cookie(REFRESH_COOKIE, token, cookieOptions(refreshTokenTtlDays * 24 * 3600 * 1000));
  }

  function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }

  async function issueSession(user, { req, familyId = randomUUID() } = {}) {
    const refreshToken = randomToken(48);
    await RefreshSession.create({
      user: user._id,
      familyId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + refreshTokenTtlDays * 24 * 3600 * 1000),
      userAgent: String(req?.get?.('user-agent') || '').slice(0, 300),
      ip: String(req?.ip || '').slice(0, 64),
    });
    return { refreshToken, accessToken: signAccessToken(user, familyId), familyId };
  }

  /**
   * Exchanges a refresh token for a new pair.
   * Returns { result: 'ok', ... } | { result: 'invalid' } | { result: 'reuse', session }
   */
  async function rotate(refreshToken, req) {
    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length > 200) return { result: 'invalid' };
    const session = await RefreshSession.findOne({ tokenHash: sha256(refreshToken) });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return { result: 'invalid' };

    if (session.rotatedAt) {
      // Within a short grace window the same token may legitimately arrive twice (a reload
      // interrupted by a navigation, two tabs waking together). The browser may never have
      // stored the successor, so issue another token in the same family rather than signing out.
      if (Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS) {
        const next = await issueSession({ _id: session.user }, { req, familyId: session.familyId });
        return { result: 'ok', userId: session.user, ...next };
      }
      await revokeFamily(session.familyId, 'reuse_detected');
      return { result: 'reuse', session };
    }

    // Mark rotated atomically so two concurrent requests cannot both rotate the same token.
    const claimed = await RefreshSession.findOneAndUpdate(
      { _id: session._id, rotatedAt: null, revokedAt: null },
      { $set: { rotatedAt: new Date(), lastUsedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!claimed) {
      // Lost a concurrent rotation of the same token: same situation as the grace window above.
      const next = await issueSession({ _id: session.user }, { req, familyId: session.familyId });
      return { result: 'ok', userId: session.user, ...next };
    }

    const next = await issueSession({ _id: session.user }, { req, familyId: session.familyId });
    return { result: 'ok', userId: session.user, ...next };
  }

  async function revokeFamily(familyId, reason) {
    await RefreshSession.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: reason } });
  }

  async function revokeAllForUser(userId, reason) {
    await RefreshSession.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: reason } });
  }

  async function isFamilyActive(familyId) {
    return Boolean(await RefreshSession.exists({ familyId, revokedAt: null, expiresAt: { $gt: new Date() } }));
  }

  /** One entry per device/browser (family), newest activity first. */
  async function listSessions(userId) {
    const docs = await RefreshSession.find({ user: userId, revokedAt: null, rotatedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ lastUsedAt: -1 })
      .lean();
    return docs.map((d) => ({
      id: d.familyId,
      userAgent: d.userAgent,
      ip: d.ip,
      lastUsedAt: d.lastUsedAt,
      createdAt: d.createdAt,
      expiresAt: d.expiresAt,
    }));
  }

  return {
    signAccessToken,
    verifyAccessToken,
    setRefreshCookie,
    clearRefreshCookie,
    issueSession,
    rotate,
    revokeFamily,
    revokeAllForUser,
    isFamilyActive,
    listSessions,
  };
}
