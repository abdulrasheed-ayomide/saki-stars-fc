import { Router } from 'express';
import { z } from 'zod';
import { Notification, Announcement, User, Player, Staff, Team } from '../../models/index.js';
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { idString } from '../../utils/ids.js';
import { getPaging, findPaged } from '../../utils/pagination.js';

function view(n) {
  return { id: idString(n._id), type: n.type, title: n.title, body: n.body, link: n.link, readAt: n.readAt, createdAt: n.createdAt };
}

function announcementView(a) {
  return {
    id: idString(a._id),
    title: a.title,
    body: a.body,
    audience: a.audience,
    team: a.team && a.team._id ? { id: idString(a.team._id), name: a.team.name } : null,
    createdBy: a.createdBy?.name || '',
    recipientCount: a.recipientCount,
    createdAt: a.createdAt,
  };
}

/** Recipients for an announcement, resolved on the server from the chosen audience. */
async function audienceUserIds(audience, team) {
  if (audience === 'everyone') return (await User.find({ status: 'active', deletedAt: null }).select('_id').lean()).map((u) => u._id);
  if (audience === 'players') return (await User.find({ status: 'active', player: { $ne: null } }).select('_id').lean()).map((u) => u._id);
  if (audience === 'staff') {
    const staff = await Staff.find({ status: 'active', user: { $ne: null } }).select('user').lean();
    return staff.map((s) => s.user);
  }
  const [players, staff] = await Promise.all([
    Player.find({ team, user: { $ne: null }, deletedAt: null }).select('user').lean(),
    Staff.find({ status: 'active', user: { $ne: null }, $or: [{ team }, { assignedTeams: team }] }).select('user').lean(),
  ]);
  return [...players, ...staff].map((d) => d.user);
}

export function createNotificationRouters({ auth, audit, notifications }) {
  const mine = Router();
  const admin = Router();

  mine.use(auth.requireAuth);

  mine.get('/', validate({ query: z.object({ unread: z.enum(['true']).optional(), ...pagingQuery }) }), async (req, res) => {
    const filter = { recipient: req.auth.user._id };
    if (req.valid.query.unread) filter.readAt = null;
    const [result, unread] = await Promise.all([
      findPaged(Notification, filter, getPaging(req.valid.query, { defaultLimit: 20, maxLimit: 50 }), (q) => q.sort({ createdAt: -1 })),
      Notification.countDocuments({ recipient: req.auth.user._id, readAt: null }),
    ]);
    res.json({ data: { ...result, items: result.items.map(view), unread } });
  });

  mine.get('/unread-count', async (req, res) => {
    res.json({ data: { unread: await Notification.countDocuments({ recipient: req.auth.user._id, readAt: null }) } });
  });

  mine.post('/read-all', async (req, res) => {
    await Notification.updateMany({ recipient: req.auth.user._id, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ data: { unread: 0 } });
  });

  mine.post('/:id/read', validate({ params: idParams }), async (req, res) => {
    const n = await Notification.findOneAndUpdate({ _id: req.valid.params.id, recipient: req.auth.user._id }, { $set: { readAt: new Date() } }, { returnDocument: 'after' }).lean();
    if (!n) throw AppError.notFound('Notification not found.');
    res.json({ data: view(n) });
  });

  mine.delete('/:id', validate({ params: idParams }), async (req, res) => {
    await Notification.deleteOne({ _id: req.valid.params.id, recipient: req.auth.user._id });
    res.json({ data: { id: req.valid.params.id } });
  });

  // Announcements a user can see (Player Portal "Announcements").
  mine.get('/announcements', async (req, res) => {
    const user = req.auth.user;
    const audiences = ['everyone'];
    const or = [];
    if (user.player) {
      audiences.push('players');
      const p = await Player.findById(user.player).select('team').lean();
      if (p?.team) or.push({ audience: 'team', team: p.team });
    }
    if (req.auth.staff) {
      audiences.push('staff');
      const teams = [...req.auth.assignedTeams, ...(req.auth.staff.team ? [idString(req.auth.staff.team)] : [])];
      if (teams.length) or.push({ audience: 'team', team: { $in: teams } });
    }
    or.push({ audience: { $in: audiences } });
    const list = await Announcement.find({ $or: or, createdAt: { $gte: user.createdAt } }).sort({ createdAt: -1 }).limit(30).populate('team', 'name').populate('createdBy', 'name').lean();
    res.json({ data: list.map(announcementView) });
  });

  // ---- Announcements (staff) -----------------------------------------------------------
  admin.use(auth.requireAuth, auth.requireStaff, auth.requirePermission('announcements.send'));

  admin.get('/', validate({ query: z.object(pagingQuery) }), async (req, res) => {
    const result = await findPaged(Announcement, {}, getPaging(req.valid.query), (q) => q.sort({ createdAt: -1 }).populate('team', 'name').populate('createdBy', 'name'));
    res.json({ data: { ...result, items: result.items.map(announcementView) } });
  });

  admin.post(
    '/',
    validate({
      body: z
        .object({
          title: z.string().trim().min(3).max(200),
          body: z.string().trim().min(3).max(5000),
          audience: z.enum(['everyone', 'players', 'staff', 'team']),
          team: objectId.nullable().optional(),
        })
        .refine((a) => a.audience !== 'team' || a.team, { path: ['team'], message: 'Choose a team.' }),
    }),
    async (req, res) => {
      const body = req.valid.body;
      if (body.team && !(await Team.exists({ _id: body.team, isClubTeam: true }))) throw AppError.validation([{ path: 'team', message: 'Team not found.' }]);
      const recipients = await audienceUserIds(body.audience, body.team);
      const a = await Announcement.create({ ...body, team: body.audience === 'team' ? body.team : null, createdBy: req.auth.user._id, recipientCount: new Set(recipients.map(String)).size });
      await notifications.notify(recipients, { type: 'announcement', title: body.title, body: body.body.slice(0, 300), link: '/account/notifications' });
      await audit(req, { action: 'announcement.sent', entityType: 'Announcement', entityId: a._id, metadata: { audience: body.audience, recipients: a.recipientCount } });
      await a.populate([{ path: 'team', select: 'name' }, { path: 'createdBy', select: 'name' }]);
      res.status(201).json({ data: announcementView(a.toObject()) });
    },
  );

  return { mine, admin };
}
