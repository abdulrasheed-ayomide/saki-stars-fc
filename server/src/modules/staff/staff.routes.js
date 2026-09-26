import { Router } from 'express';
import { z } from 'zod';
import { Staff, User, Team, Player } from '../../models/index.js';
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, mediaInput } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { idString } from '../../utils/ids.js';
import { containsRegex } from '../../utils/text.js';
import { publicStaff, adminStaff } from '../../serializers/index.js';
import { PERMISSIONS, PERMISSION_KEYS, SCOPE_ORDER, STAFF_ROLES, STAFF_ROLE_KEYS, DEFAULT_GRANTS } from '../../auth/permissions.js';
import { assertCanManageStaff, activeDirectorCount, validateGrants } from '../../auth/staffRules.js';
import { withTransaction } from '../../db/connection.js';

const POPULATE = [
  { path: 'team', select: 'name shortName slug logo isClubTeam' },
  { path: 'assignedTeams', select: 'name shortName slug logo isClubTeam' },
  { path: 'assignedPlayers', select: 'firstName lastName knownAs slug jerseyNumber hideFullNamePublicly' },
];

export function createStaffRouters({ auth, audit, config, media, tokens, notifications, email }) {
  const pub = Router();
  const admin = Router();

  // ---- Public -----------------------------------------------------------------------
  pub.get('/', validate({ query: z.object({ category: z.enum(['management', 'coaching', 'operations', 'medical', 'other']).optional() }) }), async (req, res) => {
    const filter = { showOnWebsite: true, status: 'active' };
    if (req.valid.query.category) filter.category = req.valid.query.category;
    const staff = await Staff.find(filter).sort({ displayOrder: 1, fullName: 1 }).populate('team', 'name shortName slug logo isClubTeam').lean();
    res.json({ data: staff.map(publicStaff) });
  });

  pub.get('/:id', validate({ params: idParams }), async (req, res) => {
    const s = await Staff.findOne({ _id: req.valid.params.id, showOnWebsite: true, status: 'active' }).populate('team', 'name shortName slug logo isClubTeam').lean();
    if (!s) throw AppError.notFound('Staff member not found.');
    res.json({ data: publicStaff(s) });
  });

  // ---- Admin ------------------------------------------------------------------------
  admin.use(auth.requireAuth, auth.requireStaff);

  // The permission catalogue, so the dashboard can render the access editor.
  admin.get('/permissions', (req, res) => {
    res.json({
      data: {
        permissions: PERMISSION_KEYS.map((key) => ({ key, ...PERMISSIONS[key] })),
        scopes: SCOPE_ORDER,
        roles: STAFF_ROLE_KEYS.map((key) => ({ key, ...STAFF_ROLES[key], defaultGrants: key === 'director' ? 'all' : DEFAULT_GRANTS[key] })),
      },
    });
  });

  const readPerms = auth.requirePermission('staff.view', 'staff.manage', 'staff.profiles.manage');

  admin.get(
    '/',
    readPerms,
    validate({ query: z.object({ q: z.string().max(100).optional(), role: z.string().max(30).optional(), status: z.enum(['active', 'suspended', 'removed']).optional() }) }),
    async (req, res) => {
      const { q, role, status } = req.valid.query;
      const filter = {};
      if (q) filter.fullName = containsRegex(q);
      if (role) filter.staffRole = role;
      if (status) filter.status = status;
      const list = await Staff.find(filter).sort({ status: 1, displayOrder: 1, fullName: 1 }).populate(POPULATE).lean();
      const users = await User.find({ _id: { $in: list.map((s) => s.user).filter(Boolean) } }).select('email status name').lean();
      const byId = new Map(users.map((u) => [idString(u._id), u]));
      res.json({ data: list.map((s) => adminStaff(s, byId.get(idString(s.user)))) });
    },
  );

  admin.get('/:id', readPerms, validate({ params: idParams }), async (req, res) => {
    const s = await Staff.findById(req.valid.params.id).populate(POPULATE).lean();
    if (!s) throw AppError.notFound('Staff member not found.');
    const user = s.user ? await User.findById(s.user).select('email status name lastLoginAt').lean() : null;
    res.json({ data: adminStaff(s, user) });
  });

  const profileSchema = z.object({
    fullName: z.string().trim().min(2).max(120),
    title: z.string().trim().max(120).optional().default(''),
    department: z.string().trim().max(120).optional().default(''),
    category: z.enum(['management', 'coaching', 'operations', 'medical', 'other']).optional().default('management'),
    team: objectId.nullable().optional(),
    bio: z.string().trim().max(3000).optional().default(''),
    background: z.string().trim().max(3000).optional().default(''),
    photo: mediaInput(config),
    dateJoined: z.coerce.date().nullable().optional(),
    showDateJoined: z.boolean().optional().default(false),
    showOnWebsite: z.boolean().optional().default(false),
    displayOrder: z.number().int().min(0).max(1000).optional().default(100),
    privatePhone: z.string().trim().max(40).optional().default(''),
    internalNotes: z.string().trim().max(3000).optional().default(''),
  });

  // Public-only profile (e.g. a coach listed on the website who has no login).
  admin.post(
    '/',
    auth.requirePermission('staff.profiles.manage'),
    validate({ body: profileSchema.extend({ staffRole: z.enum([...STAFF_ROLE_KEYS.filter((r) => r !== 'director'), 'other']).optional().default('other') }) }),
    async (req, res) => {
      const s = await Staff.create({ ...req.valid.body, status: 'active', grants: [] });
      await audit(req, { action: 'staff.profile_created', entityType: 'Staff', entityId: s._id, metadata: { fullName: s.fullName, showOnWebsite: s.showOnWebsite } });
      res.status(201).json({ data: adminStaff(s.toObject()) });
    },
  );

  admin.put('/:id/profile', auth.requirePermission('staff.profiles.manage'), validate({ params: idParams, body: profileSchema }), async (req, res) => {
    const s = await Staff.findById(req.valid.params.id);
    if (!s) throw AppError.notFound('Staff member not found.');
    if (s.staffRole === 'director' && !req.auth.isDirector && idString(s.user) !== idString(req.auth.user._id)) {
      throw AppError.forbidden('Only a Director can edit a Director’s profile.');
    }
    const oldPhoto = s.photo?.publicId;
    const before = { showOnWebsite: s.showOnWebsite };
    s.set(req.valid.body);
    await s.save();
    if (oldPhoto && oldPhoto !== req.valid.body.photo?.publicId) await media.destroy({ publicId: oldPhoto });
    await audit(req, { action: 'staff.profile_updated', entityType: 'Staff', entityId: s._id, metadata: { before, showOnWebsite: s.showOnWebsite } });
    await s.populate(POPULATE);
    res.json({ data: adminStaff(s.toObject()) });
  });

  const accessSchema = z.object({
    staffRole: z.enum(STAFF_ROLE_KEYS),
    title: z.string().trim().max(120).optional(),
    grants: z.array(z.object({ permission: z.enum(PERMISSION_KEYS), scope: z.enum(SCOPE_ORDER) })).max(PERMISSION_KEYS.length).optional(),
    useDefaultGrants: z.boolean().optional().default(false),
    assignedTeams: z.array(objectId).max(50).optional().default([]),
    assignedPlayers: z.array(objectId).max(500).optional().default([]),
  });

  async function checkAssignments(body) {
    if (body.assignedTeams.length && (await Team.countDocuments({ _id: { $in: body.assignedTeams }, isClubTeam: true })) !== body.assignedTeams.length) {
      throw AppError.validation([{ path: 'assignedTeams', message: 'Assigned teams must be club teams.' }]);
    }
    if (body.assignedPlayers.length && (await Player.countDocuments({ _id: { $in: body.assignedPlayers } })) !== body.assignedPlayers.length) {
      throw AppError.validation([{ path: 'assignedPlayers', message: 'One of the assigned players no longer exists.' }]);
    }
  }

  function grantsFor(body) {
    if (body.staffRole === 'director') return [];
    if (body.useDefaultGrants || !body.grants) return DEFAULT_GRANTS[body.staffRole] ?? [];
    return validateGrants(body.grants);
  }

  admin.put('/:id/access', auth.requirePermission('staff.manage'), validate({ params: idParams, body: accessSchema }), async (req, res) => {
    const s = await Staff.findById(req.valid.params.id);
    if (!s) throw AppError.notFound('Staff member not found.');
    if (!s.user) throw AppError.badRequest('This is a public profile without a login, so it has no access to change.');
    const body = req.valid.body;
    const grants = grantsFor(body);
    assertCanManageStaff(req.auth, s, { newRole: body.staffRole, grants });
    if (s.staffRole === 'director' && body.staffRole !== 'director' && (await activeDirectorCount({ excludeStaffId: s._id })) === 0) {
      throw AppError.conflict('The club must always have at least one active Director.');
    }
    await checkAssignments(body);
    const before = { staffRole: s.staffRole, grants: s.grants.map((g) => `${g.permission}:${g.scope}`), assignedTeams: s.assignedTeams.map(String) };
    s.staffRole = body.staffRole;
    if (body.title !== undefined) s.title = body.title;
    s.grants = grants;
    s.assignedTeams = body.assignedTeams;
    s.assignedPlayers = body.assignedPlayers;
    await s.save();
    await audit(req, {
      action: 'staff.access_changed',
      entityType: 'Staff',
      entityId: s._id,
      metadata: { fullName: s.fullName, before, after: { staffRole: s.staffRole, grants: grants.map((g) => `${g.permission}:${g.scope}`), assignedTeams: body.assignedTeams } },
    });
    await notifications.notify(s.user, {
      type: 'staff.access_changed',
      title: 'Your staff access was updated',
      body: `Your role is now ${STAFF_ROLES[s.staffRole].label}. Your permissions or assignments may have changed.`,
      link: '/dashboard',
    });
    await s.populate(POPULATE);
    res.json({ data: adminStaff(s.toObject()) });
  });

  // Appoint an existing registered user as staff (the Director's "invite/create staff" route).
  admin.post(
    '/appoint',
    auth.requirePermission('staff.manage'),
    validate({ body: accessSchema.extend({ email: z.string().trim().toLowerCase().email(), fullName: z.string().trim().max(120).optional() }) }),
    async (req, res) => {
      const body = req.valid.body;
      const user = await User.findOne({ email: body.email, deletedAt: null });
      if (!user) throw AppError.validation([{ path: 'email', message: 'No account uses this email. Ask the person to register first.' }]);
      if (!user.emailVerifiedAt || user.status !== 'active') throw AppError.validation([{ path: 'email', message: 'This account must be active with a confirmed email address.' }]);
      if (idString(user._id) === idString(req.auth.user._id)) throw AppError.forbidden('You cannot appoint yourself.', 'SELF_MODIFICATION');
      const existing = await Staff.findOne({ user: user._id });
      if (existing && existing.status === 'active') throw AppError.conflict('This person is already an active staff member.');
      const grants = grantsFor(body);
      assertCanManageStaff(req.auth, { staffRole: existing?.staffRole ?? 'other' }, { newRole: body.staffRole, grants });
      await checkAssignments(body);

      const staff = await withTransaction(async (session) => {
        let doc = existing;
        const fields = {
          fullName: body.fullName || user.name,
          staffRole: body.staffRole,
          title: body.title ?? STAFF_ROLES[body.staffRole].label,
          grants,
          assignedTeams: body.assignedTeams,
          assignedPlayers: body.assignedPlayers,
          status: 'active',
        };
        if (doc) {
          doc.set(fields);
          await doc.save({ session });
        } else {
          // Same default as approving a staff application: senior roles are public, others private.
          [doc] = await Staff.create([{ ...fields, user: user._id, showOnWebsite: STAFF_ROLES[body.staffRole].publicByDefault }], { session });
        }
        await User.updateOne({ _id: user._id }, { $set: { role: 'staff', staff: doc._id } }, { session });
        return doc;
      });
      await audit(req, { action: 'staff.appointed', entityType: 'Staff', entityId: staff._id, metadata: { user: user._id, staffRole: body.staffRole, grants: grants.map((g) => `${g.permission}:${g.scope}`) } });
      await notifications.notify(user._id, { type: 'staff.appointed', title: 'You have been added to the club staff', body: `Role: ${STAFF_ROLES[body.staffRole].label}.`, link: '/dashboard' });
      await email.sendStaffApprovalEmail(user, { approved: true, roleLabel: STAFF_ROLES[body.staffRole].label });
      await staff.populate(POPULATE);
      res.status(201).json({ data: adminStaff(staff.toObject(), user) });
    },
  );

  const statusSchema = z.object({ reason: z.string().trim().min(5, 'Give a short reason.').max(500) });

  async function changeStatus(req, res, next, status) {
    const s = await Staff.findById(req.valid.params.id);
    if (!s) throw AppError.notFound('Staff member not found.');
    assertCanManageStaff(req.auth, s);
    if (status !== 'active' && s.staffRole === 'director' && s.status === 'active' && (await activeDirectorCount({ excludeStaffId: s._id })) === 0) {
      throw AppError.conflict('The club must always have at least one active Director.');
    }
    const before = s.status;
    s.status = status;
    if (status === 'removed') s.showOnWebsite = false;
    await s.save();
    if (s.user) {
      if (status !== 'active') await tokens.revokeAllForUser(s.user, `staff_${status}`);
      if (status === 'removed') {
        // Access is removed; the account continues as a normal (or player) account.
        const user = await User.findById(s.user);
        if (user) {
          user.role = user.player ? 'player' : 'user';
          user.staff = null;
          await user.save();
        }
      }
      await notifications.notify(s.user, {
        type: 'staff.status',
        title: status === 'active' ? 'Your staff access was restored' : status === 'suspended' ? 'Your staff access is suspended' : 'Your staff access was removed',
        body: req.valid.body?.reason || '',
        link: '/account',
      });
    }
    await audit(req, { action: `staff.${status === 'active' ? 'reactivated' : status}`, entityType: 'Staff', entityId: s._id, metadata: { fullName: s.fullName, before, reason: req.valid.body?.reason } });
    await s.populate(POPULATE);
    res.json({ data: adminStaff(s.toObject()) });
  }

  admin.post('/:id/suspend', auth.requirePermission('staff.manage'), validate({ params: idParams, body: statusSchema }), (req, res, next) => changeStatus(req, res, next, 'suspended'));
  admin.post('/:id/reactivate', auth.requirePermission('staff.manage'), validate({ params: idParams, body: statusSchema.partial() }), async (req, res, next) => {
    const s = await Staff.findById(req.valid.params.id).lean();
    if (s?.status === 'removed' && s.user) {
      const user = await User.findById(s.user);
      if (user) {
        user.role = 'staff';
        user.staff = s._id;
        await user.save();
      }
    }
    return changeStatus(req, res, next, 'active');
  });
  admin.post('/:id/remove', auth.requirePermission('staff.manage'), validate({ params: idParams, body: statusSchema }), (req, res, next) => changeStatus(req, res, next, 'removed'));

  // Public-only profiles can be deleted; profiles with a login are removed instead (history kept).
  admin.delete('/:id', auth.requirePermission('staff.profiles.manage'), validate({ params: idParams }), async (req, res) => {
    const s = await Staff.findById(req.valid.params.id).lean();
    if (!s) throw AppError.notFound('Staff member not found.');
    if (s.user) throw AppError.conflict('This staff member has a login. Remove their staff access instead of deleting the record.');
    await Staff.deleteOne({ _id: s._id });
    await media.destroy(s.photo);
    await audit(req, { action: 'staff.profile_deleted', entityType: 'Staff', entityId: s._id, metadata: { fullName: s.fullName } });
    res.json({ data: { id: idString(s._id) } });
  });

  return { pub, admin };
}
