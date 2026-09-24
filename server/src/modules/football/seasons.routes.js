import { Router } from 'express';
import { z } from 'zod';
import { Season, Match, Competition } from '../../models/index.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { seasonSummary } from '../../serializers/index.js';
import { withTransaction } from '../../db/connection.js';

const seasonSchema = z
  .object({
    name: z.string().trim().min(4, 'Enter a season name such as 2026/27.').max(40),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isCurrent: z.boolean().optional().default(false),
    status: z.enum(['upcoming', 'active', 'completed', 'archived']).optional().default('active'),
  })
  .refine((s) => s.endDate > s.startDate, { path: ['endDate'], message: 'The end date must be after the start date.' });

export async function currentSeason() {
  return (
    (await Season.findOne({ isCurrent: true }).lean()) ||
    (await Season.findOne({ startDate: { $lte: new Date() }, endDate: { $gte: new Date() } }).sort({ startDate: -1 }).lean()) ||
    (await Season.findOne().sort({ startDate: -1 }).lean())
  );
}

export function createSeasonRouters({ auth, audit }) {
  const pub = Router();
  const admin = Router();

  pub.get('/', async (req, res) => {
    const seasons = await Season.find({ status: { $ne: 'archived' } }).sort({ startDate: -1 }).lean();
    res.json({ data: seasons.map(seasonSummary) });
  });

  admin.use(auth.requireAuth, auth.requireStaff, auth.requirePermission('competitions.manage'));

  admin.get('/', async (req, res) => {
    const seasons = await Season.find().sort({ startDate: -1 }).lean();
    const counts = await Promise.all(seasons.map((s) => Match.countDocuments({ season: s._id, deletedAt: null })));
    res.json({ data: seasons.map((s, i) => ({ ...seasonSummary(s), matchCount: counts[i] })) });
  });

  async function save(req, res, id) {
    const body = req.valid.body;
    const dup = await Season.exists({ name: body.name, ...(id ? { _id: { $ne: id } } : {}) });
    if (dup) throw AppError.conflict('A season with this name already exists.');
    const season = await withTransaction(async (session) => {
      if (body.isCurrent) await Season.updateMany({ isCurrent: true, ...(id ? { _id: { $ne: id } } : {}) }, { $set: { isCurrent: false } }, { session });
      if (id) {
        const doc = await Season.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after', runValidators: true, session }).lean();
        if (!doc) throw AppError.notFound('Season not found.');
        return doc;
      }
      const [doc] = await Season.create([body], { session });
      return doc.toObject();
    });
    await audit(req, { action: id ? 'season.updated' : 'season.created', entityType: 'Season', entityId: season._id, metadata: { name: season.name, isCurrent: season.isCurrent } });
    res.status(id ? 200 : 201).json({ data: seasonSummary(season) });
  }

  admin.post('/', validate({ body: seasonSchema }), (req, res) => save(req, res));
  admin.put('/:id', validate({ params: idParams, body: seasonSchema }), (req, res) => save(req, res, req.valid.params.id));

  admin.delete('/:id', validate({ params: idParams }), async (req, res) => {
    const id = req.valid.params.id;
    if (await Match.exists({ season: id })) {
      throw AppError.conflict('This season has matches, so it cannot be deleted. Archive it instead to keep the history.');
    }
    const season = await Season.findByIdAndDelete(id).lean();
    if (!season) throw AppError.notFound('Season not found.');
    await Competition.updateMany({}, { $pull: { seasons: season._id } });
    await Competition.updateMany({ currentSeason: season._id }, { $set: { currentSeason: null } });
    await audit(req, { action: 'season.deleted', entityType: 'Season', entityId: id, metadata: { name: season.name } });
    res.json({ data: { id } });
  });

  return { pub, admin };
}
