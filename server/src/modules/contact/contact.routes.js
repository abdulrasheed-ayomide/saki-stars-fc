import { Router } from 'express';
import { z } from 'zod';
import { ContactMessage, NewsletterSubscriber } from '../../models/index.js';
import { validate } from '../../middleware/validate.js';
import { idParams, pagingQuery } from '../../validation/common.js';
import { AppError } from '../../utils/AppError.js';
import { idString } from '../../utils/ids.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { getPaging, findPaged } from '../../utils/pagination.js';
import { getSettings } from '../../services/settings.service.js';

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);

function messageView(m) {
  return {
    id: idString(m._id),
    name: m.name,
    email: m.email,
    phone: m.phone,
    subject: m.subject,
    message: m.message,
    status: m.status,
    emailForwarded: m.emailForwarded,
    handledBy: m.handledBy?.name || '',
    handledAt: m.handledAt,
    createdAt: m.createdAt,
  };
}

export function createContactRouters({ auth, audit, email: mailer, notifications, limiters, config }) {
  const pub = Router();
  const admin = Router();

  const contactSchema = z.object({
    name: z.string().trim().min(2, 'Enter your name.').max(120),
    email,
    phone: z.string().trim().max(40).regex(/^[+0-9 ()-]*$/, 'Use digits, spaces, +, - and brackets only.').optional().default(''),
    subject: z.string().trim().min(3, 'Enter a subject.').max(200),
    message: z.string().trim().min(10, 'Your message is too short.').max(5000),
    // Honeypot: real people never see or fill this field.
    website: z.string().max(200).optional().default(''),
    // Time the form was opened (ms). Bots submit instantly.
    startedAt: z.number().int().optional(),
  });

  pub.post('/contact', limiters.contact, auth.optionalAuth, validate({ body: contactSchema }), async (req, res) => {
    const { website, startedAt, ...body } = req.valid.body;
    const tooFast = startedAt && Date.now() - startedAt < 2500;
    const looksSpam = Boolean(website) || tooFast || (body.message.match(/https?:\/\//g) || []).length > 3;
    const msg = await ContactMessage.create({ ...body, user: req.auth?.user?._id ?? null, status: looksSpam ? 'spam' : 'new' });
    if (!looksSpam) {
      const inbox = config.email.contactInbox || (await getSettings()).contact?.email;
      if (inbox) {
        const { delivered } = await mailer.sendContactForward(inbox, body);
        if (delivered) await ContactMessage.updateOne({ _id: msg._id }, { $set: { emailForwarded: true } });
      }
      await notifications.notifyPermission('contact.view', { type: 'contact.message', title: 'New contact message', body: `${body.name}: ${body.subject}`, link: '/dashboard/contact' });
    }
    // Same answer for spam so bots learn nothing.
    res.status(201).json({ data: { message: 'Thank you. Your message has been sent and the club will reply as soon as possible.' } });
  });

  // ---- Newsletter (double opt-in) -----------------------------------------------------------
  pub.post('/newsletter/subscribe', limiters.newsletter, validate({ body: z.object({ email, website: z.string().max(200).optional().default('') }) }), async (req, res) => {
    const settings = await getSettings();
    if (settings.features?.newsletter === false) throw AppError.forbidden('Club updates by email are not available at the moment.');
    const done = { data: { message: 'Check your inbox and click the link to confirm your subscription.' } };
    if (req.valid.body.website) return res.status(202).json(done);
    const token = randomToken(24);
    const existing = await NewsletterSubscriber.findOne({ email: req.valid.body.email });
    if (existing?.status === 'subscribed') return res.status(202).json(done);
    if (existing) {
      existing.tokenHash = sha256(token);
      existing.status = 'pending';
      await existing.save();
    } else {
      await NewsletterSubscriber.create({ email: req.valid.body.email, tokenHash: sha256(token) });
    }
    await mailer.sendNewsletterConfirmation(req.valid.body.email, token);
    res.status(202).json(done);
  });

  pub.post('/newsletter/confirm', limiters.newsletter, validate({ body: z.object({ token: z.string().min(10).max(100) }) }), async (req, res) => {
    const sub = await NewsletterSubscriber.findOne({ tokenHash: sha256(req.valid.body.token) }).select('+tokenHash');
    if (!sub) throw AppError.badRequest('This confirmation link is invalid or has already been used.');
    sub.status = 'subscribed';
    sub.confirmedAt = new Date();
    // Keep a token so the unsubscribe link keeps working.
    await sub.save();
    res.json({ data: { message: 'You are subscribed to club updates.', unsubscribeToken: req.valid.body.token } });
  });

  pub.post('/newsletter/unsubscribe', limiters.newsletter, validate({ body: z.object({ token: z.string().min(10).max(100) }) }), async (req, res) => {
    const sub = await NewsletterSubscriber.findOne({ tokenHash: sha256(req.valid.body.token) });
    if (sub) {
      sub.status = 'unsubscribed';
      sub.unsubscribedAt = new Date();
      await sub.save();
    }
    res.json({ data: { message: 'You have been unsubscribed.' } });
  });

  // ---- Admin ----------------------------------------------------------------------------
  admin.use(auth.requireAuth, auth.requireStaff, auth.requirePermission('contact.view'));

  admin.get('/messages', validate({ query: z.object({ status: z.enum(['new', 'read', 'replied', 'archived', 'spam', 'all']).optional().default('new'), ...pagingQuery }) }), async (req, res) => {
    const { status } = req.valid.query;
    const filter = status === 'all' ? { status: { $ne: 'spam' } } : { status };
    const [result, unread] = await Promise.all([
      findPaged(ContactMessage, filter, getPaging(req.valid.query), (q) => q.sort({ createdAt: -1 }).populate('handledBy', 'name')),
      ContactMessage.countDocuments({ status: 'new' }),
    ]);
    res.json({ data: { ...result, items: result.items.map(messageView), unread } });
  });

  admin.patch('/messages/:id', validate({ params: idParams, body: z.object({ status: z.enum(['new', 'read', 'replied', 'archived', 'spam']) }) }), async (req, res) => {
    const m = await ContactMessage.findByIdAndUpdate(
      req.valid.params.id,
      { $set: { status: req.valid.body.status, handledBy: req.auth.user._id, handledAt: new Date() } },
      { returnDocument: 'after' },
    ).populate('handledBy', 'name').lean();
    if (!m) throw AppError.notFound('Message not found.');
    await audit(req, { action: 'contact.message_status', entityType: 'ContactMessage', entityId: m._id, metadata: { status: m.status } });
    res.json({ data: messageView(m) });
  });

  admin.get('/subscribers', validate({ query: z.object({ format: z.enum(['json', 'csv']).optional().default('json'), ...pagingQuery }) }), async (req, res) => {
    const filter = { status: 'subscribed' };
    if (req.valid.query.format === 'csv') {
      const all = await NewsletterSubscriber.find(filter).sort({ confirmedAt: 1 }).lean();
      await audit(req, { action: 'newsletter.exported', entityType: 'NewsletterSubscriber', metadata: { count: all.length } });
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', 'attachment; filename="subscribers.csv"');
      return res.send(['email,confirmed_at', ...all.map((s) => `${s.email},${s.confirmedAt?.toISOString() ?? ''}`)].join('\n'));
    }
    const result = await findPaged(NewsletterSubscriber, filter, getPaging(req.valid.query, { defaultLimit: 50 }), (q) => q.sort({ confirmedAt: -1 }));
    res.json({ data: { ...result, items: result.items.map((s) => ({ id: idString(s._id), email: s.email, confirmedAt: s.confirmedAt })) } });
  });

  return { pub, admin };
}
