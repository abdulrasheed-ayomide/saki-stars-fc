import { Router } from 'express';
import { z } from 'zod';
import { News, Match, Player, Competition, Team } from '../../models/index.js';
import { NEWS_CATEGORIES } from '../../models/Content.js';
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, mediaInput, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { uniqueSlug, containsRegex } from '../../utils/text.js';
import { idString } from '../../utils/ids.js';
import { getPaging, findPaged } from '../../utils/pagination.js';
import { newsSummary, publicNews, adminNews } from '../../serializers/index.js';
import { has } from '../../auth/access.js';
import { MATCH_POPULATE } from '../football/teams.routes.js';

const LIST_POP = [
  { path: 'author', select: 'name' },
  { path: 'competition', select: 'name shortName slug logo type' },
  { path: 'team', select: 'name shortName slug logo isClubTeam' },
];
const FULL_POP = [
  ...LIST_POP,
  { path: 'relatedMatches', populate: MATCH_POPULATE },
  { path: 'relatedPlayers', select: 'firstName lastName knownAs slug jerseyNumber hideFullNamePublicly showOnWebsite deletedAt' },
];

/**
 * Workflow: draft -> review -> published -> archived.
 *   news.create  : write drafts, edit own drafts, submit for review
 *   news.edit    : edit anyone's article
 *   news.publish : publish, unpublish, archive
 *   news.delete  : soft-delete
 */
export function createNewsRouters({ auth, audit, config, notifications }) {
  const pub = Router();
  const admin = Router();

  // ---- Public -----------------------------------------------------------------------
  pub.get(
    '/',
    validate({ query: z.object({ category: z.enum(NEWS_CATEGORIES).optional(), competition: objectId.optional(), team: objectId.optional(), q: z.string().max(100).optional(), ...pagingQuery }) }),
    async (req, res) => {
      const { category, competition, team, q } = req.valid.query;
      const filter = { status: 'published', deletedAt: null, publishedAt: { $lte: new Date() } };
      if (category) filter.category = category;
      if (competition) filter.competition = competition;
      if (team) filter.team = team;
      if (q) filter.$or = [{ title: containsRegex(q) }, { excerpt: containsRegex(q) }];
      const result = await findPaged(News, filter, getPaging(req.valid.query, { defaultLimit: 12, maxLimit: 50 }), (qq) => qq.sort({ publishedAt: -1 }).populate(LIST_POP));
      res.json({ data: { ...result, items: result.items.map(newsSummary), categories: NEWS_CATEGORIES } });
    },
  );

  pub.get('/:slug', async (req, res) => {
    const slug = String(req.params.slug).toLowerCase().slice(0, 220);
    const article = await News.findOne({ slug, status: 'published', deletedAt: null, publishedAt: { $lte: new Date() } }).populate(FULL_POP).lean();
    if (!article) throw AppError.notFound('Article not found.');
    const related = await News.find({
      _id: { $ne: article._id },
      status: 'published',
      deletedAt: null,
      $or: [{ category: article.category }, ...(article.team ? [{ team: article.team._id }] : [])],
    })
      .sort({ publishedAt: -1 })
      .limit(3)
      .populate(LIST_POP)
      .lean();
    res.json({ data: { ...publicNews(article), related: related.map(newsSummary) } });
  });

  // ---- Admin ------------------------------------------------------------------------
  admin.use(auth.requireAuth, auth.requireStaff, auth.requirePermission('news.create', 'news.edit', 'news.publish', 'news.delete'));

  const articleSchema = z.object({
    title: z.string().trim().min(5, 'Enter a headline (at least 5 characters).').max(200),
    excerpt: z.string().trim().max(400).optional().default(''),
    content: z.string().trim().min(20, 'The article is too short.').max(50000),
    featuredImage: mediaInput(config),
    category: z.enum(NEWS_CATEGORIES).optional().default('Club News'),
    competition: objectId.nullable().optional(),
    team: objectId.nullable().optional(),
    relatedMatches: z.array(objectId).max(10).optional().default([]),
    relatedPlayers: z.array(objectId).max(30).optional().default([]),
    allowComments: z.boolean().optional().default(true),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]*$/, 'Use lowercase letters, numbers and dashes.').max(120).optional(),
  });

  async function checkRefs(body) {
    const problems = [];
    if (body.competition && !(await Competition.exists({ _id: body.competition }))) problems.push({ path: 'competition', message: 'Competition not found.' });
    if (body.team && !(await Team.exists({ _id: body.team }))) problems.push({ path: 'team', message: 'Team not found.' });
    if (body.relatedMatches.length && (await Match.countDocuments({ _id: { $in: body.relatedMatches } })) !== body.relatedMatches.length) problems.push({ path: 'relatedMatches', message: 'A related match was not found.' });
    if (body.relatedPlayers.length && (await Player.countDocuments({ _id: { $in: body.relatedPlayers } })) !== body.relatedPlayers.length) problems.push({ path: 'relatedPlayers', message: 'A related player was not found.' });
    if (problems.length) throw AppError.validation(problems);
  }

  function canEdit(auth, article) {
    if (has(auth, 'news.edit')) return true;
    return has(auth, 'news.create') && idString(article.author) === idString(auth.user._id) && ['draft', 'review'].includes(article.status);
  }

  admin.get(
    '/',
    validate({ query: z.object({ status: z.enum(['draft', 'review', 'published', 'archived']).optional(), q: z.string().max(100).optional(), mine: z.enum(['true']).optional(), ...pagingQuery }) }),
    async (req, res) => {
      const { status, q, mine } = req.valid.query;
      const filter = { deletedAt: null };
      if (status) filter.status = status;
      if (q) filter.title = containsRegex(q);
      // Writers without news.edit/publish only see their own work.
      if (mine || (!has(req.auth, 'news.edit') && !has(req.auth, 'news.publish'))) filter.author = req.auth.user._id;
      const result = await findPaged(News, filter, getPaging(req.valid.query, { defaultLimit: 30 }), (qq) => qq.sort({ updatedAt: -1 }).populate(LIST_POP));
      res.json({ data: { ...result, items: result.items.map((n) => ({ ...adminNews(n), canEdit: canEdit(req.auth, n) })), categories: NEWS_CATEGORIES } });
    },
  );

  admin.get('/:id', validate({ params: idParams }), async (req, res) => {
    const article = await News.findOne({ _id: req.valid.params.id, deletedAt: null }).populate(FULL_POP).lean();
    if (!article) throw AppError.notFound('Article not found.');
    if (!has(req.auth, 'news.edit') && !has(req.auth, 'news.publish') && idString(article.author._id) !== idString(req.auth.user._id)) {
      throw AppError.forbidden('You can only open your own articles.');
    }
    res.json({ data: { ...adminNews(article), canEdit: canEdit(req.auth, { ...article, author: article.author._id }) } });
  });

  admin.post('/', auth.requirePermission('news.create', 'news.edit'), validate({ body: articleSchema }), async (req, res) => {
    const body = req.valid.body;
    await checkRefs(body);
    const article = await News.create({
      ...body,
      slug: await uniqueSlug(News, body.slug || body.title),
      author: req.auth.user._id,
      authorName: req.auth.user.name,
      status: 'draft',
      lastEditedBy: req.auth.user._id,
    });
    await audit(req, { action: 'news.created', entityType: 'News', entityId: article._id, metadata: { title: article.title } });
    res.status(201).json({ data: adminNews((await article.populate(FULL_POP)).toObject()) });
  });

  admin.put('/:id', validate({ params: idParams, body: articleSchema }), async (req, res) => {
    const article = await News.findOne({ _id: req.valid.params.id, deletedAt: null });
    if (!article) throw AppError.notFound('Article not found.');
    if (!canEdit(req.auth, article)) throw AppError.forbidden('You cannot edit this article.');
    const body = req.valid.body;
    await checkRefs(body);
    const wantedSlug = body.slug || (article.status === 'published' ? article.slug : body.title);
    // Published URLs stay stable unless a new slug is chosen deliberately.
    if (wantedSlug !== article.slug) article.slug = await uniqueSlug(News, wantedSlug, { excludeId: article._id });
    delete body.slug;
    article.set(body);
    article.lastEditedBy = req.auth.user._id;
    await article.save();
    await audit(req, { action: 'news.updated', entityType: 'News', entityId: article._id, metadata: { title: article.title, status: article.status } });
    res.json({ data: adminNews((await article.populate(FULL_POP)).toObject()) });
  });

  const transitions = {
    submit: { from: ['draft'], to: 'review', permission: ['news.create', 'news.edit'] },
    withdraw: { from: ['review'], to: 'draft', permission: ['news.create', 'news.edit'] },
    publish: { from: ['draft', 'review', 'archived'], to: 'published', permission: ['news.publish'] },
    unpublish: { from: ['published'], to: 'draft', permission: ['news.publish'] },
    archive: { from: ['published', 'draft', 'review'], to: 'archived', permission: ['news.publish'] },
  };

  admin.post(
    '/:id/:action',
    validate({ params: z.object({ id: objectId, action: z.enum(Object.keys(transitions)) }), body: z.object({ publishAt: z.coerce.date().optional() }).prefault({}) }),
    async (req, res) => {
      const { id, action } = req.valid.params;
      const t = transitions[action];
      if (!t.permission.some((p) => has(req.auth, p))) throw AppError.forbidden();
      const article = await News.findOne({ _id: id, deletedAt: null });
      if (!article) throw AppError.notFound('Article not found.');
      if (['submit', 'withdraw'].includes(action) && !canEdit(req.auth, article)) throw AppError.forbidden('You cannot change this article.');
      if (!t.from.includes(article.status)) throw AppError.conflict(`An article that is "${article.status}" cannot be moved with "${action}".`);
      article.status = t.to;
      if (action === 'submit') article.submittedAt = new Date();
      if (action === 'publish') article.publishedAt = req.valid.body?.publishAt || article.publishedAt || new Date();
      if (action === 'archive') article.archivedAt = new Date();
      await article.save();
      await audit(req, { action: `news.${action === 'publish' ? 'published' : action === 'archive' ? 'archived' : action}`, entityType: 'News', entityId: article._id, metadata: { title: article.title } });
      if (action === 'submit') {
        await notifications.notifyPermission('news.publish', {
          type: 'news.review',
          title: 'Article waiting for review',
          body: article.title,
          link: `/dashboard/news/${article._id}`,
        });
      }
      if (action === 'publish' && idString(article.author) !== idString(req.auth.user._id)) {
        await notifications.notify(article.author, { type: 'news.published', title: 'Your article was published', body: article.title, link: `/news/${article.slug}` });
      }
      res.json({ data: adminNews((await article.populate(FULL_POP)).toObject()) });
    },
  );

  admin.delete('/:id', auth.requirePermission('news.delete'), validate({ params: idParams }), async (req, res) => {
    const article = await News.findOne({ _id: req.valid.params.id, deletedAt: null });
    if (!article) throw AppError.notFound('Article not found.');
    article.deletedAt = new Date();
    article.deletedBy = req.auth.user._id;
    article.status = 'archived';
    await article.save();
    await audit(req, { action: 'news.deleted', entityType: 'News', entityId: article._id, metadata: { title: article.title } });
    res.json({ data: { id: idString(article._id) } });
  });

  return { pub, admin };
}
