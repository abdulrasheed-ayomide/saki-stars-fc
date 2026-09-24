import { it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { describeDb, setupApp, registerUser, api, createDirector, createStaff, mediaObject, lastToken } from './setup.js';
import { Comment, ContactMessage, User, Player, AuditLog, Notification, Team } from '../../src/models/index.js';

describeDb('content, communication and account lifecycle', () => {
  const ctx = setupApp('content');
  let director;
  let writer;
  let media;
  let fan;
  let articleId;
  let slug;

  beforeAll(async () => {
    director = await createDirector(ctx);
    media = await createStaff(ctx, director.token, 'media@content.test', 'media_officer');
    writer = await createStaff(ctx, director.token, 'writer@content.test', 'consultant', {
      grants: [{ permission: 'dashboard.view', scope: 'all' }, { permission: 'news.create', scope: 'all' }],
    });
    fan = await registerUser(ctx, 'fan@content.test', 'Loyal Fan');
  });

  it('news goes draft -> review -> published, and only published news is public', async () => {
    const w = api(ctx, writer.token);
    const created = await w.post('/admin/news').send({
      title: 'Stars sign new striker',
      content: '## Big news\n\nThe club has completed the signing of a new striker ahead of the season.',
      category: 'Transfers',
      featuredImage: mediaObject('news'),
    });
    expect(created.status).toBe(201);
    articleId = created.body.data.id;
    slug = created.body.data.slug;
    expect(created.body.data.status).toBe('draft');
    expect((await api(ctx).get(`/news/${slug}`)).status).toBe(404);

    // A writer without news.publish cannot publish.
    expect((await w.post(`/admin/news/${articleId}/publish`)).status).toBe(403);
    expect((await w.post(`/admin/news/${articleId}/submit`)).status).toBe(200);
    expect(await Notification.countDocuments({ type: 'news.review' })).toBeGreaterThan(0);

    const pub = await api(ctx, media.token).post(`/admin/news/${articleId}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.status).toBe('published');
    const page = await api(ctx).get(`/news/${slug}`);
    expect(page.status).toBe(200);
    expect(page.body.data.author.name).toBeTruthy();
    expect(JSON.stringify(page.body)).not.toMatch(/writer@content\.test/);

    // The writer can no longer edit once published (no news.edit).
    expect((await w.put(`/admin/news/${articleId}`).send({ title: 'Changed title here', content: 'Changed content for the article body.' })).status).toBe(403);
  });

  it('rejects media that was not uploaded through the club account', async () => {
    const res = await api(ctx, media.token).post('/admin/news').send({
      title: 'Bad image article',
      content: 'Content that is long enough to be accepted by validation.',
      featuredImage: { publicId: 'x', url: 'https://evil.example/x.jpg' },
    });
    expect(res.status).toBe(422);
  });

  it('comments: verified users only, spam is held, reports reach moderators', async () => {
    expect((await api(ctx).post('/comments').send({ targetType: 'news', targetId: articleId, body: 'Anonymous!' })).status).toBe(401);
    const f = api(ctx, fan.token);
    const ok = await f.post('/comments').send({ targetType: 'news', targetId: articleId, body: 'Great signing, welcome!' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.held).toBe(false);
    const spam = await f.post('/comments').send({ targetType: 'news', targetId: articleId, body: 'Win big http://a.example http://b.example casino' });
    expect(spam.body.data.held).toBe(true);

    const list = await api(ctx).get(`/comments?targetType=news&targetId=${articleId}`);
    expect(list.body.data.items.map((c) => c.body)).toEqual(['Great signing, welcome!']);

    const other = await registerUser(ctx, 'other@content.test');
    const report = await api(ctx, other.token).post(`/comments/${ok.body.data.id}/report`).send({ reason: 'Off topic' });
    expect(report.status).toBe(200);

    const queue = await api(ctx, media.token).get('/admin/comments');
    expect(queue.body.data.items.length).toBe(2);
    const hide = await api(ctx, media.token).post(`/admin/comments/${spam.body.data.id}/moderate`).send({ status: 'rejected', note: 'Spam' });
    expect(hide.status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'comment.moderated' })).toBe(1);

    // Own comment: edit within the window, then delete (soft).
    expect((await f.patch(`/comments/${ok.body.data.id}`).send({ body: 'Great signing, welcome to Saki!' })).status).toBe(200);
    expect((await api(ctx, other.token).patch(`/comments/${ok.body.data.id}`).send({ body: 'hijack' })).status).toBe(404);
    expect((await f.delete(`/comments/${ok.body.data.id}`)).status).toBe(200);
    expect(await Comment.countDocuments({ deletedAt: { $ne: null } })).toBe(1);
  });

  it('videos accept YouTube links and gallery requires club-uploaded images', async () => {
    const m = api(ctx, media.token);
    const bad = await m.post('/admin/videos').send({ title: 'Highlights', category: 'Match Highlights', source: 'youtube', youtubeUrl: 'https://vimeo.com/123' });
    expect(bad.status).toBe(422);
    const yt = await m.post('/admin/videos').send({ title: 'Highlights v Rivers', category: 'Match Highlights', source: 'youtube', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(yt.status).toBe(201);
    const list = await api(ctx).get('/videos');
    expect(list.body.data.items[0].youtubeId).toBe('dQw4w9WgXcQ');

    const upload = await m.post('/media/upload?folder=gallery').attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2]), { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(upload.status).toBe(201);
    const g = await m.post('/admin/gallery').send({ category: 'Matches', title: 'Kick-off', image: upload.body.data });
    expect(g.status).toBe(201);
    expect((await api(ctx).get('/gallery')).body.data.items).toHaveLength(1);

    const fake = await m.post('/media/upload?folder=gallery').attach('file', Buffer.from('<?php echo 1; ?>........'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(fake.status).toBe(201); // the fake media service accepts anything; the real one sniffs bytes (unit tested)
    expect((await api(ctx, fan.token).post('/media/upload?folder=gallery').attach('file', Buffer.from('x'), 'a.jpg')).status).toBe(403);
  });

  it('contact form stores messages, blocks honeypot spam silently, and staff can read them', async () => {
    const good = await api(ctx).post('/contact').send({ name: 'Visitor', email: 'v@example.com', subject: 'Trials', message: 'When are the next open trials?', startedAt: Date.now() - 10_000 });
    expect(good.status).toBe(201);
    const bot = await api(ctx).post('/contact').send({ name: 'Bot', email: 'b@example.com', subject: 'Hello', message: 'Buy now buy now buy now', website: 'http://spam', startedAt: Date.now() - 10_000 });
    expect(bot.status).toBe(201);
    expect(await ContactMessage.countDocuments({ status: 'spam' })).toBe(1);
    const bad = await api(ctx).post('/contact').send({ name: '', email: 'nope', subject: '', message: '' });
    expect(bad.status).toBe(422);
    const inbox = await api(ctx, director.token).get('/admin/contact/messages');
    expect(inbox.body.data.items.map((m) => m.subject)).toEqual(['Trials']);
    expect((await api(ctx, fan.token).get('/admin/contact/messages')).status).toBe(403);
  });

  it('newsletter uses double opt-in', async () => {
    const sub = await api(ctx).post('/newsletter/subscribe').send({ email: 'news@example.com' });
    expect(sub.status).toBe(202);
    const token = lastToken(ctx, 'news@example.com');
    expect((await api(ctx, director.token).get('/admin/contact/subscribers')).body.data.items).toHaveLength(0);
    expect((await api(ctx).post('/newsletter/confirm').send({ token })).status).toBe(200);
    expect((await api(ctx, director.token).get('/admin/contact/subscribers')).body.data.items).toHaveLength(1);
    expect((await api(ctx).post('/newsletter/unsubscribe').send({ token })).status).toBe(200);
  });

  it('announcements reach the chosen audience as notifications', async () => {
    const a = await api(ctx, director.token).post('/admin/announcements').send({ title: 'Stadium closed Monday', body: 'Maintenance works.', audience: 'everyone' });
    expect(a.status).toBe(201);
    const mine = await api(ctx, fan.token).get('/notifications');
    expect(mine.body.data.items.some((n) => n.title === 'Stadium closed Monday')).toBe(true);
    expect(mine.body.data.unread).toBeGreaterThan(0);
    await api(ctx, fan.token).post('/notifications/read-all');
    expect((await api(ctx, fan.token).get('/notifications/unread-count')).body.data.unread).toBe(0);
    expect((await api(ctx, media.token).post('/admin/announcements').send({ title: 'x', body: 'y', audience: 'everyone' })).status).toBe(403);
  });

  it('staff reports: authors see their own, the Director reviews, nobody reviews their own', async () => {
    const r = await api(ctx, media.token).post('/admin/reports').send({ type: 'general', title: 'Media day summary', content: 'Interviews recorded with three players.' });
    expect(r.status).toBe(201);
    const writerList = await api(ctx, writer.token).get('/admin/reports');
    expect(writerList.status).toBe(403); // no reports permissions in custom grants
    const review = await api(ctx, director.token).post(`/admin/reports/${r.body.data.id}/review`).send({ status: 'reviewed', reviewNote: 'Thanks' });
    expect(review.status).toBe(200);
    const own = await api(ctx, director.token).post('/admin/reports').send({ title: 'My report', content: 'Director report content.' });
    expect((await api(ctx, director.token).post(`/admin/reports/${own.body.data.id}/review`).send({ status: 'reviewed' })).status).toBe(403);
  });

  it('scouting is private: scouts see only their own work and nothing is public', async () => {
    const scout = await createStaff(ctx, director.token, 'scout@content.test', 'scout');
    const scout2 = await createStaff(ctx, director.token, 'scout2@content.test', 'scout');
    const report = await api(ctx, scout.token).post('/admin/scouting/reports').send({
      subject: { name: 'Prospect Pete', currentClub: 'Oyo Academy', position: 'Winger', birthYear: 2008 },
      observations: 'Quick, direct, good first touch. Needs work defensively.',
      ratings: { technical: 7, potential: 8 },
      recommendation: 'trial',
    });
    expect(report.status).toBe(201);
    expect((await api(ctx, scout2.token).get(`/admin/scouting/reports/${report.body.data.id}`)).status).toBe(404);
    expect((await api(ctx, scout2.token).get('/admin/scouting/reports')).body.data.items).toHaveLength(0);
    expect((await api(ctx, director.token).get('/admin/scouting/reports')).body.data.items).toHaveLength(1);
    expect((await api(ctx, media.token).get('/admin/scouting/reports')).status).toBe(403);
    const search = await api(ctx).get('/search?q=Prospect');
    expect(JSON.stringify(search.body)).not.toMatch(/Prospect Pete/);

    const assign = await api(ctx, director.token).post('/admin/scouting/assignments').send({ scout: scout2.user.id, subject: { name: 'Target Tom' }, instructions: 'Watch Saturday' });
    expect(assign.status).toBe(201);
    expect((await api(ctx, scout2.token).get('/admin/scouting/assignments')).body.data.items).toHaveLength(1);
    expect((await api(ctx, scout.token).get('/admin/scouting/assignments')).body.data.items).toHaveLength(0);
  });

  it('club settings and legal documents are managed with versioning', async () => {
    const put = await api(ctx, director.token).put('/admin/settings').send({
      name: 'Saki Stars Sports Club',
      shortName: 'Saki Stars',
      heroHeadline: 'Pride of Saki',
      contact: { email: 'info@sakistars.test', phone: '+234 800 000 0000' },
      stadium: { name: 'Saki Township Stadium', capacity: 5000 },
      social: { facebook: 'https://facebook.com/sakistars' },
    });
    expect(put.status).toBe(200);
    expect((await api(ctx).get('/settings')).body.data.stadium.name).toBe('Saki Township Stadium');
    expect((await api(ctx, media.token).put('/admin/settings').send({ name: 'Hacked', shortName: 'Hacked' })).status).toBe(403);

    const legal = await api(ctx, director.token).put('/admin/settings/legal/privacy').send({ body: 'Privacy text v1', version: '1.0', approved: false });
    expect(legal.status).toBe(200);
    const sameVersion = await api(ctx, director.token).put('/admin/settings/legal/privacy').send({ body: 'Changed text', version: '1.0', approved: true });
    expect(sameVersion.status).toBe(422);
    await api(ctx, director.token).put('/admin/settings/legal/privacy').send({ body: 'Changed text', version: '1.1', approved: true });
    expect((await api(ctx).get('/legal/privacy')).body.data.version).toBe('1.1');
    const accept = await api(ctx, fan.token).post('/account/consents');
    expect(accept.body.data.consents.privacyVersion).toBe('1.1');
  });

  it('data export excludes secrets; deletion anonymises personal data and keeps club history', async () => {
    const u = await registerUser(ctx, 'leaver@content.test', 'Leaving Player');
    const team = await Team.create({ name: 'Leaver FC', slug: 'leaver-fc', isClubTeam: true });
    const player = await Player.create({ user: u.user.id, firstName: 'Leaving', lastName: 'Player', slug: 'leaving-player', position: 'Defender', team: team._id, restricted: { phone: '0801', address: 'Somewhere' } });
    await User.updateOne({ _id: u.user.id }, { $set: { player: player._id, role: 'player' } });
    await api(ctx, u.token).post('/comments').send({ targetType: 'news', targetId: articleId, body: 'Goodbye everyone, thanks!' });

    const exp = await api(ctx, u.token).get('/account/data-export');
    expect(exp.status).toBe(200);
    expect(JSON.stringify(exp.body)).not.toMatch(/passwordHash|TokenHash/);
    expect(exp.body.data.account.email).toBe('leaver@content.test');

    expect((await api(ctx, u.token).post('/account/deletion-request')).status).toBe(200);
    const requests = await api(ctx, director.token).get('/admin/users?deletionRequested=true');
    expect(requests.body.data.items.map((x) => x.email)).toContain('leaver@content.test');

    const anon = await api(ctx, director.token).post(`/admin/users/${u.user.id}/anonymize`).send({ confirm: 'DELETE', reason: 'User request under data protection law' });
    expect(anon.status).toBe(200);
    const after = await User.findById(u.user.id).lean();
    expect(after.email).not.toContain('leaver');
    expect(after.name).toBe('Deleted user');
    const p = await Player.findById(player._id).lean();
    expect(p.firstName).toBe('Leaving'); // historical football record kept
    expect(p.restricted.phone).toBeFalsy(); // personal data removed
    expect(p.user).toBeUndefined();
    expect((await Comment.findOne({ body: 'Goodbye everyone, thanks!' }).lean()).authorName).toBe('Deleted user');
    // The email can be used again for a brand new account.
    const again = await request(ctx.app).post('/api/v1/auth/register').send({ name: 'New Me', email: 'leaver@content.test', password: 'Str0ng-pass-2026', acceptTerms: true });
    expect(again.status).toBe(202);
    expect(await User.countDocuments({ email: 'leaver@content.test' })).toBe(1);
  });

  it('dashboard overview shows real counts, limited to what the person may see', async () => {
    const d = await api(ctx, director.token).get('/admin/dashboard/overview');
    expect(d.status).toBe(200);
    expect(d.body.data.cards).toHaveProperty('pendingPlayerApplications', 0);
    expect(d.body.data.cards).toHaveProperty('unreadMessages');
    const m = await api(ctx, media.token).get('/admin/dashboard/overview');
    expect(m.body.data.cards).not.toHaveProperty('pendingPlayerApplications');
    expect(m.body.data.cards).not.toHaveProperty('users');
    expect(m.body.data.cards).toHaveProperty('newsInReview');
    const sys = await api(ctx, director.token).get('/admin/dashboard/system');
    expect(sys.status).toBe(200);
    expect(JSON.stringify(sys.body)).not.toMatch(/JWT|secret|re_|mongodb:\/\//i);
    expect((await api(ctx, media.token).get('/admin/dashboard/system')).status).toBe(403);
  });

  it('sitemap lists public pages only', async () => {
    const res = await request(ctx.app).get('/api/v1/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`/news/${slug}`);
    expect(res.text).not.toMatch(/dashboard|portal|account/);
  });

  it('robots.txt keeps private areas out of search engines and points to the sitemap', async () => {
    const res = await request(ctx.app).get('/api/v1/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Disallow: \/dashboard/);
    expect(res.text).toMatch(/Disallow: \/portal/);
    expect(res.text).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);
  });
});
