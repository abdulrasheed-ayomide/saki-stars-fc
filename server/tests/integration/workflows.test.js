import { it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { describeDb, setupApp, registerUser, api, createDirector, login, mediaObject } from './setup.js';
import { Team, Player, User, Notification, Staff } from '../../src/models/index.js';

const SECRET_PATTERNS = /dateOfBirth|08033333333|A1234567|asthma|emergencyContact|guardian|internalNotes|restricted|sensitive|nationalId|medical/i;

describeDb('player & staff applications, player portal and privacy', () => {
  const ctx = setupApp('workflows');
  let director;
  let team;

  beforeAll(async () => {
    director = await createDirector(ctx);
    team = await Team.create({ name: 'Saki Stars NEXT GEN', slug: 'next-gen', isClubTeam: true, containsMinors: true });
  });

  it('unverified users cannot apply', async () => {
    await request(ctx.app).post('/api/v1/auth/register').send({ name: 'Early Bird', email: 'early@wf.test', password: 'Str0ng-pass-2026', acceptTerms: true });
    const s = await login(ctx, 'early@wf.test');
    const res = await api(ctx, s.token).post('/account/applications/player').send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('a minor’s application requires a guardian and consent', async () => {
    const kid = await registerUser(ctx, 'kid@wf.test', 'Kid Player');
    const base = {
      firstName: 'Sola',
      lastName: 'Adewale',
      dateOfBirth: new Date(Date.now() - 15 * 365.25 * 86400000).toISOString().slice(0, 10),
      phone: '08033333333',
      position: 'Midfielder',
      preferredTeam: String(team._id),
      emergencyContact: { name: 'Mama Sola', relationship: 'Mother', phone: '08044444444' },
    };
    const missing = await api(ctx, kid.token).post('/account/applications/player').send(base);
    expect(missing.status).toBe(422);
    expect(missing.body.error.details.map((d) => d.path)).toEqual(expect.arrayContaining(['guardian.name', 'guardian.consent']));

    const ok = await api(ctx, kid.token)
      .post('/account/applications/player')
      .send({ ...base, guardian: { name: 'Mama Sola', relationship: 'Mother', phone: '08044444444', consent: true } });
    expect(ok.status).toBe(201);
    const dup = await api(ctx, kid.token).post('/account/applications/player').send({ ...base, guardian: { name: 'M', relationship: 'Mother', phone: '0804', consent: true } });
    expect(dup.status).toBe(409);
    // The Director was notified.
    expect(await Notification.countDocuments({ recipient: director.user.id, type: 'application.player' })).toBe(1);
  });

  it('the Director approves: a player profile is created, linked, and minimal publicly', async () => {
    const list = await api(ctx, director.token).get('/admin/applications/players');
    expect(list.body.data.items).toHaveLength(1);
    const appId = list.body.data.items[0].id;
    const detail = await api(ctx, director.token).get(`/admin/applications/players/${appId}`);
    expect(detail.body.data.isMinor).toBe(true);
    expect(detail.body.data.guardian.consentGivenAt).toBeTruthy();

    const approve = await api(ctx, director.token).post(`/admin/applications/players/${appId}/approve`).send({ jerseyNumber: 14, note: 'Welcome!' });
    expect(approve.status).toBe(200);
    const user = await User.findOne({ email: 'kid@wf.test' }).lean();
    expect(user.role).toBe('player');
    const player = await Player.findById(user.player).lean();
    expect(player.team.toString()).toBe(String(team._id));
    expect(player.isMinor).toBe(true);
    expect(player.hideFullNamePublicly).toBe(true);
    expect(player.restricted.phone).toBe('08033333333');
    expect(ctx.email.outbox.some((m) => m.to === 'kid@wf.test' && /approved/.test(m.subject))).toBe(true);

    // Second approval of the same application is refused.
    expect((await api(ctx, director.token).post(`/admin/applications/players/${appId}/approve`).send({})).status).toBe(409);
  });

  it('public player data never contains private information', async () => {
    const player = await Player.findOne({ firstName: 'Sola' });
    player.sensitive = { nationalId: 'A1234567', medicalNotes: 'asthma' };
    player.restricted.internalNotes = 'watch attitude';
    await player.save();

    const endpoints = ['/players', `/players/${player._id}`, `/teams/${team._id}`, '/search?q=sola'];
    for (const path of endpoints) {
      const res = await api(ctx).get(path);
      expect(res.status, path).toBe(200);
      expect(JSON.stringify(res.body), path).not.toMatch(SECRET_PATTERNS);
    }
    const pub = await api(ctx).get(`/players/${player._id}`);
    expect(pub.body.data.name).toBe('Sola A.'); // minor: surname hidden
    expect(pub.body.data.lastName).toBe('');
    const bySurname = await api(ctx).get('/search?q=Adewale');
    expect(bySurname.body.data.players).toHaveLength(0);
    // The hidden surname must not leak through the URL or the sitemap either.
    expect(pub.body.data.slug).toMatch(/^sola-a(-|$)/);
    const sitemap = await request(ctx.app).get('/api/v1/sitemap.xml');
    expect(sitemap.text).not.toMatch(/adewale/i);
    // Showing the full name later gives the player a full-name URL.
    player.hideFullNamePublicly = false;
    await player.save();
    expect(player.slug).toMatch(/^sola-adewale/);
    player.hideFullNamePublicly = true;
    await player.save();
    expect(player.slug).toMatch(/^sola-a(-|$)/);
  });

  it('the Player Portal shows own data and only lets the player edit permitted fields', async () => {
    const kid = await login(ctx, 'kid@wf.test');
    const p = api(ctx, kid.token);
    const overview = await p.get('/portal/overview');
    expect(overview.status).toBe(200);
    expect(overview.body.data.player.personal.phone).toBe('08033333333');
    expect(overview.body.data.player.personal.nationalIdOnFile).toBe(true);
    expect(JSON.stringify(overview.body)).not.toMatch(/A1234567|asthma|watch attitude/);
    expect(overview.body.data.profileCompletion.percent).toBeLessThan(100);

    const upd = await p.patch('/portal/personal').send({ phone: '08055555555', address: '12 Stadium Road, Saki' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.personal.phone).toBe('08055555555');

    // Unknown/official fields are ignored, not applied.
    await p.patch('/portal/personal').send({ team: null, jerseyNumber: 10, position: 'Forward' });
    const player = await Player.findOne({ firstName: 'Sola' }).lean();
    expect(player.jerseyNumber).toBe(14);
    expect(player.position).toBe('Midfielder');
    expect(String(player.team)).toBe(String(team._id));

    const dob = await p.patch('/portal/personal').send({ dateOfBirth: '2000-01-01' });
    expect(dob.status).toBe(422);

    const docs = await p.post('/portal/documents').field('name', 'Signed consent form').field('kind', 'consent').attach('file', Buffer.from('%PDF-1.4 test file content'), { filename: 'consent.pdf', contentType: 'application/pdf' });
    expect(docs.status).toBe(201);
    const open = await p.get(`/portal/documents/${docs.body.data.id}`);
    expect(open.body.data.url).toMatch(/signed/);

    // Other areas remain off-limits.
    expect((await p.get('/admin/players')).status).toBe(403);
  });

  it('a normal user cannot open the Player Portal', async () => {
    const fan = await registerUser(ctx, 'fan@wf.test');
    expect((await api(ctx, fan.token).get('/portal/overview')).status).toBe(403);
  });

  it('staff application: cannot request Director; approval assigns role and default permissions', async () => {
    const applicant = await registerUser(ctx, 'coach@wf.test', 'Coach Carter');
    const asDirector = await api(ctx, applicant.token).post('/account/applications/staff').send({ fullName: 'Coach Carter', requestedRole: 'director', phone: '08066666666' });
    expect(asDirector.status).toBe(422);
    const ok = await api(ctx, applicant.token).post('/account/applications/staff').send({ fullName: 'Coach Carter', requestedRole: 'team_manager', phone: '08066666666', experience: '10 years coaching' });
    expect(ok.status).toBe(201);
    expect((await api(ctx, applicant.token).get('/admin/dashboard/overview')).status).toBe(403);

    const list = await api(ctx, director.token).get('/admin/applications/staff');
    const approve = await api(ctx, director.token).post(`/admin/applications/staff/${list.body.data.items[0].id}/approve`).send({ staffRole: 'team_manager', assignedTeams: [String(team._id)] });
    expect(approve.status).toBe(200);
    const staff = await Staff.findById(approve.body.data.staff).lean();
    expect(staff.grants.map((g) => g.permission)).toContain('matches.manage');

    const again = await login(ctx, 'coach@wf.test');
    const overview = await api(ctx, again.token).get('/admin/dashboard/overview');
    expect(overview.status).toBe(200);
    const players = await api(ctx, again.token).get('/admin/players');
    expect(players.body.data.items.map((pl) => pl.firstName)).toEqual(['Sola']);
  });

  it('rejection is recorded and the applicant is told', async () => {
    const other = await registerUser(ctx, 'maybe@wf.test');
    await api(ctx, other.token).post('/account/applications/staff').send({ fullName: 'Maybe Later', requestedRole: 'scout', phone: '08077777777' });
    const list = await api(ctx, director.token).get('/admin/applications/staff');
    const rej = await api(ctx, director.token).post(`/admin/applications/staff/${list.body.data.items[0].id}/reject`).send({ note: 'No vacancy right now.' });
    expect(rej.status).toBe(200);
    const mine = await api(ctx, other.token).get('/account/applications');
    expect(mine.body.data[0]).toMatchObject({ status: 'rejected', reviewNote: 'No vacancy right now.' });
  });

  it('staff without restricted-data permission see only the public-level player view', async () => {
    await (await import('./setup.js')).createStaff(ctx, director.token, 'consult@wf.test', 'consultant');
    const c = await login(ctx, 'consult@wf.test');
    const player = await Player.findOne({ firstName: 'Sola' }).lean();
    const res = await api(ctx, c.token).get(`/admin/players/${player._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.restricted).toBeUndefined();
    expect(res.body.data.sensitive).toBeUndefined();
  });

  it('the Director sees restricted data and every such view is audited', async () => {
    const player = await Player.findOne({ firstName: 'Sola' }).lean();
    const res = await api(ctx, director.token).get(`/admin/players/${player._id}`);
    expect(res.body.data.sensitive.nationalId).toBe('A1234567');
    const { AuditLog } = await import('../../src/models/index.js');
    expect(await AuditLog.countDocuments({ action: 'player.sensitive_viewed' })).toBeGreaterThan(0);
  });

  it('public staff profiles never expose login email, phone or internal notes', async () => {
    const s = await Staff.findOne({ fullName: 'Coach Carter' });
    s.showOnWebsite = true;
    s.privatePhone = '08066666666';
    s.internalNotes = 'secret note';
    s.photo = mediaObject('staff');
    await s.save();
    const res = await api(ctx).get('/staff');
    expect(res.body.data.map((x) => x.fullName)).toContain('Coach Carter');
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/coach@wf\.test|08066666666|secret note|grants|assigned/);
  });
});
