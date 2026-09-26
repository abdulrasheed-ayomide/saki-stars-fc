import { it, expect, beforeAll } from 'vitest';
import { describeDb, setupApp, api, createDirector, registerUser } from './setup.js';
import { Video } from '../../src/models/index.js';
import { migrateLegacyVideoCategories } from '../../src/models/Content.js';

/**
 * Admin-created records must reach the public website through the same rules everywhere
 * (list, profile, search), without exposing private fields.
 */
describeDb('public data flow: players, staff, seasons, video categories', () => {
  const ctx = setupApp('publicdata');
  let admin;
  let pub;
  const ids = {};

  beforeAll(async () => {
    const director = await createDirector(ctx);
    admin = api(ctx, director.token);
    pub = api(ctx);
    ids.club = (await admin.post('/admin/teams').send({ name: 'Saki Stars First Team', isClubTeam: true })).body.data.id;
    ids.archived = (await admin.post('/admin/teams').send({ name: 'Old Reserves', isClubTeam: true })).body.data.id;
    ids.opponent = (await admin.post('/admin/teams').send({ name: 'Rivers United' })).body.data.id;
  });

  async function createPlayer(body) {
    const res = await admin.post('/admin/players').send({ position: 'Midfielder', ...body });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data;
  }

  it('a player saved WITHOUT a team appears on /players and on their profile (the reported bug)', async () => {
    const p = await createPlayer({
      firstName: 'Tunde',
      lastName: 'Okafor',
      restricted: { dateOfBirth: '2000-02-02', phone: '+234 800 000 0000', address: '1 Private Road', internalNotes: 'secret note' },
      sensitive: { nationalId: 'NIN-123', medicalNotes: 'asthma' },
    });
    const list = await pub.get('/players');
    expect(list.status).toBe(200);
    const listed = list.body.data.items.find((x) => x.slug === p.slug);
    expect(listed).toBeTruthy();
    const profile = await pub.get(`/players/${p.slug}`);
    expect(profile.status).toBe(200);
    // Only public fields are returned, in the list and on the profile.
    for (const body of [listed, profile.body.data]) {
      const text = JSON.stringify(body);
      for (const secret of ['2000-02-02', '+234 800', 'Private Road', 'secret note', 'NIN-123', 'asthma']) expect(text).not.toContain(secret);
      for (const key of ['dateOfBirth', 'restricted', 'sensitive', 'internalNotes', 'phone', 'address']) expect(body).not.toHaveProperty(key);
    }
    // Search uses the same rule.
    const search = await pub.get('/search?q=Okafor');
    expect(search.body.data.players.some((x) => x.slug === p.slug)).toBe(true);
  });

  it('a player on a club team appears; list and profile always agree', async () => {
    const p = await createPlayer({ firstName: 'Musa', lastName: 'Bello', team: ids.club });
    expect((await pub.get('/players')).body.data.items.some((x) => x.slug === p.slug)).toBe(true);
    expect((await pub.get(`/players?team=${ids.club}`)).body.data.items.some((x) => x.slug === p.slug)).toBe(true);
    expect((await pub.get(`/players/${p.slug}`)).status).toBe(200);
  });

  it('hidden, archived-team and opponent players are hidden from BOTH the list and the profile', async () => {
    const hidden = await createPlayer({ firstName: 'Hidden', lastName: 'Player', showOnWebsite: false });
    const onArchived = await createPlayer({ firstName: 'Archived', lastName: 'Teamer', team: ids.archived });
    const archive = await admin.put(`/admin/teams/${ids.archived}`).send({ name: 'Old Reserves', isClubTeam: true, status: 'archived' });
    expect(archive.status, JSON.stringify(archive.body)).toBe(200);
    const list = (await pub.get('/players')).body.data.items.map((x) => x.slug);
    for (const p of [hidden, onArchived]) {
      expect(list).not.toContain(p.slug);
      expect((await pub.get(`/players/${p.slug}`)).status).toBe(404);
    }
    expect((await pub.get(`/players?team=${ids.opponent}`)).body.data.items).toEqual([]);
  });

  it('the homepage player count uses the same rule', async () => {
    const stats = await pub.get('/club-stats');
    expect(stats.status).toBe(200);
    const listTotal = (await pub.get('/players')).body.data.total;
    expect(JSON.stringify(stats.body.data)).toContain(String(listTotal));
  });

  it('staff appointed as a senior role are public by default; private fields stay private', async () => {
    await registerUser(ctx, 'manager@club.test', 'Mary Manager');
    const res = await admin.post('/admin/staff/appoint').send({ email: 'manager@club.test', staffRole: 'team_manager', useDefaultGrants: true });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.showOnWebsite).toBe(true);
    const staffList = await pub.get('/staff');
    const listed = staffList.body.data.find((s) => s.fullName === 'Mary Manager');
    expect(listed).toBeTruthy();
    for (const key of ['grants', 'privatePhone', 'internalNotes', 'status', 'email', 'user']) expect(listed).not.toHaveProperty(key);

    await registerUser(ctx, 'scout@club.test', 'Sam Scout');
    const scout = await admin.post('/admin/staff/appoint').send({ email: 'scout@club.test', staffRole: 'scout', useDefaultGrants: true });
    expect(scout.body.data.showOnWebsite).toBe(false);
    expect((await pub.get('/staff')).body.data.some((s) => s.fullName === 'Sam Scout')).toBe(false);
  });

  it('seasons by year: several seasons exist, one is current, switching keeps history', async () => {
    const s25 = (await admin.post('/admin/seasons').send({ name: '2025', startDate: '2025-01-01', endDate: '2025-12-31', isCurrent: true })).body.data;
    const s26 = await admin.post('/admin/seasons').send({ name: '2026', startDate: '2026-01-01', endDate: '2026-12-31', isCurrent: true });
    expect(s26.status).toBe(201);
    await admin.post('/admin/seasons').send({ name: '2027', startDate: '2027-01-01', endDate: '2027-12-31', status: 'upcoming' });
    const seasons = (await pub.get('/seasons')).body.data;
    expect(seasons.map((s) => s.name)).toEqual(['2027', '2026', '2025']);
    expect(seasons.filter((s) => s.isCurrent).map((s) => s.name)).toEqual(['2026']);
    // 2025 still exists, unchanged apart from no longer being current.
    const old = seasons.find((s) => s.id === s25.id);
    expect(old).toMatchObject({ name: '2025', status: 'active', isCurrent: false });
    const dup = await admin.post('/admin/seasons').send({ name: '2026', startDate: '2026-01-01', endDate: '2026-12-31' });
    expect(dup.status).toBe(409);
  });

  it('video categories: NLO and NYL exist; old "Youth" videos keep working and are renamed', async () => {
    const nlo = await admin.post('/admin/videos').send({ title: 'NLO highlights', category: 'Nigeria Nationwide League One (NLO)', source: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', status: 'published' });
    expect(nlo.status, JSON.stringify(nlo.body)).toBe(201);
    const list = await pub.get('/videos');
    expect(list.body.data.categories).toEqual(expect.arrayContaining(['Nigeria Nationwide League One (NLO)', 'Nigeria Youth League (NYL)']));
    expect(list.body.data.categories).not.toContain('Youth');

    // A video saved before the rename (raw database value).
    await Video.collection.insertOne({ title: 'Old youth clip', category: 'Youth', source: 'youtube', youtubeId: 'dQw4w9WgXcQ', status: 'published', deletedAt: null, featured: false, publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
    const before = (await pub.get('/videos')).body.data.items.find((v) => v.title === 'Old youth clip');
    expect(before.category).toBe('Nigeria Youth League (NYL)'); // shown with the new name even before migration
    expect((await pub.get('/videos?category=Youth')).status).toBe(200); // old links still work
    expect(await migrateLegacyVideoCategories()).toBe(1);
    expect(await migrateLegacyVideoCategories()).toBe(0); // idempotent
    const filtered = (await pub.get(`/videos?category=${encodeURIComponent('Nigeria Youth League (NYL)')}`)).body.data.items;
    expect(filtered.map((v) => v.title)).toContain('Old youth clip');
  });
});
