import { it, expect, beforeAll } from 'vitest';
import { describeDb, setupApp, api, createDirector, createStaff, registerUser } from './setup.js';
import { Team, Player, Season, Transfer, AuditLog, News } from '../../src/models/index.js';

describeDb('player transfers', () => {
  const ctx = setupApp('transfers');
  let director;
  let manager; // transfers.view + transfers.manage
  let approver; // transfers.view + transfers.approve
  let chairman; // default chairman grants: no transfer access
  let fan;
  let club;
  let season;
  let musa;
  let tunde;
  const as = (session) => api(ctx, session.token);
  const grants = (...permissions) => ({ grants: ['dashboard.view', ...permissions].map((permission) => ({ permission, scope: 'all' })) });

  beforeAll(async () => {
    // The shared setup drops the database after Mongoose's automatic index build may already
    // have run, so build this collection's indexes (incl. the unique open-transfer key) explicitly.
    await Transfer.syncIndexes();
    director = await createDirector(ctx);
    manager = await createStaff(ctx, director.token, 'tm@transfers.test', 'team_manager', grants('transfers.view', 'transfers.manage', 'players.view'));
    approver = await createStaff(ctx, director.token, 'chair@transfers.test', 'chairman', grants('transfers.view', 'transfers.approve', 'transfers.manage'));
    chairman = await createStaff(ctx, director.token, 'chair2@transfers.test', 'chairman');
    fan = await registerUser(ctx, 'fan@transfers.test');
    club = await Team.create({ name: 'Saki Stars First Team', slug: 'ssfc', isClubTeam: true });
    await Team.create({ name: 'Rivers United', slug: 'rivers', isClubTeam: false });
    season = await Season.create({ name: '2026/27', startDate: new Date('2026-08-01'), endDate: new Date('2027-06-30'), isCurrent: true });
    musa = await Player.create({ firstName: 'Musa', lastName: 'Okon', slug: 'musa-okon', position: 'Forward', team: club._id, squad: 'senior', status: 'active' });
    tunde = await Player.create({ firstName: 'Tunde', lastName: 'Eze', slug: 'tunde-eze', position: 'Midfielder', team: club._id, status: 'active' });
  });

  const outgoing = (extra = {}) => ({ direction: 'outgoing', player: String(musa._id), otherClub: 'Rivers United', type: 'loan', season: String(season._id), window: 'main', proposedDate: '2026-11-01', loanEndDate: '2027-05-30', reason: 'Game time', internalNotes: 'Private: fee discussions', ...extra });
  const incoming = (extra = {}) => ({ direction: 'incoming', externalPlayer: { firstName: 'Kola', lastName: 'New', position: 'Defender' }, otherClub: 'Kwara United', type: 'permanent', ...extra });

  it('nobody without transfer permissions can see or change transfers', async () => {
    expect((await api(ctx).get('/admin/transfers')).status).toBe(401);
    for (const s of [fan, chairman]) {
      expect((await as(s).get('/admin/transfers')).status).toBe(403);
      expect((await as(s).get('/admin/transfers/summary')).status).toBe(403);
      expect((await as(s).post('/admin/transfers').send(incoming())).status).toBe(403);
    }
    // Viewing alone does not allow creating.
    const viewer = await createStaff(ctx, director.token, 'viewer@transfers.test', 'consultant', grants('transfers.view'));
    expect((await as(viewer).get('/admin/transfers')).status).toBe(200);
    expect((await as(viewer).post('/admin/transfers').send(incoming())).status).toBe(403);
    // There is no public transfers endpoint at all.
    expect((await api(ctx).get('/transfers')).status).toBe(404);
    expect(await AuditLog.countDocuments({ action: 'access.denied' })).toBeGreaterThan(0);
  });

  it('creates outgoing and incoming drafts with unique references; the club side is filled in', async () => {
    const out = await as(manager).post('/admin/transfers').send(outgoing());
    expect(out.status).toBe(201);
    expect(out.body.data).toMatchObject({ direction: 'outgoing', status: 'draft', playerName: 'Musa Okon', toClub: 'Rivers United', type: 'loan' });
    expect(out.body.data.fromClub).toMatch(/saki stars/i);
    expect(out.body.data.reference).toMatch(/^TR-\d{4}-0001$/);
    expect(out.body.data.internalNotes).toBe('Private: fee discussions');

    const inc = await as(manager).post('/admin/transfers').send(incoming());
    expect(inc.status).toBe(201);
    expect(inc.body.data).toMatchObject({ direction: 'incoming', player: null, playerName: 'Kola New', fromClub: 'Kwara United' });
    expect(inc.body.data.reference).toMatch(/-0002$/);
    // No player record is created for the unregistered player.
    expect(await Player.countDocuments({ firstName: 'Kola' })).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'transfer.created' })).toBe(2);
  });

  it('validates required fields, references and unknown fields', async () => {
    const m = as(manager);
    const noPlayer = await m.post('/admin/transfers').send(outgoing({ player: null }));
    expect(noPlayer.status).toBe(422);
    expect(JSON.stringify(noPlayer.body)).toContain('player');
    expect((await m.post('/admin/transfers').send(incoming({ externalPlayer: { firstName: 'Only' } }))).status).toBe(422);
    expect((await m.post('/admin/transfers').send(outgoing({ player: '0123456789abcdef01234567' }))).status).toBe(422);
    expect((await m.post('/admin/transfers').send(outgoing({ player: 'not-an-id' }))).status).toBe(422);
    expect((await m.post('/admin/transfers').send(incoming({ season: '0123456789abcdef01234567' }))).status).toBe(422);
    expect((await m.post('/admin/transfers').send(incoming({ type: 'swap-deal' }))).status).toBe(422);
    expect((await m.post('/admin/transfers').send(incoming({ otherClub: '' }))).status).toBe(422);
    expect((await m.post('/admin/transfers').send(incoming({ type: 'permanent', loanEndDate: '2027-01-01' }))).status).toBe(422);
    expect((await m.post('/admin/transfers').send(incoming({ clubTeam: String((await Team.findOne({ slug: 'rivers' }))._id) }))).status).toBe(422);
    // Mass assignment: status, reference and approval cannot be set by the client.
    const sneaky = await m.post('/admin/transfers').send(incoming({ externalPlayer: { firstName: 'Ade', lastName: 'Sneak' }, status: 'completed', reference: 'TR-HACK', approval: { decision: 'approved' } }));
    expect(sneaky.status).toBe(201);
    expect(sneaky.body.data.status).toBe('draft');
    expect(sneaky.body.data.reference).not.toBe('TR-HACK');
    expect(sneaky.body.data.approval).toBeNull();
    // Operator injection is refused before reaching the database.
    expect((await m.post('/admin/transfers').send(incoming({ otherClub: { $gt: '' } }))).status).toBe(400);
  });

  it('refuses a second open transfer for the same player and direction, even when sent at the same time', async () => {
    const again = await as(manager).post('/admin/transfers').send(outgoing({ type: 'permanent', loanEndDate: null }));
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already has an open outgoing transfer \(TR-/);

    const both = await Promise.all([as(manager).post('/admin/transfers').send(outgoing({ player: String(tunde._id), type: 'permanent', loanEndDate: null })), as(approver).post('/admin/transfers').send(outgoing({ player: String(tunde._id), type: 'permanent', loanEndDate: null }))]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Transfer.countDocuments({ player: tunde._id })).toBe(1);
  });

  it('searches, filters and pages the list without exposing private fields', async () => {
    const m = as(manager);
    const all = await m.get('/admin/transfers');
    expect(all.body.data.total).toBe(4);
    expect(all.body.data.items[0].internalNotes).toBeUndefined();
    expect(all.body.data.items[0].documents).toBeUndefined();
    expect((await m.get('/admin/transfers?direction=incoming')).body.data.items.map((t) => t.playerName).sort()).toEqual(['Ade Sneak', 'Kola New']);
    expect((await m.get('/admin/transfers?q=musa')).body.data.items.map((t) => t.playerName)).toEqual(['Musa Okon']);
    expect((await m.get('/admin/transfers?q=TR-')).body.data.total).toBe(4);
    expect((await m.get('/admin/transfers?club=kwara')).body.data.total).toBe(2);
    expect((await m.get('/admin/transfers?type=loan')).body.data.total).toBe(1);
    expect((await m.get(`/admin/transfers?season=${season._id}`)).body.data.items.map((t) => t.playerName).sort()).toEqual(['Musa Okon', 'Tunde Eze']);
    expect((await m.get(`/admin/transfers?player=${musa._id}`)).body.data.total).toBe(1);
    expect((await m.get('/admin/transfers?status=approved')).body.data.total).toBe(0);
    const p1 = await m.get('/admin/transfers?limit=3&page=1');
    const p2 = await m.get('/admin/transfers?limit=3&page=2');
    expect(p1.body.data).toMatchObject({ pages: 2, total: 4 });
    expect(p1.body.data.items).toHaveLength(3);
    expect(p2.body.data.items).toHaveLength(1);
    expect(new Set([...p1.body.data.items, ...p2.body.data.items].map((t) => t.id)).size).toBe(4);
    const summary = (await m.get('/admin/transfers/summary')).body.data;
    expect(summary).toMatchObject({ incoming: 2, outgoing: 2, pending: 0, approved: 0, completed: 0, total: 4 });
    expect(summary.byStatus.draft).toBe(4);
  });

  it('enforces the workflow and roles: submit → approve → start → complete', async () => {
    const t = await Transfer.findOne({ player: musa._id }).lean();
    const url = (a) => `/admin/transfers/${t._id}/actions/${a}`;

    // Not allowed from draft.
    for (const a of ['approve', 'start', 'complete', 'reopen', 'withdraw']) expect((await as(approver).post(url(a)).send({})).status, a).toBe(409);
    // The manager cannot approve (no transfers.approve), even by calling the API directly.
    expect((await as(manager).post(url('submit')).send({})).status).toBe(200);
    expect((await as(manager).post(url('approve')).send({})).status).toBe(403);
    // Only drafts can be edited.
    expect((await as(manager).put(`/admin/transfers/${t._id}`).send(outgoing())).status).toBe(409);

    const approved = await as(approver).post(url('approve')).send({ note: 'Board agreed' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.approval).toMatchObject({ decision: 'approved', note: 'Board agreed' });
    expect(approved.body.data.approval.by.name).toBeTruthy();
    expect(approved.body.data.approval.at).toBeTruthy();
    // A second approval of the same request fails instead of silently repeating.
    expect((await as(approver).post(url('approve')).send({})).status).toBe(409);

    expect((await as(manager).post(url('start')).send({})).status).toBe(403);
    expect((await as(approver).post(url('start')).send({})).status).toBe(200);
    // Cancelling after approval needs approval rights and a reason.
    expect((await as(manager).post(url('cancel')).send({ note: 'x' })).status).toBe(403);
    expect((await as(approver).post(url('cancel')).send({})).status).toBe(422);

    // Completing without asking for the player update leaves the player record untouched.
    const done = await as(approver).post(url('complete')).send({ effectiveDate: '2026-11-03' });
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('completed');
    expect(done.body.data.effectiveDate).toMatch(/^2026-11-03/);
    expect((await Player.findById(musa._id).lean()).status).toBe('active');
    // Terminal: nothing more can happen.
    for (const a of ['cancel', 'complete', 'submit']) expect((await as(approver).post(url(a)).send({ note: 'n' })).status, a).toBe(409);

    const detail = (await as(manager).get(`/admin/transfers/${t._id}`)).body.data;
    expect(detail.history.map((h) => h.action)).toEqual(['complete', 'start', 'approve', 'submit', 'created']);
    expect(detail.history[0]).toMatchObject({ fromStatus: 'in_progress', toStatus: 'completed' });
    expect(detail.allowedActions).toEqual([]);
    for (const action of ['transfer.submitted', 'transfer.approved', 'transfer.started', 'transfer.completed']) {
      expect(await AuditLog.countDocuments({ action, entityId: String(t._id) }), action).toBe(1);
    }
    // A completed transfer frees the player for a new transfer.
    expect((await as(manager).post('/admin/transfers').send(incoming({ player: String(musa._id), externalPlayer: undefined, type: 'loan_return' }))).status).toBe(201);
  });

  it('rejection needs a reason and can be reopened; submitters cannot approve their own request', async () => {
    const created = (await as(approver).post('/admin/transfers').send(incoming({ externalPlayer: { firstName: 'Self', lastName: 'Approver' } }))).body.data;
    const url = (a) => `/admin/transfers/${created.id}/actions/${a}`;
    expect((await as(approver).post(url('submit')).send({})).status).toBe(200);
    const own = await as(approver).post(url('approve')).send({});
    expect(own.status).toBe(403);
    expect(own.body.error.code).toBe('SELF_APPROVAL');
    expect((await as(approver).get(`/admin/transfers/${created.id}`)).body.data.allowedActions).not.toContain('approve');

    expect((await as(director).post(url('reject')).send({})).status).toBe(422);
    const rejected = await as(director).post(url('reject')).send({ note: 'Medical not passed' });
    expect(rejected.body.data).toMatchObject({ status: 'rejected', approval: { decision: 'rejected', note: 'Medical not passed' } });
    expect((await as(director).post(url('approve')).send({})).status).toBe(409);
    expect((await as(approver).post(url('reopen')).send({})).body.data.status).toBe('draft');
    expect((await as(approver).post(url('cancel')).send({ note: 'Deal collapsed' })).body.data.status).toBe('cancelled');
    expect(await AuditLog.countDocuments({ action: { $in: ['transfer.rejected', 'transfer.reopened', 'transfer.cancelled'] }, entityId: created.id })).toBe(3);
  });

  it('concurrent approvals of one request: exactly one succeeds', async () => {
    const created = (await as(manager).post('/admin/transfers').send(incoming({ externalPlayer: { firstName: 'Race', lastName: 'Case' } }))).body.data;
    await as(manager).post(`/admin/transfers/${created.id}/actions/submit`).send({});
    const results = await Promise.all([as(approver), as(director), as(approver)].map((s) => s.post(`/admin/transfers/${created.id}/actions/approve`).send({})));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status !== 200).every((r) => r.status === 409)).toBe(true);
    const doc = await Transfer.findById(created.id).lean();
    expect(doc.history.filter((h) => h.action === 'approve')).toHaveLength(1);
  });

  it('edits drafts safely: stale edits are refused instead of overwriting', async () => {
    const created = (await as(manager).post('/admin/transfers').send(incoming({ externalPlayer: { firstName: 'Edit', lastName: 'Me' } }))).body.data;
    const ok = await as(manager).put(`/admin/transfers/${created.id}`).send({ ...incoming({ externalPlayer: { firstName: 'Edit', lastName: 'Me' }, otherClub: 'Remo Stars' }), expectedUpdatedAt: created.updatedAt });
    expect(ok.status).toBe(200);
    expect(ok.body.data.fromClub).toBe('Remo Stars');
    expect(ok.body.data.history[0]).toMatchObject({ action: 'edited', changes: { fields: ['fromClub'] } });
    const stale = await as(manager).put(`/admin/transfers/${created.id}`).send({ ...incoming({ externalPlayer: { firstName: 'Edit', lastName: 'Me' } }), expectedUpdatedAt: created.updatedAt });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('TRANSFER_CHANGED');
  });

  it('links a registered player later, and optionally updates the player record on completion', async () => {
    const created = (await as(manager).post('/admin/transfers').send(incoming({ externalPlayer: { firstName: 'Kola', lastName: 'Later' }, type: 'permanent' }))).body.data;
    const kola = await Player.create({ firstName: 'Kola', lastName: 'Later', slug: 'kola-later', position: 'Defender', status: 'inactive' });
    expect((await as(manager).patch(`/admin/transfers/${created.id}/player`).send({ player: '0123456789abcdef01234567' })).status).toBe(422);
    const linked = await as(manager).patch(`/admin/transfers/${created.id}/player`).send({ player: String(kola._id) });
    expect(linked.status).toBe(200);
    expect(linked.body.data.player.name).toBe('Kola Later');
    expect((await as(manager).patch(`/admin/transfers/${created.id}/player`).send({ player: String(kola._id) })).status).toBe(409);

    for (const [s, a] of [[manager, 'submit'], [director, 'approve'], [director, 'start']]) expect((await as(s).post(`/admin/transfers/${created.id}/actions/${a}`).send({})).status).toBe(200);
    const preview = (await as(director).get(`/admin/transfers/${created.id}`)).body.data.playerUpdatePreview;
    expect(preview.status).toEqual({ from: 'inactive', to: 'active' });

    // The approver lacks players.edit, so the optional player update is refused (and nothing changes).
    const denied = await as(approver).post(`/admin/transfers/${created.id}/actions/complete`).send({ updatePlayer: true });
    expect(denied.status).toBe(403);
    expect((await Transfer.findById(created.id).lean()).status).toBe('in_progress');

    const done = await as(director).post(`/admin/transfers/${created.id}/actions/complete`).send({ updatePlayer: true, effectiveDate: '2026-12-01' });
    expect(done.status).toBe(200);
    const after = await Player.findById(kola._id).lean();
    expect(after.status).toBe('active');
    expect(after.joinedAt.toISOString()).toMatch(/^2026-12-01/);
    expect(after.firstName).toBe('Kola'); // nothing else touched
    expect(done.body.data.history[0]).toMatchObject({ action: 'player_updated', changes: { status: { from: 'inactive', to: 'active' } } });
    expect(await AuditLog.countDocuments({ action: 'transfer.player_record_updated' })).toBe(1);
  });

  it('keeps documents private: no URL in responses, opening is audited and uses a short-lived link', async () => {
    const t = await Transfer.findOne({ playerName: 'Edit Me' }).lean();
    const up = await as(manager).post(`/admin/transfers/${t._id}/documents`).field('name', 'Clearance letter').field('kind', 'clearance').attach('file', Buffer.from('%PDF-1.4 test file content'), { filename: 'c.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    const doc = up.body.data.documents[0];
    expect(doc).toMatchObject({ name: 'Clearance letter', kind: 'clearance' });
    expect(JSON.stringify(up.body)).not.toContain('res.cloudinary.com');
    expect(ctx.media.uploaded.at(-1)).toMatchObject({ deliveryType: 'private' });
    const viewer = await createStaff(ctx, director.token, 'viewer2@transfers.test', 'consultant', grants('transfers.view'));
    expect((await as(viewer).post(`/admin/transfers/${t._id}/documents`).field('name', 'x').attach('file', Buffer.from('%PDF-1.4 x'), { filename: 'x.pdf', contentType: 'application/pdf' })).status).toBe(403);
    const open = await as(viewer).get(`/admin/transfers/${t._id}/documents/${doc.id}`);
    expect(open.body.data).toMatchObject({ expiresInSeconds: 300 });
    expect(await AuditLog.countDocuments({ action: 'transfer.document_opened', entityId: String(t._id) })).toBe(1);
    expect((await as(fan).get(`/admin/transfers/${t._id}/documents/${doc.id}`)).status).toBe(403);
    const removed = await as(manager).delete(`/admin/transfers/${t._id}/documents/${doc.id}`);
    expect(removed.body.data.documents).toHaveLength(0);
  });

  it('announcing is a separate, explicit step that only creates an unpublished news draft', async () => {
    const done = await Transfer.findOne({ player: musa._id, status: 'completed' }).lean();
    const pending = await Transfer.findOne({ status: 'draft' }).lean();
    expect(await News.countDocuments()).toBe(0); // completing did not announce anything
    expect((await as(manager).post(`/admin/transfers/${done._id}/announcement`)).status).toBe(403); // no news.create
    expect((await as(director).post(`/admin/transfers/${pending._id}/announcement`)).status).toBe(409);
    const [a, b] = await Promise.all([as(director).post(`/admin/transfers/${done._id}/announcement`), as(director).post(`/admin/transfers/${done._id}/announcement`)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const news = await News.find().lean();
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ status: 'draft', category: 'Transfers', publishedAt: null });
    expect(news[0].content).not.toContain('Private');
    expect((await api(ctx).get(`/news/${news[0].slug}`)).status).toBe(404); // not public
  });

  it('leaves existing player and dashboard functionality working', async () => {
    expect((await as(director).get('/admin/players')).status).toBe(200);
    expect((await as(director).get(`/admin/players/${musa._id}`)).body.data.fullName).toBe('Musa Okon');
    expect((await api(ctx).get('/players/musa-okon')).status).toBe(200);
    expect((await as(director).get('/admin/dashboard/overview')).status).toBe(200);
    const perms = (await as(director).get('/admin/staff/permissions')).body.data.permissions.map((p) => p.key);
    expect(perms).toEqual(expect.arrayContaining(['transfers.view', 'transfers.manage', 'transfers.approve']));
    // No existing role was given transfer access by default.
    const tm = await createStaff(ctx, director.token, 'tm2@transfers.test', 'team_manager');
    expect((await as(tm).get('/admin/transfers')).status).toBe(403);
  });
});
