import { Router } from 'express';
import { z } from 'zod';
import { PlayerApplication, StaffApplication, Player, Staff, User, Team } from '../../models/index.js';
import { POSITIONS } from '../../models/Player.js';
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { idString } from '../../utils/ids.js';
import { ageOn } from '../../utils/text.js';
import { getPaging, findPaged } from '../../utils/pagination.js';
import { withTransaction } from '../../db/connection.js';
import { PERMISSION_KEYS, SCOPE_ORDER, STAFF_ROLES, STAFF_ROLE_KEYS, DEFAULT_GRANTS } from '../../auth/permissions.js';
import { assertCanManageStaff, validateGrants } from '../../auth/staffRules.js';

function reviewer(a) {
  return a.reviewedBy && a.reviewedBy.name ? { name: a.reviewedBy.name } : null;
}

function playerAppView(a, { full = false } = {}) {
  const base = {
    id: idString(a._id),
    status: a.status,
    firstName: a.firstName,
    lastName: a.lastName,
    position: a.position,
    isMinor: Boolean(a.isMinor),
    preferredTeam: a.preferredTeam && a.preferredTeam._id ? { id: idString(a.preferredTeam._id), name: a.preferredTeam.name } : null,
    user: a.user && a.user._id ? { id: idString(a.user._id), email: a.user.email, name: a.user.name } : null,
    createdAt: a.createdAt,
    reviewedAt: a.reviewedAt,
    reviewedBy: reviewer(a),
    reviewNote: a.reviewNote || '',
    player: a.player ? idString(a.player) : null,
  };
  if (!full) return base;
  return {
    ...base,
    dateOfBirth: a.dateOfBirth,
    age: ageOn(a.dateOfBirth),
    nationality: a.nationality,
    phone: a.phone,
    address: a.address,
    preferredFoot: a.preferredFoot,
    previousClubs: a.previousClubs,
    experience: a.experience,
    statement: a.statement,
    emergencyContact: a.emergencyContact || {},
    guardian: a.guardian || {},
  };
}

function staffAppView(a, { full = false } = {}) {
  const base = {
    id: idString(a._id),
    status: a.status,
    fullName: a.fullName,
    requestedRole: a.requestedRole,
    requestedRoleLabel: STAFF_ROLES[a.requestedRole]?.label,
    user: a.user && a.user._id ? { id: idString(a.user._id), email: a.user.email, name: a.user.name } : null,
    createdAt: a.createdAt,
    reviewedAt: a.reviewedAt,
    reviewedBy: reviewer(a),
    reviewNote: a.reviewNote || '',
    assignedRole: a.assignedRole,
  };
  if (!full) return base;
  return {
    ...base,
    phone: a.phone,
    experience: a.experience,
    qualifications: a.qualifications,
    statement: a.statement,
    preferredTeam: a.preferredTeam && a.preferredTeam._id ? { id: idString(a.preferredTeam._id), name: a.preferredTeam.name } : null,
  };
}

const POP = [
  { path: 'user', select: 'email name status' },
  { path: 'preferredTeam', select: 'name' },
  { path: 'reviewedBy', select: 'name' },
];

export function createApplicationsRouter({ auth, audit, notifications, email }) {
  const router = Router();
  router.use(auth.requireAuth, auth.requireStaff);

  const listQuery = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'withdrawn', 'all']).optional().default('pending'), ...pagingQuery });
  const rejectSchema = z.object({ note: z.string().trim().max(2000).optional().default('') });

  // ---- Player applications ----------------------------------------------------------
  const players = Router();
  players.use(auth.requirePermission('applications.players.review'));

  players.get('/', validate({ query: listQuery }), async (req, res) => {
    const { status } = req.valid.query;
    const filter = status === 'all' ? {} : { status };
    const result = await findPaged(PlayerApplication, filter, getPaging(req.valid.query), (q) => q.sort({ createdAt: status === 'pending' ? 1 : -1 }).populate(POP));
    res.json({ data: { ...result, items: result.items.map((a) => playerAppView(a)) } });
  });

  players.get('/:id', validate({ params: idParams }), async (req, res) => {
    const a = await PlayerApplication.findById(req.valid.params.id).populate(POP).lean();
    if (!a) throw AppError.notFound('Application not found.');
    await audit(req, { action: 'application.player_viewed', entityType: 'PlayerApplication', entityId: a._id });
    res.json({ data: playerAppView(a, { full: true }) });
  });

  const approvePlayerSchema = z.object({
    team: objectId.nullable().optional(),
    position: z.enum(POSITIONS).optional(),
    jerseyNumber: z.number().int().min(1).max(99).nullable().optional(),
    linkPlayer: objectId.nullable().optional(), // link to an existing player record instead of creating one
    showOnWebsite: z.boolean().optional().default(true),
    note: z.string().trim().max(2000).optional().default(''),
  });

  players.post('/:id/approve', validate({ params: idParams, body: approvePlayerSchema }), async (req, res) => {
    const body = req.valid.body;
    const app = await PlayerApplication.findById(req.valid.params.id);
    if (!app || app.status !== 'pending') throw AppError.conflict('This application is no longer pending.');
    const user = await User.findById(app.user);
    if (!user || !['active', 'pending'].includes(user.status)) throw AppError.conflict('The applicant’s account is not active.');
    if (user.player) throw AppError.conflict('The applicant is already linked to a player profile.');
    if (body.team && !(await Team.exists({ _id: body.team, isClubTeam: true }))) throw AppError.validation([{ path: 'team', message: 'Choose one of the club’s teams.' }]);

    const restricted = {
      dateOfBirth: app.dateOfBirth,
      phone: app.phone,
      email: user.email,
      address: app.address,
      emergencyContact: app.emergencyContact,
      guardian: app.guardian,
    };

    const player = await withTransaction(async (session) => {
      let p;
      if (body.linkPlayer) {
        p = await Player.findOne({ _id: body.linkPlayer, deletedAt: null }).session(session ?? null);
        if (!p) throw AppError.validation([{ path: 'linkPlayer', message: 'Player record not found.' }]);
        if (p.user) throw AppError.validation([{ path: 'linkPlayer', message: 'That player record is already linked to an account.' }]);
        p.user = user._id;
        p.restricted = { ...p.restricted.toObject(), ...restricted, documents: p.restricted.documents };
        p.isMinor = Boolean(app.isMinor);
        if (body.team !== undefined) p.team = body.team;
        await p.save({ session });
      } else {
        [p] = await Player.create(
          [
            {
              user: user._id,
              firstName: app.firstName,
              lastName: app.lastName,
              position: body.position || app.position,
              jerseyNumber: body.jerseyNumber ?? null,
              team: body.team ?? app.preferredTeam ?? null,
              nationality: app.nationality,
              preferredFoot: app.preferredFoot,
              showOnWebsite: body.showOnWebsite,
              isMinor: Boolean(app.isMinor),
              // Minors show the minimum publicly until the club decides otherwise.
              hideFullNamePublicly: Boolean(app.isMinor),
              joinedAt: new Date(),
              restricted,
              createdBy: req.auth.user._id,
            },
          ],
          { session },
        );
      }
      user.player = p._id;
      if (user.role === 'user') user.role = 'player';
      await user.save({ session });
      app.status = 'approved';
      app.reviewedBy = req.auth.user._id;
      app.reviewedAt = new Date();
      app.reviewNote = body.note;
      app.player = p._id;
      await app.save({ session });
      return p;
    });

    await audit(req, { action: 'application.player_approved', entityType: 'PlayerApplication', entityId: app._id, metadata: { player: player._id, user: user._id, linked: Boolean(body.linkPlayer) } });
    await notifications.notify(user._id, { type: 'application.approved', title: 'Your player application was approved', body: 'Welcome to the club. Your Player Portal is ready.', link: '/portal' });
    await email.sendPlayerApprovalEmail(user, { approved: true, note: body.note });
    res.json({ data: { id: idString(app._id), status: app.status, player: idString(player._id) } });
  });

  players.post('/:id/reject', validate({ params: idParams, body: rejectSchema }), async (req, res) => {
    const app = await PlayerApplication.findOneAndUpdate(
      { _id: req.valid.params.id, status: 'pending' },
      { $set: { status: 'rejected', reviewedBy: req.auth.user._id, reviewedAt: new Date(), reviewNote: req.valid.body.note } },
      { returnDocument: 'after' },
    ).lean();
    if (!app) throw AppError.conflict('This application is no longer pending.');
    const user = await User.findById(app.user).lean();
    await audit(req, { action: 'application.player_rejected', entityType: 'PlayerApplication', entityId: app._id });
    if (user) {
      await notifications.notify(user._id, { type: 'application.rejected', title: 'Player application update', body: 'Your player application was not accepted this time.', link: '/account/applications' });
      await email.sendPlayerApprovalEmail(user, { approved: false, note: req.valid.body.note });
    }
    res.json({ data: { id: idString(app._id), status: app.status } });
  });

  // ---- Staff applications -----------------------------------------------------------
  const staff = Router();
  staff.use(auth.requirePermission('applications.staff.review'));

  staff.get('/', validate({ query: listQuery }), async (req, res) => {
    const { status } = req.valid.query;
    const filter = status === 'all' ? {} : { status };
    const result = await findPaged(StaffApplication, filter, getPaging(req.valid.query), (q) => q.sort({ createdAt: status === 'pending' ? 1 : -1 }).populate(POP));
    res.json({ data: { ...result, items: result.items.map((a) => staffAppView(a)) } });
  });

  staff.get('/:id', validate({ params: idParams }), async (req, res) => {
    const a = await StaffApplication.findById(req.valid.params.id).populate(POP).lean();
    if (!a) throw AppError.notFound('Application not found.');
    res.json({ data: staffAppView(a, { full: true }) });
  });

  const approveStaffSchema = z.object({
    staffRole: z.enum(STAFF_ROLE_KEYS),
    title: z.string().trim().max(120).optional(),
    grants: z.array(z.object({ permission: z.enum(PERMISSION_KEYS), scope: z.enum(SCOPE_ORDER) })).optional(),
    assignedTeams: z.array(objectId).max(50).optional().default([]),
    assignedPlayers: z.array(objectId).max(500).optional().default([]),
    showOnWebsite: z.boolean().optional(),
    note: z.string().trim().max(2000).optional().default(''),
  });

  staff.post('/:id/approve', validate({ params: idParams, body: approveStaffSchema }), async (req, res) => {
    const body = req.valid.body;
    const app = await StaffApplication.findById(req.valid.params.id);
    if (!app || app.status !== 'pending') throw AppError.conflict('This application is no longer pending.');
    const user = await User.findById(app.user);
    if (!user || user.status !== 'active') throw AppError.conflict('The applicant’s account is not active.');
    if (idString(user._id) === idString(req.auth.user._id)) throw AppError.forbidden('You cannot approve your own application.', 'SELF_MODIFICATION');
    const grants = body.staffRole === 'director' ? [] : body.grants ? validateGrants(body.grants) : DEFAULT_GRANTS[body.staffRole] ?? [];
    assertCanManageStaff(req.auth, { staffRole: 'other' }, { newRole: body.staffRole, grants });
    if (body.assignedTeams.length && (await Team.countDocuments({ _id: { $in: body.assignedTeams }, isClubTeam: true })) !== body.assignedTeams.length) {
      throw AppError.validation([{ path: 'assignedTeams', message: 'Assigned teams must be club teams.' }]);
    }

    const staffDoc = await withTransaction(async (session) => {
      let doc = await Staff.findOne({ user: user._id }).session(session ?? null);
      const fields = {
        fullName: app.fullName,
        staffRole: body.staffRole,
        title: body.title ?? STAFF_ROLES[body.staffRole].label,
        grants,
        assignedTeams: body.assignedTeams,
        assignedPlayers: body.assignedPlayers,
        status: 'active',
        showOnWebsite: body.showOnWebsite ?? STAFF_ROLES[body.staffRole].publicByDefault,
        privatePhone: app.phone,
        team: app.preferredTeam ?? null,
      };
      if (doc) {
        doc.set(fields);
        await doc.save({ session });
      } else {
        [doc] = await Staff.create([{ ...fields, user: user._id }], { session });
      }
      user.role = 'staff';
      user.staff = doc._id;
      await user.save({ session });
      app.status = 'approved';
      app.reviewedBy = req.auth.user._id;
      app.reviewedAt = new Date();
      app.reviewNote = body.note;
      app.assignedRole = body.staffRole;
      app.staff = doc._id;
      await app.save({ session });
      return doc;
    });

    const roleLabel = STAFF_ROLES[body.staffRole].label;
    await audit(req, {
      action: 'application.staff_approved',
      entityType: 'StaffApplication',
      entityId: app._id,
      metadata: { staff: staffDoc._id, user: user._id, staffRole: body.staffRole, grants: grants.map((g) => `${g.permission}:${g.scope}`) },
    });
    await notifications.notify(user._id, { type: 'application.approved', title: 'Your staff application was approved', body: `Your role: ${roleLabel}.`, link: '/dashboard' });
    await email.sendStaffApprovalEmail(user, { approved: true, roleLabel, note: body.note });
    res.json({ data: { id: idString(app._id), status: app.status, staff: idString(staffDoc._id) } });
  });

  staff.post('/:id/reject', validate({ params: idParams, body: rejectSchema }), async (req, res) => {
    const app = await StaffApplication.findOneAndUpdate(
      { _id: req.valid.params.id, status: 'pending' },
      { $set: { status: 'rejected', reviewedBy: req.auth.user._id, reviewedAt: new Date(), reviewNote: req.valid.body.note } },
      { returnDocument: 'after' },
    ).lean();
    if (!app) throw AppError.conflict('This application is no longer pending.');
    const user = await User.findById(app.user).lean();
    await audit(req, { action: 'application.staff_rejected', entityType: 'StaffApplication', entityId: app._id });
    if (user) {
      await notifications.notify(user._id, { type: 'application.rejected', title: 'Staff application update', body: 'Your staff application was not accepted this time.', link: '/account/applications' });
      await email.sendStaffApprovalEmail(user, { approved: false, note: req.valid.body.note });
    }
    res.json({ data: { id: idString(app._id), status: app.status } });
  });

  router.use('/players', players);
  router.use('/staff', staff);
  return router;
}
