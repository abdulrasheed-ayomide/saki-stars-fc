import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import {
  User,
  Player,
  PlayerApplication,
  StaffApplication,
  Comment,
  Notification,
  Team,
} from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';
import { ageOn } from '../../utils/text.js';
import { POSITIONS } from '../../models/Player.js';
import { STAFF_ROLE_KEYS, STAFF_ROLES } from '../../auth/permissions.js';
import { getSettings } from '../../services/settings.service.js';
import { buildSelf } from '../auth/auth.controller.js';
import { idString } from '../../utils/ids.js';

const phone = z.string().trim().min(7, 'Enter a phone number.').max(40).regex(/^[+0-9 ()-]+$/, 'Use digits, spaces, +, - and brackets only.');
const optionalText = (max) => z.string().trim().max(max).optional().default('');
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id.');

const playerApplicationSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Enter your first name.').max(60),
    lastName: z.string().trim().min(1, 'Enter your last name.').max(60),
    dateOfBirth: z.coerce.date({ error: 'Enter your date of birth.' }),
    nationality: optionalText(60),
    phone,
    address: optionalText(400),
    position: z.enum(POSITIONS, { error: 'Choose a position.' }),
    preferredFoot: z.enum(['left', 'right', 'both', '']).optional().default(''),
    preferredTeam: objectId.nullable().optional(),
    previousClubs: optionalText(1000),
    experience: optionalText(2000),
    statement: optionalText(2000),
    emergencyContact: z
      .object({ name: optionalText(120), relationship: optionalText(60), phone: z.string().trim().max(40).optional().default('') })
      
      .prefault({}),
    guardian: z
      .object({
        name: optionalText(120),
        relationship: optionalText(60),
        phone: z.string().trim().max(40).optional().default(''),
        email: z.string().trim().max(254).optional().default(''),
        consent: z.boolean().optional().default(false),
      })
      
      .prefault({}),
  })
  .superRefine((v, ctx) => {
    const age = ageOn(v.dateOfBirth);
    if (age === null || age < 5 || age > 60) ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'Enter a valid date of birth.' });
    if (age !== null && age < 18) {
      if (!v.guardian.name) ctx.addIssue({ code: 'custom', path: ['guardian', 'name'], message: 'A parent or guardian name is required for players under 18.' });
      if (!v.guardian.relationship) ctx.addIssue({ code: 'custom', path: ['guardian', 'relationship'], message: 'Enter the guardian’s relationship to the player.' });
      if (!v.guardian.phone) ctx.addIssue({ code: 'custom', path: ['guardian', 'phone'], message: 'Enter the guardian’s phone number.' });
      if (!v.guardian.consent) ctx.addIssue({ code: 'custom', path: ['guardian', 'consent'], message: 'A parent or guardian must give consent for players under 18.' });
    }
  });

const staffApplicationSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  requestedRole: z.enum(STAFF_ROLE_KEYS.filter((r) => r !== 'director'), { error: 'Choose a role.' }),
  phone,
  experience: optionalText(3000),
  qualifications: optionalText(2000),
  statement: optionalText(2000),
  preferredTeam: objectId.nullable().optional(),
});

const profileSchema = z.object({ name: z.string().trim().min(2).max(120) });

function applicationView(a, kind) {
  return {
    id: idString(a._id),
    kind,
    status: a.status,
    createdAt: a.createdAt,
    reviewedAt: a.reviewedAt || null,
    reviewNote: a.status === 'pending' ? '' : a.reviewNote || '',
    ...(kind === 'player'
      ? { position: a.position, preferredTeam: a.preferredTeam ? idString(a.preferredTeam) : null }
      : { requestedRole: a.requestedRole, requestedRoleLabel: STAFF_ROLES[a.requestedRole]?.label }),
  };
}

export function createAccountRouter({ auth, audit, notifications, limiters }) {
  const router = Router();
  router.use(auth.requireAuth);

  router.patch('/profile', validate({ body: profileSchema }), async (req, res) => {
    await User.updateOne({ _id: req.auth.user._id }, { $set: { name: req.valid.body.name } });
    await audit(req, { action: 'account.profile_updated', entityType: 'User', entityId: req.auth.user._id });
    res.json({ data: await buildSelf(req.auth.user._id) });
  });

  // Re-accept updated Terms / Privacy Policy (version tracking).
  router.post('/consents', async (req, res) => {
    const settings = await getSettings({ fresh: true });
    const consents = {
      termsVersion: settings.legal?.terms?.version || '1.0',
      privacyVersion: settings.legal?.privacy?.version || '1.0',
      acceptedAt: new Date(),
    };
    await User.updateOne({ _id: req.auth.user._id }, { $set: { consents } });
    await audit(req, { action: 'account.consents_accepted', entityType: 'User', entityId: req.auth.user._id, metadata: consents });
    res.json({ data: { consents } });
  });

  // Data subject access: a copy of the personal data the platform holds about this user.
  router.get('/data-export', async (req, res) => {
    const userId = req.auth.user._id;
    const [user, player, playerApps, staffApps, comments, notes] = await Promise.all([
      User.findById(userId).lean(),
      req.auth.user.player ? Player.findById(req.auth.user.player).lean() : null,
      PlayerApplication.find({ user: userId }).lean(),
      StaffApplication.find({ user: userId }).lean(),
      Comment.find({ user: userId }).select('targetType targetId body status createdAt editedAt deletedAt').lean(),
      Notification.find({ recipient: userId }).select('type title body createdAt readAt').lean(),
    ]);
    await audit(req, { action: 'account.data_exported', entityType: 'User', entityId: userId });
    // Remove credentials and internal counters from the export.
    const strip = (doc) => {
      const out = { ...doc };
      for (const key of ['passwordHash', 'emailVerifyTokenHash', 'emailVerifyExpiresAt', 'passwordResetTokenHash', 'passwordResetExpiresAt', 'failedLoginCount', 'lockedUntil', '__v']) delete out[key];
      return out;
    };
    res.set('Content-Disposition', 'attachment; filename="my-data.json"');
    res.json({
      data: {
        exportedAt: new Date(),
        account: strip(user),
        player: player ? { ...player, restricted: { ...player.restricted, internalNotes: undefined }, sensitive: undefined } : null,
        playerApplications: playerApps,
        staffApplications: staffApps,
        comments,
        notifications: notes,
      },
    });
  });

  router.post('/deletion-request', async (req, res) => {
    if (req.auth.user.deletionRequestedAt) return res.json({ data: { deletionRequestedAt: req.auth.user.deletionRequestedAt } });
    const at = new Date();
    await User.updateOne({ _id: req.auth.user._id }, { $set: { deletionRequestedAt: at } });
    await audit(req, { action: 'account.deletion_requested', entityType: 'User', entityId: req.auth.user._id });
    await notifications.notifyPermission('users.manage', {
      type: 'account.deletion_requested',
      title: 'Account deletion requested',
      body: `${req.auth.user.name} asked for their account and personal data to be deleted.`,
      link: `/dashboard/users/${req.auth.user._id}`,
    });
    res.json({ data: { deletionRequestedAt: at } });
  });

  router.delete('/deletion-request', async (req, res) => {
    await User.updateOne({ _id: req.auth.user._id }, { $set: { deletionRequestedAt: null } });
    await audit(req, { action: 'account.deletion_request_cancelled', entityType: 'User', entityId: req.auth.user._id });
    res.json({ data: { deletionRequestedAt: null } });
  });

  // ---- Applications ------------------------------------------------------------
  router.get('/applications', async (req, res) => {
    const [players, staff] = await Promise.all([
      PlayerApplication.find({ user: req.auth.user._id }).sort({ createdAt: -1 }).lean(),
      StaffApplication.find({ user: req.auth.user._id }).sort({ createdAt: -1 }).lean(),
    ]);
    res.json({ data: [...players.map((a) => applicationView(a, 'player')), ...staff.map((a) => applicationView(a, 'staff'))] });
  });

  router.post(
    '/applications/player',
    auth.requireVerified,
    limiters.applications,
    validate({ body: playerApplicationSchema }),
    async (req, res) => {
      const settings = await getSettings();
      if (settings.features?.playerApplications === false) throw AppError.forbidden('Player applications are closed at the moment.');
      if (req.auth.user.player) throw AppError.conflict('Your account is already linked to a player profile.');
      if (await PlayerApplication.exists({ user: req.auth.user._id, status: 'pending' })) {
        throw AppError.conflict('You already have a player application waiting for review.');
      }
      const body = req.valid.body;
      if (body.preferredTeam && !(await Team.exists({ _id: body.preferredTeam, isClubTeam: true, status: 'active' }))) {
        throw AppError.validation([{ path: 'preferredTeam', message: 'Choose one of the club’s teams.' }]);
      }
      const minor = ageOn(body.dateOfBirth) < 18;
      const app = await PlayerApplication.create({
        ...body,
        user: req.auth.user._id,
        isMinor: minor,
        guardian: minor
          ? {
              name: body.guardian.name,
              relationship: body.guardian.relationship,
              phone: body.guardian.phone,
              email: body.guardian.email,
              consentGivenAt: new Date(),
              consentPolicyVersion: settings.legal?.privacy?.version || '1.0',
            }
          : {},
      });
      await audit(req, { action: 'application.player_submitted', entityType: 'PlayerApplication', entityId: app._id, metadata: { minor } });
      await notifications.notifyPermission('applications.players.review', {
        type: 'application.player',
        title: 'New player application',
        body: `${body.firstName} ${body.lastName} applied to join as a ${body.position.toLowerCase()}.`,
        link: `/dashboard/applications/players/${app._id}`,
      });
      res.status(201).json({ data: applicationView(app.toObject(), 'player') });
    },
  );

  router.post(
    '/applications/staff',
    auth.requireVerified,
    limiters.applications,
    validate({ body: staffApplicationSchema }),
    async (req, res) => {
      const settings = await getSettings();
      if (settings.features?.staffApplications === false) throw AppError.forbidden('Staff applications are closed at the moment.');
      if (req.auth.user.role === 'staff') throw AppError.conflict('You are already a member of staff.');
      if (await StaffApplication.exists({ user: req.auth.user._id, status: 'pending' })) {
        throw AppError.conflict('You already have a staff application waiting for review.');
      }
      const app = await StaffApplication.create({ ...req.valid.body, user: req.auth.user._id });
      await audit(req, { action: 'application.staff_submitted', entityType: 'StaffApplication', entityId: app._id, metadata: { requestedRole: app.requestedRole } });
      await notifications.notifyPermission('applications.staff.review', {
        type: 'application.staff',
        title: 'New staff application',
        body: `${app.fullName} applied for the ${STAFF_ROLES[app.requestedRole].label} role.`,
        link: `/dashboard/applications/staff/${app._id}`,
      });
      res.status(201).json({ data: applicationView(app.toObject(), 'staff') });
    },
  );

  router.post('/applications/:kind/:id/withdraw', async (req, res) => {
    const Model = req.params.kind === 'player' ? PlayerApplication : req.params.kind === 'staff' ? StaffApplication : null;
    if (!Model || !/^[a-f0-9]{24}$/i.test(req.params.id)) throw AppError.notFound('Application not found.');
    const app = await Model.findOneAndUpdate(
      { _id: req.params.id, user: req.auth.user._id, status: 'pending' },
      { $set: { status: 'withdrawn' } },
      { returnDocument: 'after' },
    ).lean();
    if (!app) throw AppError.notFound('No pending application found.');
    await audit(req, { action: `application.${req.params.kind}_withdrawn`, entityType: Model.modelName, entityId: app._id });
    res.json({ data: applicationView(app, req.params.kind) });
  });

  return router;
}
