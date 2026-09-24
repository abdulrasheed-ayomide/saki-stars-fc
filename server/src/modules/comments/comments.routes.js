import { Router } from 'express';
import { z } from 'zod';
import { Comment, News, Match } from '../../models/index.js';
import { COMMENT_STATUSES } from '../../models/Content.js';
import { validate } from '../../middleware/validate.js';
import { idParams, objectId, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { idString } from '../../utils/ids.js';
import { getPaging, findPaged } from '../../utils/pagination.js';
import { publicComment } from '../../serializers/index.js';
import { getSettings } from '../../services/settings.service.js';

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const LINK = /(https?:\/\/|www\.)\S+/gi;
const BANNED = /\b(viagra|casino|crypto\s*giveaway|loan\s*offer|whatsapp\s*me|betting\s*tips)\b/i;

/** Simple anti-spam heuristics. Suspicious comments are held for moderation, not rejected. */
function spamCheck(body, recentBodies) {
  const links = (body.match(LINK) || []).length;
  if (links >= 2) return 'Contains several links';
  if (BANNED.test(body)) return 'Contains spam keywords';
  if (/(.)\1{9,}/.test(body)) return 'Repeated characters';
  const letters = body.replace(/[^A-Za-z]/g, '');
  if (letters.length > 20 && letters === letters.toUpperCase()) return 'All capitals';
  if (recentBodies.includes(body.trim().toLowerCase())) return 'Duplicate of a recent comment';
  return '';
}

async function assertTarget(targetType, targetId) {
  if (targetType === 'news') {
    const n = await News.findOne({ _id: targetId, status: 'published', deletedAt: null }).select('allowComments').lean();
    if (!n) throw AppError.notFound('Article not found.');
    if (n.allowComments === false) throw AppError.forbidden('Comments are closed on this article.');
  } else {
    const m = await Match.exists({ _id: targetId, deletedAt: null });
    if (!m) throw AppError.notFound('Match not found.');
  }
}

export function createCommentRouters({ auth, audit, notifications, limiters }) {
  const pub = Router();
  const admin = Router();

  const targetQuery = z.object({ targetType: z.enum(['news', 'match']), targetId: objectId, ...pagingQuery });

  // Anyone can read approved comments. Signed-in users also see their own pending ones.
  pub.get('/', auth.optionalAuth, validate({ query: targetQuery }), async (req, res) => {
    const { targetType, targetId } = req.valid.query;
    const viewer = req.auth?.user?._id;
    const filter = {
      targetType,
      targetId,
      $or: [{ status: 'approved' }, ...(viewer ? [{ user: viewer, status: { $in: ['pending', 'reported'] } }] : [])],
    };
    const result = await findPaged(Comment, filter, getPaging(req.valid.query, { defaultLimit: 50, maxLimit: 100 }), (q) => q.sort({ createdAt: 1 }));
    res.json({ data: { ...result, items: result.items.map((c) => publicComment(c, viewer)) } });
  });

  const createSchema = z.object({
    targetType: z.enum(['news', 'match']),
    targetId: objectId,
    parent: objectId.nullable().optional(),
    body: z.string().trim().min(2, 'Write a comment first.').max(2000),
  });

  pub.post('/', auth.requireAuth, auth.requireVerified, limiters.comments, validate({ body: createSchema }), async (req, res) => {
    const settings = await getSettings();
    if (settings.features?.comments === false) throw AppError.forbidden('Comments are turned off at the moment.');
    const { targetType, targetId, parent, body } = req.valid.body;
    await assertTarget(targetType, targetId);
    let parentDoc = null;
    if (parent) {
      parentDoc = await Comment.findOne({ _id: parent, targetType, targetId, status: 'approved', deletedAt: null }).lean();
      if (!parentDoc) throw AppError.validation([{ path: 'parent', message: 'The comment you are replying to is not available.' }]);
    }
    const recent = await Comment.find({ user: req.auth.user._id, createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } }).select('body').lean();
    const flag = spamCheck(body, recent.map((c) => c.body.trim().toLowerCase()));
    const comment = await Comment.create({
      targetType,
      targetId,
      parent: parentDoc ? parentDoc._id : null,
      user: req.auth.user._id,
      authorName: req.auth.user.name,
      body,
      status: flag ? 'pending' : 'approved',
      flaggedReason: flag,
    });
    await audit(req, { action: 'comment.created', entityType: 'Comment', entityId: comment._id, metadata: { targetType, targetId, held: Boolean(flag) } });
    if (flag) {
      await notifications.notifyPermission('comments.moderate', { type: 'comment.held', title: 'Comment held for moderation', body: flag, link: '/dashboard/comments?status=pending' });
    } else if (parentDoc && idString(parentDoc.user) !== idString(req.auth.user._id)) {
      const link = targetType === 'news' ? `/news/${(await News.findById(targetId).select('slug').lean())?.slug}#comments` : `/matches/${targetId}#comments`;
      await notifications.notify(parentDoc.user, { type: 'comment.reply', title: `${req.auth.user.name} replied to your comment`, body: body.slice(0, 140), link });
    }
    res.status(201).json({
      data: {
        ...publicComment(comment.toObject(), req.auth.user._id),
        held: Boolean(flag),
      },
    });
  });

  // Own comments can be edited for 15 minutes, and deleted at any time (soft delete).
  pub.patch('/:id', auth.requireAuth, auth.requireVerified, validate({ params: idParams, body: z.object({ body: z.string().trim().min(2).max(2000) }) }), async (req, res) => {
    const c = await Comment.findOne({ _id: req.valid.params.id, user: req.auth.user._id, deletedAt: null });
    if (!c) throw AppError.notFound('Comment not found.');
    if (Date.now() - c.createdAt.getTime() > EDIT_WINDOW_MS) throw AppError.forbidden('Comments can only be edited within 15 minutes of posting.');
    if (['hidden', 'rejected'].includes(c.status)) throw AppError.forbidden('This comment was moderated and cannot be edited.');
    const flag = spamCheck(req.valid.body.body, []);
    c.body = req.valid.body.body;
    c.editedAt = new Date();
    if (flag) {
      c.status = 'pending';
      c.flaggedReason = flag;
    }
    await c.save();
    await audit(req, { action: 'comment.edited', entityType: 'Comment', entityId: c._id });
    res.json({ data: publicComment(c.toObject(), req.auth.user._id) });
  });

  pub.delete('/:id', auth.requireAuth, validate({ params: idParams }), async (req, res) => {
    const c = await Comment.findOne({ _id: req.valid.params.id, user: req.auth.user._id, deletedAt: null });
    if (!c) throw AppError.notFound('Comment not found.');
    c.deletedAt = new Date();
    c.deletedBy = req.auth.user._id;
    await c.save();
    await audit(req, { action: 'comment.deleted_by_author', entityType: 'Comment', entityId: c._id });
    res.json({ data: { id: idString(c._id) } });
  });

  pub.post('/:id/report', auth.requireAuth, auth.requireVerified, limiters.comments, validate({ params: idParams, body: z.object({ reason: z.string().trim().min(3).max(300) }) }), async (req, res) => {
    const c = await Comment.findOne({ _id: req.valid.params.id, deletedAt: null, status: { $in: ['approved', 'reported'] } });
    if (!c) throw AppError.notFound('Comment not found.');
    if (idString(c.user) === idString(req.auth.user._id)) throw AppError.badRequest('You cannot report your own comment.');
    if (c.reports.some((r) => idString(r.user) === idString(req.auth.user._id))) {
      return res.json({ data: { message: 'You have already reported this comment. Thank you.' } });
    }
    c.reports.push({ user: req.auth.user._id, reason: req.valid.body.reason });
    // Reported comments stay visible until a moderator decides, unless several people report it.
    c.status = c.reports.length >= 3 ? 'reported' : c.status === 'approved' ? 'approved' : c.status;
    if (c.reports.length >= 3) c.flaggedReason = 'Reported by several users';
    await c.save();
    await audit(req, { action: 'comment.reported', entityType: 'Comment', entityId: c._id, metadata: { reports: c.reports.length } });
    if (c.reports.length === 1 || c.reports.length === 3) {
      await notifications.notifyPermission('comments.moderate', { type: 'comment.reported', title: 'A comment was reported', body: req.valid.body.reason, link: '/dashboard/comments?status=reported' });
    }
    res.json({ data: { message: 'Thank you. A moderator will review this comment.' } });
  });

  // ---- Moderation ---------------------------------------------------------------------
  admin.use(auth.requireAuth, auth.requireStaff, auth.requirePermission('comments.moderate'));

  admin.get('/', validate({ query: z.object({ status: z.enum([...COMMENT_STATUSES, 'flagged', 'all']).optional().default('flagged'), ...pagingQuery }) }), async (req, res) => {
    const { status } = req.valid.query;
    let filter = { deletedAt: null };
    if (status === 'flagged') filter = { deletedAt: null, $or: [{ status: { $in: ['pending', 'reported'] } }, { 'reports.0': { $exists: true }, status: 'approved' }] };
    else if (status !== 'all') filter.status = status;
    const result = await findPaged(Comment, filter, getPaging(req.valid.query, { defaultLimit: 30 }), (q) => q.sort({ createdAt: -1 }).populate('user', 'email status'));
    const newsIds = result.items.filter((c) => c.targetType === 'news').map((c) => c.targetId);
    const articles = await News.find({ _id: { $in: newsIds } }).select('title slug').lean();
    const titles = new Map(articles.map((a) => [idString(a._id), a]));
    res.json({
      data: {
        ...result,
        items: result.items.map((c) => ({
          id: idString(c._id),
          body: c.body,
          authorName: c.authorName,
          author: c.user ? { id: idString(c.user._id), email: c.user.email, status: c.user.status } : null,
          status: c.status,
          flaggedReason: c.flaggedReason,
          reports: c.reports.map((r) => ({ reason: r.reason, at: r.at })),
          targetType: c.targetType,
          target:
            c.targetType === 'news'
              ? { id: idString(c.targetId), title: titles.get(idString(c.targetId))?.title || 'Article', link: `/news/${titles.get(idString(c.targetId))?.slug || ''}` }
              : { id: idString(c.targetId), title: 'Match', link: `/matches/${c.targetId}` },
          createdAt: c.createdAt,
          moderationNote: c.moderationNote,
        })),
      },
    });
  });

  admin.post(
    '/:id/moderate',
    validate({ params: idParams, body: z.object({ status: z.enum(['approved', 'hidden', 'rejected']), note: z.string().trim().max(300).optional().default(''), clearReports: z.boolean().optional().default(true) }) }),
    async (req, res) => {
      const c = await Comment.findOne({ _id: req.valid.params.id, deletedAt: null });
      if (!c) throw AppError.notFound('Comment not found.');
      const before = c.status;
      c.status = req.valid.body.status;
      c.moderatedBy = req.auth.user._id;
      c.moderatedAt = new Date();
      c.moderationNote = req.valid.body.note;
      if (req.valid.body.clearReports && c.status === 'approved') {
        c.reports = [];
        c.flaggedReason = '';
      }
      await c.save();
      await audit(req, { action: 'comment.moderated', entityType: 'Comment', entityId: c._id, metadata: { before, after: c.status, note: c.moderationNote } });
      if (before !== c.status && ['hidden', 'rejected'].includes(c.status)) {
        await notifications.notify(c.user, { type: 'comment.moderated', title: 'Your comment was removed by a moderator', body: c.moderationNote || 'It did not meet the community rules.', link: '' });
      }
      res.json({ data: { id: idString(c._id), status: c.status } });
    },
  );

  admin.delete('/:id', validate({ params: idParams }), async (req, res) => {
    const c = await Comment.findOne({ _id: req.valid.params.id, deletedAt: null });
    if (!c) throw AppError.notFound('Comment not found.');
    c.deletedAt = new Date();
    c.deletedBy = req.auth.user._id;
    await c.save();
    await audit(req, { action: 'comment.deleted_by_moderator', entityType: 'Comment', entityId: c._id });
    res.json({ data: { id: idString(c._id) } });
  });

  // Block a user from commenting by suspending the account is done in Users; here we show counts.
  admin.get('/stats', async (req, res) => {
    const [pending, reported] = await Promise.all([
      Comment.countDocuments({ status: 'pending', deletedAt: null }),
      Comment.countDocuments({ deletedAt: null, $or: [{ status: 'reported' }, { 'reports.0': { $exists: true }, status: 'approved' }] }),
    ]);
    res.json({ data: { pending, reported } });
  });

  return { pub, admin };
}
