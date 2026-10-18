import { it, expect, beforeAll } from 'vitest';
import { describeDb, setupApp, api, createDirector, createStaff, registerUser, mediaObject, CLOUD } from './setup.js';
import { Team, Player, Season, Competition, Match, Video, GalleryItem, AuditLog } from '../../src/models/index.js';

const videoFile = (n = 1) => ({
  publicId: `saki-stars/matches/clip${n}`,
  url: `https://res.cloudinary.com/${CLOUD}/video/upload/saki-stars/matches/clip${n}.mp4`,
  resourceType: 'video',
  format: 'mp4',
  bytes: 1000,
  duration: 60,
});

describeDb('player squads', () => {
  const ctx = setupApp('squads');
  let admin;
  let pub;
  let team;
  let legacy;

  beforeAll(async () => {
    const director = await createDirector(ctx);
    admin = api(ctx, director.token);
    pub = api(ctx);
    team = await Team.create({ name: 'First Team', slug: 'first-team', isClubTeam: true });
    // A record saved before squads existed: no squad field at all.
    legacy = await Player.create({ firstName: 'Old', lastName: 'Timer', slug: 'old-timer', position: 'Defender', team: team._id });
    await Player.collection.updateOne({ _id: legacy._id }, { $unset: { squad: '' } });
  });

  it('creates players in the chosen squad and validates the value on the server', async () => {
    const senior = await admin.post('/admin/players').send({ firstName: 'Musa', lastName: 'Okon', position: 'Forward', team: String(team._id), squad: 'senior' });
    expect(senior.status).toBe(201);
    expect(senior.body.data.squad).toBe('senior');
    const u19 = await admin.post('/admin/players').send({ firstName: 'Ayo', lastName: 'Young', position: 'Midfielder', squad: 'under19' });
    expect(u19.status).toBe(201);
    expect((await Player.findById(u19.body.data.id).lean()).squad).toBe('under19');

    const bad = await admin.post('/admin/players').send({ firstName: 'Bad', lastName: 'Squad', position: 'Forward', squad: 'reserves' });
    expect(bad.status).toBe(422);
    expect(JSON.stringify(bad.body)).toContain('squad');
  });

  it('squad pages never mix squads; players not assigned yet stay on /players and their profile', async () => {
    const senior = await pub.get('/players?squad=senior');
    expect(senior.body.data.items.map((p) => p.name)).toEqual(['Musa Okon']);
    const u19 = await pub.get('/players?squad=under19');
    expect(u19.body.data.items.map((p) => p.name)).toEqual(['Ayo Young']);
    expect((await pub.get('/players?squad=nonsense')).status).toBe(422);

    const all = await pub.get('/players');
    expect(all.body.data.items.map((p) => p.name).sort()).toEqual(['Ayo Young', 'Musa Okon', 'Old Timer']);
    expect(all.body.data.items.find((p) => p.name === 'Old Timer').squad).toBeNull();
    expect((await pub.get('/players/old-timer')).status).toBe(200);
  });

  it('staff can find unassigned players, assign a squad, and editing without a squad keeps it', async () => {
    const list = await admin.get('/admin/players?squad=unassigned');
    expect(list.body.data.items.map((p) => p.fullName)).toEqual(['Old Timer']);
    expect(list.body.data.unassignedSquadCount).toBe(1);

    const base = { firstName: 'Old', lastName: 'Timer', position: 'Defender', team: String(team._id) };
    const assigned = await admin.put(`/admin/players/${legacy._id}`).send({ ...base, squad: 'senior' });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.squad).toBe('senior');

    // An older form that does not send the field must not clear it.
    const kept = await admin.put(`/admin/players/${legacy._id}`).send({ ...base, bio: 'Club legend' });
    expect(kept.body.data.squad).toBe('senior');

    expect((await admin.get('/admin/players?squad=unassigned')).body.data.unassignedSquadCount).toBe(0);
    const audit = await AuditLog.findOne({ action: 'player.updated', entityId: legacy._id }).sort({ createdAt: 1 }).lean();
    expect(audit.metadata.before.squad).toBeNull();
    expect(audit.metadata.after.squad).toBe('senior');
  });
});

describeDb('match media: full match, highlights and photos', () => {
  const ctx = setupApp('matchmedia');
  let director;
  let mediaOfficer;
  let manager;
  let otherManager;
  let fan;
  let pub;
  let match;
  let other;

  beforeAll(async () => {
    director = await createDirector(ctx);
    pub = api(ctx);
    const club = await Team.create({ name: 'Saki Stars First Team', slug: 'ssfc', isClubTeam: true });
    const youth = await Team.create({ name: 'Saki Stars U19', slug: 'ssfc-u19', isClubTeam: true });
    const opp = await Team.create({ name: 'Rivers United', slug: 'rivers', isClubTeam: false });
    const season = await Season.create({ name: '2026/27', startDate: new Date('2026-08-01'), endDate: new Date('2027-06-30'), isCurrent: true });
    const comp = await Competition.create({ name: 'League', slug: 'league', seasons: [season._id], currentSeason: season._id, teams: [club._id, opp._id] });
    const base = { competition: comp._id, season: season._id, status: 'completed', score: { home: 1, away: 0 } };
    match = await Match.create({ ...base, homeTeam: club._id, awayTeam: opp._id, kickoffAt: new Date(Date.now() - 86400000) });
    other = await Match.create({ ...base, homeTeam: youth._id, awayTeam: opp._id, kickoffAt: new Date(Date.now() - 2 * 86400000) });
    mediaOfficer = await createStaff(ctx, director.token, 'media@mm.test', 'media_officer');
    manager = await createStaff(ctx, director.token, 'tm@mm.test', 'team_manager', { assignedTeams: [String(club._id)] });
    otherManager = await createStaff(ctx, director.token, 'tm2@mm.test', 'team_manager', { assignedTeams: [String(youth._id)] });
    fan = await registerUser(ctx, 'fan@mm.test');
  });

  it('legacy matches without media show no media actions', async () => {
    const res = await pub.get(`/matches/${match._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.media).toEqual({ fullMatch: null, highlights: null, photoCount: 0 });
    const list = await pub.get('/matches?status=completed');
    expect(list.body.data.items.every((m) => m.media && m.media.photoCount === 0 && !m.media.fullMatch)).toBe(true);
  });

  it('only media staff and match staff in scope can manage match media', async () => {
    const body = { source: 'youtube', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' };
    expect((await api(ctx).put(`/admin/matches/${match._id}/media/full-match`).send(body)).status).toBe(401);
    expect((await api(ctx, fan.token).put(`/admin/matches/${match._id}/media/full-match`).send(body)).status).toBe(403);
    expect((await api(ctx, otherManager.token).put(`/admin/matches/${match._id}/media/full-match`).send(body)).status).toBe(403);
    expect((await api(ctx, otherManager.token).post(`/admin/matches/${match._id}/photos`).send({ images: [mediaObject('matches')] })).status).toBe(403);
    expect(await Match.findById(match._id).then((m) => m.fullMatchVideo)).toBeNull();
  });

  it('a media officer adds a full match (YouTube) and highlights (upload); the public match shows both separately', async () => {
    const officer = api(ctx, mediaOfficer.token);
    // Media staff can open the match in the dashboard.
    expect((await officer.get(`/admin/matches/${match._id}`)).status).toBe(200);
    expect((await officer.get('/admin/matches')).status).toBe(200);

    const bad = await officer.put(`/admin/matches/${match._id}/media/full-match`).send({ source: 'youtube', youtubeUrl: 'https://example.com/not-youtube' });
    expect(bad.status).toBe(422);
    const notOurs = await officer.put(`/admin/matches/${match._id}/media/highlights`).send({ source: 'cloudinary', media: { ...videoFile(), url: 'https://evil.example/x.mp4' } });
    expect(notOurs.status).toBe(422);

    const full = await officer.put(`/admin/matches/${match._id}/media/full-match`).send({ source: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(full.status).toBe(200);
    expect(full.body.data.fullMatch.youtubeId).toBe('dQw4w9WgXcQ');
    expect(full.body.data.fullMatch.category).toBe('Full Match');
    const hl = await officer.put(`/admin/matches/${match._id}/media/highlights`).send({ source: 'cloudinary', media: videoFile(1), title: 'Goals and saves' });
    expect(hl.status).toBe(200);
    expect(hl.body.data.highlights.title).toBe('Goals and saves');
    expect(hl.body.data.highlights.category).toBe('Match Highlights');

    const res = await pub.get(`/matches/${match._id}`);
    expect(res.body.data.media.fullMatch.youtubeId).toBe('dQw4w9WgXcQ');
    expect(res.body.data.media.highlights.source).toBe('cloudinary');
    expect(res.body.data.media.highlights.id).not.toBe(res.body.data.media.fullMatch.id);
    expect(res.body.data.highlightsVideo.id).toBe(res.body.data.media.highlights.id); // existing field kept
  });

  it('replacing a video updates it in place and removes the old file; removing unlinks it', async () => {
    const officer = api(ctx, mediaOfficer.token);
    const before = await Video.countDocuments();
    const replaced = await officer.put(`/admin/matches/${match._id}/media/highlights`).send({ source: 'cloudinary', media: videoFile(2) });
    expect(replaced.status).toBe(200);
    expect(await Video.countDocuments()).toBe(before);
    expect(ctx.media.destroyed).toContain('saki-stars/matches/clip1');

    const removed = await officer.delete(`/admin/matches/${match._id}/media/highlights`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.highlights).toBeNull();
    expect((await pub.get(`/matches/${match._id}`)).body.data.media.highlights).toBeNull();
    expect(await Video.countDocuments({ deletedAt: null })).toBe(before); // still in the library
  });

  it('an unpublished or deleted video is never offered to visitors', async () => {
    const m = await Match.findById(match._id);
    await Video.updateOne({ _id: m.fullMatchVideo }, { status: 'draft' });
    expect((await pub.get(`/matches/${match._id}`)).body.data.media.fullMatch).toBeNull();
    await Video.updateOne({ _id: m.fullMatchVideo }, { status: 'published' });
    expect((await pub.get(`/matches/${match._id}`)).body.data.media.fullMatch).not.toBeNull();
  });

  it('a team manager adds photos to their own match; photos belong to that match only', async () => {
    const tm = api(ctx, manager.token);
    const added = await tm.post(`/admin/matches/${match._id}/photos`).send({ images: [mediaObject('matches', 1), mediaObject('matches', 2), mediaObject('matches', 3)], photographer: 'Club media' });
    expect(added.status).toBe(201);
    expect(added.body.data.photos).toHaveLength(3);
    expect(await GalleryItem.countDocuments({ match: match._id, category: 'Matches', status: 'published' })).toBe(3);

    const gallery = await pub.get(`/gallery?match=${match._id}`);
    expect(gallery.body.data.items).toHaveLength(3);
    expect((await pub.get(`/gallery?match=${other._id}`)).body.data.items).toHaveLength(0);
    expect((await pub.get(`/matches/${match._id}`)).body.data.media.photoCount).toBe(3);
    const list = await pub.get('/matches?status=completed');
    expect(list.body.data.items.find((x) => x.id === String(match._id)).media.photoCount).toBe(3);
    expect(list.body.data.items.find((x) => x.id === String(other._id)).media.photoCount).toBe(0);

    // A team manager cannot pick videos from the club-wide library.
    const lib = await tm.put(`/admin/matches/${match._id}/media/highlights`).send({ video: String((await Video.findOne())._id) });
    expect(lib.status).toBe(403);

    const photoId = added.body.data.photos[0].id;
    expect((await tm.patch(`/admin/matches/${match._id}/photos/${photoId}`).send({ caption: 'Winning goal' })).body.data.photos[0].caption).toBe('Winning goal');
    // A photo cannot be removed through a different match.
    expect((await api(ctx, director.token).delete(`/admin/matches/${other._id}/photos/${photoId}`)).status).toBe(404);
    const removed = await tm.delete(`/admin/matches/${match._id}/photos/${photoId}`);
    expect(removed.body.data.photos).toHaveLength(2);
    expect((await pub.get(`/matches/${match._id}`)).body.data.media.photoCount).toBe(2);
  });

  it('competition result lists carry the same media summary', async () => {
    const res = await pub.get(`/competitions/league/matches?type=results`);
    const row = res.body.data.find((x) => x.id === String(match._id));
    expect(row.media.photoCount).toBe(2);
    expect(row.media.fullMatch).not.toBeNull();
  });
});
