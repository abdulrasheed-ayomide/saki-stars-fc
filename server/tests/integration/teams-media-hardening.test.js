import { it, expect, beforeAll } from 'vitest';
import { describeDb, setupApp, api, createDirector, createStaff, registerUser, mediaObject } from './setup.js';
import mongoose from 'mongoose';
import { GalleryItem, Video, Team } from '../../src/models/index.js';

/**
 * Hardening of 2 Oct:
 *  1. opponents have no standalone public team page
 *  2. the public teams list can only return Saki Stars teams
 *  3. attaching an EXISTING photo/video to a player (tag only, no copies)
 *  4. team type (club team / opponent) is required by the API
 */
describeDb('teams and player-media hardening', () => {
  const ctx = setupApp('hardening');
  let director;
  let admin;
  let pub;
  let media;
  const ids = {};
  const past = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const future = (days) => new Date(Date.now() + days * 86400000).toISOString();

  beforeAll(async () => {
    director = await createDirector(ctx);
    admin = api(ctx, director.token);
    pub = api(ctx);
    media = await createStaff(ctx, director.token, 'media@hardening.test', 'media_officer');

    ids.season = (await admin.post('/admin/seasons').send({ name: '2026/27', startDate: '2026-08-01', endDate: '2027-06-30', isCurrent: true })).body.data.id;
    const club = (await admin.post('/admin/teams').send({ name: 'Saki Stars First Team', isClubTeam: true })).body.data;
    const opp = (await admin.post('/admin/teams').send({ name: 'Rivers United', isClubTeam: false })).body.data;
    ids.club = club.id;
    ids.clubSlug = club.slug;
    ids.opp = opp.id;
    ids.oppSlug = opp.slug;
    ids.league = (
      await admin.post('/admin/competitions').send({ name: 'Nigeria League One', type: 'league', seasons: [ids.season], currentSeason: ids.season, teams: [ids.club, ids.opp] })
    ).body.data.id;
    const make = (home, away, when) => admin.post('/admin/matches').send({ competition: ids.league, season: ids.season, homeTeam: home, awayTeam: away, kickoffAt: when });
    ids.played = (await make(ids.club, ids.opp, past(3))).body.data.id;
    ids.upcoming = (await make(ids.opp, ids.club, future(4))).body.data.id;
    const result = await admin.put(`/admin/matches/${ids.played}/result`).send({ score: { home: 1, away: 1 } });
    expect(result.status, JSON.stringify(result.body)).toBe(200);

    ids.player = (await admin.post('/admin/players').send({ firstName: 'Ade', lastName: 'Test', position: 'Forward', team: ids.club })).body.data;
  });

  // ---- 1 & 2: public team visibility --------------------------------------------------
  it('the public Saki Stars team page works', async () => {
    const res = await pub.get(`/teams/${ids.clubSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Saki Stars First Team');
    expect((await pub.get(`/teams/${ids.club}`)).status).toBe(200); // by id too
  });

  it('an opponent has no public team page (normal not found), by slug or by id', async () => {
    for (const ref of [ids.oppSlug, ids.opp]) {
      const res = await pub.get(`/teams/${ref}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(JSON.stringify(res.body)).not.toMatch(/Rivers/);
    }
    // Still in the database, untouched.
    expect(await Team.exists({ _id: ids.opp, isClubTeam: false })).toBeTruthy();
  });

  it('the public teams list cannot be made to include opponents', async () => {
    for (const qs of ['', '?include=all', '?include=club', `?competition=${ids.league}`, `?competition=${ids.league}&include=all`]) {
      const res = await pub.get(`/teams${qs}`);
      expect(res.status, qs).toBe(200);
      expect(res.body.data.map((t) => t.name), qs).toEqual(['Saki Stars First Team']);
    }
    // Staff forms still get opponents from the signed-in list.
    const staffList = await admin.get('/admin/teams?limit=200');
    expect(staffList.body.data.items.map((t) => t.name).sort()).toEqual(['Rivers United', 'Saki Stars First Team']);
    expect((await pub.get('/admin/teams')).status).toBe(401);
  });

  it('opponents still appear in fixtures, results, match pages and the league table', async () => {
    const fixtures = await pub.get('/matches?status=upcoming');
    expect(fixtures.status).toBe(200);
    expect(fixtures.body.data.items.find((m) => m.id === ids.upcoming).homeTeam.name).toBe('Rivers United');

    const results = await pub.get('/matches?status=completed');
    expect(results.status).toBe(200);
    expect(results.body.data.items.find((m) => m.id === ids.played).awayTeam.name).toBe('Rivers United');

    const match = await pub.get(`/matches/${ids.played}`);
    expect(match.status).toBe(200);
    expect(match.body.data.awayTeam.name).toBe('Rivers United');

    const table = await pub.get(`/competitions/${ids.league}/standings`);
    expect(table.status).toBe(200);
    const rows = Object.fromEntries(table.body.data.rows.map((r) => [r.team.name, r]));
    expect(rows['Rivers United']).toMatchObject({ played: 1, drawn: 1, points: 1 });
    expect(rows['Saki Stars First Team']).toMatchObject({ played: 1, drawn: 1, points: 1 });

    const comp = await pub.get(`/competitions/${ids.league}`);
    expect(comp.status).toBe(200);
  });

  // ---- 4: team type validated by the API ------------------------------------------------
  it('creating or updating a team requires an explicit team type, and a rejected update changes nothing', async () => {
    const before = await Team.find({}).sort({ _id: 1 }).lean();

    const noType = await admin.post('/admin/teams').send({ name: 'Mystery FC' });
    expect(noType.status).toBe(422);
    expect(noType.body.error.details.find((d) => d.path === 'isClubTeam').message).toBe('Choose whether this is a Saki Stars team or an opponent.');
    for (const bad of ['true', 'yes', 1, null]) {
      expect((await admin.post('/admin/teams').send({ name: 'Mystery FC', isClubTeam: bad })).status, String(bad)).toBe(422);
    }
    // Updates without a type are refused too (previously this would have turned a club team into an opponent).
    const updClub = await admin.put(`/admin/teams/${ids.club}`).send({ name: 'Saki Stars First Team' });
    expect(updClub.status).toBe(422);
    const updOpp = await admin.put(`/admin/teams/${ids.opp}`).send({ name: 'Rivers United' });
    expect(updOpp.status).toBe(422);

    // Nothing was created or changed by the rejected requests.
    const after = await Team.find({}).sort({ _id: 1 }).lean();
    expect(after).toEqual(before);
    expect(await Team.exists({ name: 'Mystery FC' })).toBeNull();

    // Valid requests still work and keep relationships.
    const ok = await admin.put(`/admin/teams/${ids.opp}`).send({ name: 'Rivers United', isClubTeam: false, competitions: [ids.league] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.isClubTeam).toBe(false);
    const created = await admin.post('/admin/teams').send({ name: 'Kano Pillars', isClubTeam: false });
    expect(created.status).toBe(201);
    expect((await pub.get(`/competitions/${ids.league}/standings`)).body.data.rows.some((r) => r.team.name === 'Rivers United')).toBe(true);
  });

  // ---- 3: attach existing media to a player ---------------------------------------------
  it('authorized staff can attach an existing photo and an existing video to a player, without copying them', async () => {
    const m = api(ctx, media.token);
    const photo = await m.post('/admin/gallery').send({ title: 'Derby day crowd', category: 'Matches', image: { source: 'link', url: 'https://images.example.org/derby.jpg' } });
    const upload = await m.post('/admin/gallery').send({ title: 'Training session', category: 'Training', image: mediaObject('gallery') });
    const video = await m.post('/admin/videos').send({ title: 'Derby highlights', category: 'Goals', source: 'youtube', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' });
    expect([photo.status, upload.status, video.status]).toEqual([201, 201, 201]);
    ids.photo = photo.body.data.id;
    ids.upload = upload.body.data.id;
    ids.video = video.body.data.id;
    const counts = [await GalleryItem.countDocuments(), await Video.countDocuments()];

    // The picker can search the existing library.
    const search = await m.get('/admin/gallery?q=derby&limit=10');
    expect(search.status).toBe(200);
    expect(search.body.data.items.map((i) => i.id)).toEqual([ids.photo]);
    expect((await m.get('/admin/videos?q=highlights')).body.data.items.map((i) => i.id)).toEqual([ids.video]);

    const p = ids.player.id;
    expect((await m.post(`/admin/players/${p}/media/photo/${ids.photo}`)).body.data).toMatchObject({ alreadyTagged: false });
    expect((await m.post(`/admin/players/${p}/media/photo/${ids.upload}`)).status).toBe(200);
    expect((await m.post(`/admin/players/${p}/media/video/${ids.video}`)).body.data).toMatchObject({ alreadyTagged: false });
    // Attaching twice does not duplicate the tag.
    expect((await m.post(`/admin/players/${p}/media/photo/${ids.photo}`)).body.data).toMatchObject({ alreadyTagged: true });
    expect((await GalleryItem.findById(ids.photo).lean()).players.map(String)).toEqual([p]);

    // No media records were created.
    expect([await GalleryItem.countDocuments(), await Video.countDocuments()]).toEqual(counts);

    const list = (await m.get(`/admin/players/${p}/media`)).body.data;
    expect(list.photos.map((x) => x.id).sort()).toEqual([ids.photo, ids.upload].sort());
    expect(list.videos.map((x) => x.id)).toEqual([ids.video]);
    // Cloudinary upload record unchanged by tagging.
    expect(list.photos.find((x) => x.id === ids.upload).image).toMatchObject({ source: 'cloudinary', publicId: expect.stringContaining('saki-stars/gallery/') });

    // Public profile shows the attached (published) media.
    const profile = (await pub.get(`/players/${ids.player.slug}`)).body.data.media;
    expect(profile.photos).toHaveLength(2);
    expect(profile.videos[0].youtubeId).toBe('dQw4w9WgXcQ');
  });

  it('removing the player again keeps the media item', async () => {
    const m = api(ctx, media.token);
    const p = ids.player.id;
    expect((await m.delete(`/admin/players/${p}/media/photo/${ids.photo}`)).status).toBe(200);
    expect((await m.delete(`/admin/players/${p}/media/video/${ids.video}`)).status).toBe(200);
    const photo = await GalleryItem.findById(ids.photo).lean();
    expect(photo.deletedAt).toBeNull();
    expect(photo.players).toEqual([]);
    expect(await Video.exists({ _id: ids.video, deletedAt: null })).toBeTruthy();
    expect((await pub.get('/gallery')).body.data.items.some((g) => g.id === ids.photo)).toBe(true);
  });

  it('hidden or deleted items, unknown players and full items are handled', async () => {
    const m = api(ctx, media.token);
    const p = ids.player.id;
    // Hidden photo can be attached by staff, but is not shown publicly.
    const hidden = await m.post('/admin/gallery').send({ category: 'Training', image: { source: 'link', url: 'https://images.example.org/private.jpg' }, status: 'hidden' });
    expect((await m.post(`/admin/players/${p}/media/photo/${hidden.body.data.id}`)).status).toBe(200);
    expect((await pub.get(`/players/${ids.player.slug}`)).body.data.media.photos.some((x) => x.id === hidden.body.data.id)).toBe(false);

    // Deleted item / unknown item / unknown player.
    await GalleryItem.updateOne({ _id: hidden.body.data.id }, { $set: { deletedAt: new Date() } });
    expect((await m.post(`/admin/players/${p}/media/photo/${hidden.body.data.id}`)).status).toBe(404);
    expect((await m.post(`/admin/players/${p}/media/video/${ids.photo}`)).status).toBe(404); // a photo id is not a video
    expect((await m.post(`/admin/players/000000000000000000000000/media/photo/${ids.photo}`)).status).toBe(404);
    expect((await m.post(`/admin/players/${p}/media/album/${ids.photo}`)).status).toBe(422);

    // The 30-player limit is enforced.
    const full = await GalleryItem.create({ category: 'Matches', image: { source: 'link', url: 'https://images.example.org/team.jpg' }, players: Array.from({ length: 30 }, () => new mongoose.Types.ObjectId()) });
    expect((await m.post(`/admin/players/${p}/media/photo/${full._id}`)).status).toBe(409);
  });

  it('unauthorized users cannot attach media', async () => {
    const p = ids.player.id;
    // Team Manager of this player's team can view the player but has no media.manage.
    const tm = await createStaff(ctx, director.token, 'tm@hardening.test', 'team_manager', { assignedTeams: [ids.club] });
    expect((await api(ctx, tm.token).get(`/admin/players/${p}/media`)).status).toBe(200);
    expect((await api(ctx, tm.token).post(`/admin/players/${p}/media/photo/${ids.photo}`)).status).toBe(403);
    expect((await api(ctx, tm.token).get('/admin/gallery?q=derby')).status).toBe(403);
    const fan = await registerUser(ctx, 'fan@hardening.test');
    expect((await api(ctx, fan.token).post(`/admin/players/${p}/media/photo/${ids.photo}`)).status).toBe(403);
    expect((await pub.post(`/admin/players/${p}/media/photo/${ids.photo}`)).status).toBe(401);
    expect((await GalleryItem.findById(ids.photo).lean()).players).toEqual([]);
  });
});
