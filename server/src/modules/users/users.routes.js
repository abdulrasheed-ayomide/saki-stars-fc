import { Router } from 'express';
import { z } from 'zod';
import {
  User,
  Staff,
  Player,
  PlayerApplication,
  StaffApplication,
  Comment,
  Notification,
  RefreshSession,
  AuditLog,
} from '../../models/index.js';
import { USER_STATUSES, USER_ROLES } from '../../models/User.js';
import { validate } from '../../middleware/validate.js';
import { idParams, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { idString } from '../../utils/ids.js';
import { containsRegex } from '../../utils/text.js';
import { randomToken } from '../../utils/crypto.js';
import { getPaging, findPaged } from '../../utils/pagination.js';
import { adminUser } from '../../serializers/index.js';
import { activeDirectorCount } from '../../auth/staffRules.js';
import { hashPassword } from '../../auth/password.js';
import { withTransaction } from '../../db/connection.js';

export function createUsersRouter({ auth, audit, tokens, email, media, config }) {
  const router = Router();
  router.use(auth.requireAuth, auth.requireStaff);

  router.get(
    '/',
    auth.requirePermission('users.view', 'users.manage'),
    validate({
      query: z.object({
        q: z.string().max(100).optional(),
        status: z.enum(USER_STATUSES).optional(),
        role: z.enum(USER_ROLES).optional(),
        deletionRequested: z.enum(['true']).optional(),
        ...pagingQuery,
      }),
    }),
    async (req, res) => {
      const { q, status, role, deletionRequested } = req.valid.query;
      const filter = { deletedAt: null };
      if (q) filter.$or = [{ name: containsRegex(q) }, { email: containsRegex(q) }];
      if (status) filter.status = status;
      if (role) filter.role = role;
      if (deletionRequested) filter.deletionRequestedAt = { $ne: null };
      const result = await findPaged(User, filter, getPaging(req.valid.query, { defaultLimit: 50 }), (qq) => qq.sort({ createdAt: -1 }));
      res.json({ data: { ...result, items: result.items.map(adminUser) } });
    },
  );

  router.get('/:id', auth.requirePermission('users.view', 'users.manage'), validate({ params: idParams }), async (req, res) => {
    const user = await User.findById(req.valid.params.id).lean();
    if (!user) throw AppError.notFound('User not found.');
    const [sessions, staff, playerApps, staffApps, recent] = await Promise.all([
      tokens.listSessions(user._id),
      user.staff ? Staff.findById(user.staff).select('staffRole title status').lean() : null,
      PlayerApplication.find({ user: user._id }).select('status createdAt').sort({ createdAt: -1 }).lean(),
      StaffApplication.find({ user: user._id }).select('status requestedRole createdAt').sort({ createdAt: -1 }).lean(),
      AuditLog.find({ actor: user._id }).sort({ createdAt: -1 }).limit(15).select('action status createdAt ip').lean(),
    ]);
    res.json({
      data: {
        ...adminUser(user),
        sessions,
        staff: staff ? { id: idString(staff._id), role: staff.staffRole, title: staff.title, status: staff.status } : null,
        applications: [
          ...playerApps.map((a) => ({ kind: 'player', id: idString(a._id), status: a.status, createdAt: a.createdAt })),
          ...staffApps.map((a) => ({ kind: 'staff', id: idString(a._id), status: a.status, role: a.requestedRole, createdAt: a.createdAt })),
        ],
        recentActivity: recent.map((a) => ({ action: a.action, status: a.status, at: a.createdAt, ip: a.ip })),
      },
    });
  });

  /** IT/user managers may act on ordinary accounts; staff accounts need staff.manage; Directors need a Director. */
  async function loadTarget(req) {
    const user = await User.findById(req.valid.params.id);
    if (!user || user.anonymizedAt) throw AppError.notFound('User not found.');
    if (idString(user._id) === idString(req.auth.user._id)) throw AppError.forbidden('You cannot change your own account status here.', 'SELF_MODIFICATION');
    const staff = user.staff ? await Staff.findById(user.staff).lean() : null;
    if (staff && staff.status === 'active') {
      if (!req.auth.grants.get('staff.manage')) throw AppError.forbidden('Staff accounts can only be changed by someone who manages staff.');
      if (staff.staffRole === 'director' && !req.auth.isDirector) throw AppError.forbidden('Only a Director can change another Director’s account.');
    }
    return { user, staff };
  }

  async function guardLastDirector(staff) {
    if (staff?.staffRole === 'director' && staff.status === 'active' && (await activeDirectorCount({ excludeStaffId: staff._id })) === 0) {
      throw AppError.conflict('The club must always have at least one active Director.');
    }
  }

  const reasonSchema = z.object({ reason: z.string().trim().min(5, 'Give a short reason.').max(500) });

  router.post('/:id/suspend', auth.requirePermission('users.manage'), validate({ params: idParams, body: reasonSchema }), async (req, res) => {
    const { user, staff } = await loadTarget(req);
    await guardLastDirector(staff);
    user.status = 'suspended';
    user.statusReason = req.valid.body.reason;
    user.statusChangedAt = new Date();
    user.statusChangedBy = req.auth.user._id;
    await user.save();
    await tokens.revokeAllForUser(user._id, 'suspended');
    await audit(req, { action: 'user.suspended', entityType: 'User', entityId: user._id, metadata: { reason: req.valid.body.reason } });
    await email.sendSecurityNotification(user, { heading: 'Your account has been suspended', message: `Reason: ${req.valid.body.reason}. Contact the club if you have questions.` });
    res.json({ data: adminUser(user.toObject()) });
  });

  router.post('/:id/reactivate', auth.requirePermission('users.manage'), validate({ params: idParams, body: reasonSchema.partial() }), async (req, res) => {
    const { user } = await loadTarget(req);
    if (!['suspended', 'deactivated', 'rejected'].includes(user.status)) throw AppError.conflict('This account is already active.');
    user.status = user.emailVerifiedAt ? 'active' : 'pending';
    user.statusReason = req.valid.body.reason || '';
    user.statusChangedAt = new Date();
    user.statusChangedBy = req.auth.user._id;
    user.deletedAt = null;
    await user.save();
    await audit(req, { action: 'user.reactivated', entityType: 'User', entityId: user._id, metadata: { reason: req.valid.body.reason } });
    res.json({ data: adminUser(user.toObject()) });
  });

  router.post('/:id/deactivate', auth.requirePermission('users.manage'), validate({ params: idParams, body: reasonSchema }), async (req, res) => {
    const { user, staff } = await loadTarget(req);
    await guardLastDirector(staff);
    user.status = 'deactivated';
    user.statusReason = req.valid.body.reason;
    user.statusChangedAt = new Date();
    user.statusChangedBy = req.auth.user._id;
    await user.save();
    await tokens.revokeAllForUser(user._id, 'deactivated');
    if (staff && staff.status === 'active') await Staff.updateOne({ _id: staff._id }, { $set: { status: 'suspended' } });
    await audit(req, { action: 'user.deactivated', entityType: 'User', entityId: user._id, metadata: { reason: req.valid.body.reason } });
    res.json({ data: adminUser(user.toObject()) });
  });

  router.post('/:id/revoke-sessions', auth.requirePermission('users.manage'), validate({ params: idParams }), async (req, res) => {
    const { user } = await loadTarget(req);
    await tokens.revokeAllForUser(user._id, 'revoked_by_admin');
    await audit(req, { action: 'user.sessions_revoked', entityType: 'User', entityId: user._id });
    res.json({ data: { message: 'All sessions for this user have been signed out.' } });
  });

  /**
   * Fulfils a deletion request: removes login and personal data, keeps legitimate club
   * history (match appearances stay with the player's football record; comments become
   * "Deleted user"). The email address becomes free for a new account.
   */
  router.post(
    '/:id/anonymize',
    auth.requirePermission('users.manage'),
    validate({ params: idParams, body: z.object({ confirm: z.literal('DELETE'), reason: z.string().trim().min(5).max(500) }) }),
    async (req, res) => {
      const { user, staff } = await loadTarget(req);
      await guardLastDirector(staff);
      const player = user.player ? await Player.findById(user.player) : null;
      const filesToDelete = player ? player.restricted.documents.map((d) => d.file) : [];
      const originalId = idString(user._id);

      await withTransaction(async (session) => {
        if (player) {
          player.user = undefined;
          player.restricted = { documents: [] };
          player.sensitive = {};
          await player.save({ session });
        }
        if (staff) {
          await Staff.updateOne({ _id: staff._id }, { $set: { status: 'removed', showOnWebsite: false, privatePhone: '', internalNotes: '' }, $unset: { user: 1 } }, { session });
        }
        await Comment.updateMany({ user: user._id }, { $set: { authorName: 'Deleted user', deletedAt: new Date(), deletedBy: req.auth.user._id } }, { session });
        await Notification.deleteMany({ recipient: user._id }, { session });
        await RefreshSession.deleteMany({ user: user._id }, { session });
        await PlayerApplication.deleteMany({ user: user._id }, { session });
        await StaffApplication.deleteMany({ user: user._id }, { session });
        await AuditLog.updateMany({ actor: user._id }, { $set: { actorName: 'Deleted user', actorEmail: '' } }, { session });
        user.email = `deleted-${originalId}@deleted.invalid`;
        user.name = 'Deleted user';
        user.passwordHash = await hashPassword(randomToken(32), config.auth.bcryptRounds);
        user.status = 'deactivated';
        user.role = 'user';
        user.player = null;
        user.staff = null;
        user.consents = {};
        user.anonymizedAt = new Date();
        user.deletedAt = new Date();
        user.deletedBy = req.auth.user._id;
        user.deletionRequestedAt = null;
        await user.save({ session });
      });
      for (const f of filesToDelete) await media.destroy(f);
      await audit(req, { action: 'user.anonymized', entityType: 'User', entityId: originalId, metadata: { reason: req.valid.body.reason, hadPlayer: Boolean(player), hadStaff: Boolean(staff) } });
      res.json({ data: { id: originalId, message: 'The account and its personal data have been removed. Club history was kept.' } });
    },
  );

  return router;
}
