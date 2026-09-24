import { it, expect, beforeAll } from 'vitest';
import { describeDb, setupApp, registerUser, api, createDirector, createStaff } from './setup.js';
import { Team, Player, Staff, AuditLog } from '../../src/models/index.js';

describeDb('role, permission and scope checks', () => {
  const ctx = setupApp('rbac');
  let director;
  let fan;
  let manager;
  let media;
  let it_;
  let chairman;
  let first;
  let youth;
  let firstPlayer;
  let youthPlayer;

  beforeAll(async () => {
    director = await createDirector(ctx);
    first = await Team.create({ name: 'First Team', slug: 'first-team', isClubTeam: true });
    youth = await Team.create({ name: 'Youth', slug: 'youth', isClubTeam: true, containsMinors: true });
    firstPlayer = await Player.create({ firstName: 'Ade', lastName: 'Bola', slug: 'ade-bola', position: 'Forward', team: first._id, restricted: { phone: '08011111111' } });
    youthPlayer = await Player.create({ firstName: 'Kid', lastName: 'Star', slug: 'kid-star', position: 'Midfielder', team: youth._id, isMinor: true, restricted: { phone: '08022222222' } });
    fan = await registerUser(ctx, 'fan@rbac.test');
    manager = await createStaff(ctx, director.token, 'manager@rbac.test', 'team_manager', { assignedTeams: [String(first._id)] });
    media = await createStaff(ctx, director.token, 'media@rbac.test', 'media_officer');
    it_ = await createStaff(ctx, director.token, 'it@rbac.test', 'it_manager');
    chairman = await createStaff(ctx, director.token, 'chair@rbac.test', 'chairman');
  });

  it('normal users cannot reach any staff endpoint, even by calling the API directly', async () => {
    for (const path of ['/admin/dashboard/overview', '/admin/users', '/admin/players', '/admin/news', '/admin/audit', '/admin/settings', '/admin/scouting/reports']) {
      const res = await api(ctx, fan.token).get(path);
      expect(res.status, path).toBe(403);
    }
    expect(await AuditLog.countDocuments({ action: 'access.denied' })).toBeGreaterThan(0);
  });

  it('anonymous requests to staff endpoints are 401', async () => {
    expect((await api(ctx).get('/admin/users')).status).toBe(401);
  });

  it('the current user reports role, permissions and scope', async () => {
    const me = await api(ctx, manager.token).get('/auth/me');
    expect(me.body.data.staff.role).toBe('team_manager');
    const perms = Object.fromEntries(me.body.data.permissions.map((p) => [p.permission, p.scope]));
    expect(perms['players.edit']).toBe('assigned_teams');
    expect(perms['users.manage']).toBeUndefined();
  });

  it('a Team Manager only sees and edits players in the assigned team', async () => {
    const list = await api(ctx, manager.token).get('/admin/players');
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((p) => p.id)).toEqual([String(firstPlayer._id)]);

    const own = await api(ctx, manager.token).get(`/admin/players/${firstPlayer._id}`);
    expect(own.status).toBe(200);
    expect(own.body.data.restricted.phone).toBe('08011111111');
    expect(own.body.data.sensitive).toBeUndefined(); // no highly-sensitive access by default

    const other = await api(ctx, manager.token).get(`/admin/players/${youthPlayer._id}`);
    expect(other.status).toBe(403);

    const edit = await api(ctx, manager.token).put(`/admin/players/${youthPlayer._id}`).send({ firstName: 'Kid', lastName: 'Star', position: 'Forward', team: String(youth._id) });
    expect(edit.status).toBe(403);

    // Cannot move own player into a team outside the assignment.
    const move = await api(ctx, manager.token).put(`/admin/players/${firstPlayer._id}`).send({ firstName: 'Ade', lastName: 'Bola', position: 'Forward', team: String(youth._id) });
    expect(move.status).toBe(403);
  });

  it('a Team Manager cannot manage staff, users or settings', async () => {
    expect((await api(ctx, manager.token).get('/admin/users')).status).toBe(403);
    expect((await api(ctx, manager.token).put(`/admin/staff/${media.staffId}/access`).send({ staffRole: 'director' })).status).toBe(403);
    expect((await api(ctx, manager.token).get('/admin/settings')).status).toBe(403);
  });

  it('a Media Officer manages news but not users, staff or scouting', async () => {
    const created = await api(ctx, media.token).post('/admin/news').send({ title: 'Season opener tickets', content: 'Tickets for the first home match go on sale on Monday morning.' });
    expect(created.status).toBe(201);
    expect((await api(ctx, media.token).get('/admin/users')).status).toBe(403);
    expect((await api(ctx, media.token).get('/admin/scouting/reports')).status).toBe(403);
    expect((await api(ctx, media.token).get('/admin/players')).status).toBe(403);
  });

  it('the IT Manager manages normal users but cannot touch the Director or see player data', async () => {
    expect((await api(ctx, it_.token).get('/admin/users')).status).toBe(200);
    const directorId = director.user.id;
    const res = await api(ctx, it_.token).post(`/admin/users/${directorId}/suspend`).send({ reason: 'Trying to lock out the director' });
    expect(res.status).toBe(403);
    expect((await api(ctx, it_.token).get(`/admin/players/${firstPlayer._id}`)).status).toBe(403);
    expect((await api(ctx, it_.token).get('/admin/scouting/reports')).status).toBe(403);
  });

  it('the Chairman has oversight but no destructive powers by default', async () => {
    expect((await api(ctx, chairman.token).get('/admin/audit')).status).toBe(200);
    expect((await api(ctx, chairman.token).get('/admin/players')).status).toBe(200);
    expect((await api(ctx, chairman.token).post(`/admin/users/${fan.user.id}/suspend`).send({ reason: 'test reason' })).status).toBe(403);
    expect((await api(ctx, chairman.token).delete(`/admin/players/${firstPlayer._id}`)).status).toBe(403);
    expect((await api(ctx, chairman.token).put(`/admin/staff/${manager.staffId}/access`).send({ staffRole: 'director' })).status).toBe(403);
  });

  it('nobody can change their own access', async () => {
    const own = await Staff.findOne({ staffRole: 'director' }).lean();
    const res = await api(ctx, director.token).put(`/admin/staff/${own._id}/access`).send({ staffRole: 'chairman' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_MODIFICATION');
  });

  it('staff with staff.manage cannot grant permissions they do not hold', async () => {
    // Give the chairman staff.manage only (plus defaults), then try to hand out users.manage.
    await api(ctx, director.token)
      .put(`/admin/staff/${chairman.staffId}/access`)
      .send({ staffRole: 'chairman', grants: [{ permission: 'dashboard.view', scope: 'all' }, { permission: 'staff.manage', scope: 'all' }, { permission: 'players.view', scope: 'all' }] });
    const escalate = await api(ctx, chairman.token)
      .put(`/admin/staff/${manager.staffId}/access`)
      .send({ staffRole: 'team_manager', grants: [{ permission: 'users.manage', scope: 'all' }] });
    expect(escalate.status).toBe(403);
    const makeDirector = await api(ctx, chairman.token).put(`/admin/staff/${manager.staffId}/access`).send({ staffRole: 'director' });
    expect(makeDirector.status).toBe(403);
    const allowed = await api(ctx, chairman.token)
      .put(`/admin/staff/${manager.staffId}/access`)
      .send({ staffRole: 'team_manager', grants: [{ permission: 'players.view', scope: 'assigned_teams' }, { permission: 'dashboard.view', scope: 'all' }], assignedTeams: [String(first._id)] });
    expect(allowed.status).toBe(200);
  });

  it('permission changes take effect immediately', async () => {
    // The manager lost players.edit in the previous test.
    const res = await api(ctx, manager.token).put(`/admin/players/${firstPlayer._id}`).send({ firstName: 'Ade', lastName: 'Bola', position: 'Forward', team: String(first._id) });
    expect(res.status).toBe(403);
  });

  it('the last active Director cannot be removed or demoted', async () => {
    const second = await createStaff(ctx, director.token, 'second-director@rbac.test', 'director');
    const own = await Staff.findOne({ user: director.user.id }).lean();
    // Second Director removes the first: allowed, because one Director remains.
    const remove = await api(ctx, second.token).post(`/admin/staff/${own._id}/remove`).send({ reason: 'Left the club' });
    expect(remove.status).toBe(200);
    // Nobody may now remove the only remaining Director (including via user suspension).
    const secondStaff = await Staff.findOne({ user: second.user.id }).lean();
    expect(secondStaff.staffRole).toBe('director');
    const selfRemove = await api(ctx, second.token).post(`/admin/staff/${secondStaff._id}/remove`).send({ reason: 'Oops wrong button' });
    expect(selfRemove.status).toBe(403);
  });

  it('suspending a staff member removes their access immediately', async () => {
    const director2 = await (await import('./setup.js')).login(ctx, 'second-director@rbac.test');
    const res = await api(ctx, director2.token).post(`/admin/staff/${media.staffId}/suspend`).send({ reason: 'Investigation' });
    expect(res.status).toBe(200);
    expect((await api(ctx, media.token).get('/admin/news')).status).toBe(401); // sessions revoked
  });
});
