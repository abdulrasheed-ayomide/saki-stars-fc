import { it, expect, beforeAll } from 'vitest';
import { describeDb, setupApp, api, createDirector, createStaff, registerUser, mediaObject } from './setup.js';
import { GalleryItem, Video, Player } from '../../src/models/index.js';
import { externalImageProblem } from '../../src/validation/common.js';

const IMG = 'https://images.example.org/club/match-day.jpg';

/** Upload-or-link media, player media tags, and the permissions around them. */
describeDb('media links and player media', () => {
  const ctx = setupApp('medialinks');
  let director;
  let admin;
  let media;
  let pub;
  const ids = {};

  beforeAll(async () => {
    director = await createDirector(ctx);
    admin = api(ctx, director.token);
    pub = api(ctx);
    media = await createStaff(ctx, director.token, 'media@links.test', 'media_officer');
    ids.club = (await admin.post('/admin/teams').send({ name: 'Saki Stars First Team', isClubTeam: true })).body.data.id;
    const mk = async (firstName, extra = {}) => (await admin.post('/admin/players').send({ firstName, lastName: 'Test', position: 'Forward', team: ids.club, ...extra })).body.data;
    ids.a = await mk('Ade');
    ids.b = await mk('Bola');
    ids.minor = await mk('Kemi', { hidePhotoPublicly: true });
    ids.hidden = await mk('Hidden', { showOnWebsite: false });
  });

  it('validates external image links on the server', () => {
    expect(externalImageProblem(IMG)).toBeNull();
    expect(externalImageProblem('https://scontent.fbcdn.net/v/t39/photo.jpg?oe=1234')).toBeNull(); // direct CDN file: allowed
    for (const bad of [
      'http://images.example.org/a.jpg',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'https://user:pass@images.example.org/a.jpg',
      '<iframe src="https://evil.example"></iframe>',
      'https://localhost/a.jpg',
      'https://127.0.0.1/a.jpg',
      `https://images.example.org/${'a'.repeat(1001)}`,
    ]) {
      expect(externalImageProblem(bad), bad).toBeTruthy();
    }
    expect(externalImageProblem('https://www.facebook.com/sakistars/photos/123')).toMatch(/page or post, not to an image/);
    expect(externalImageProblem('https://www.instagram.com/p/abc/')).toMatch(/page or post/);
  });

  it('image fields accept a link or an upload; existing Cloudinary uploads keep working', async () => {
    const linked = await admin.put(`/admin/players/${ids.a.id}`).send({ firstName: 'Ade', lastName: 'Test', position: 'Forward', team: ids.club, photo: { source: 'link', url: IMG, alt: 'Ade' } });
    expect(linked.status, JSON.stringify(linked.body)).toBe(200);
    expect(linked.body.data.photo).toMatchObject({ source: 'link', url: IMG, publicId: null });
    const profile = (await pub.get(`/players/${ids.a.slug}`)).body.data;
    expect(profile.photo).toMatchObject({ source: 'link', url: IMG });

    const upload = mediaObject('players');
    const uploaded = await admin.put(`/admin/players/${ids.a.id}`).send({ firstName: 'Ade', lastName: 'Test', position: 'Forward', team: ids.club, photo: upload });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.data.photo).toMatchObject({ source: 'cloudinary', url: upload.url, publicId: upload.publicId });

    const team = await admin.put(`/admin/teams/${ids.club}`).send({ name: 'Saki Stars First Team', isClubTeam: true, logo: { source: 'link', url: 'https://images.example.org/crest.png' } });
    expect(team.status, JSON.stringify(team.body)).toBe(200);
    expect(team.body.data.logo.url).toBe('https://images.example.org/crest.png');
  });

  it('rejects unsafe links, fake Cloudinary files, and links where only uploads are allowed', async () => {
    const base = { firstName: 'Ade', lastName: 'Test', position: 'Forward', team: ids.club };
    for (const photo of [
      { source: 'link', url: 'javascript:alert(1)' },
      { source: 'link', url: 'http://images.example.org/a.jpg' },
      { source: 'link', url: 'https://www.facebook.com/sakistars/photos/1' },
      { url: 'https://evil.example/a.jpg', publicId: 'x' }, // pretends to be an upload
    ]) {
      const res = await admin.put(`/admin/players/${ids.a.id}`).send({ ...base, photo });
      expect(res.status, JSON.stringify(photo)).toBe(422);
    }
    // Video files stay upload-only (YouTube is the link workflow for video).
    const v = await admin.post('/admin/videos').send({ title: 'Clip', category: 'Goals', source: 'cloudinary', media: { source: 'link', url: IMG } });
    expect(v.status).toBe(422);
  });

  it('gallery photos can be a link and can feature several players; profiles show only published media', async () => {
    const photo = await api(ctx, media.token).post('/admin/gallery').send({ category: 'Matches', image: { source: 'link', url: IMG, alt: 'Goal celebration' }, players: [ids.a.id, ids.b.id, ids.minor.id] });
    expect(photo.status, JSON.stringify(photo.body)).toBe(201);
    ids.photo = photo.body.data.id;
    expect(photo.body.data.players.map((p) => p.id).sort()).toEqual([ids.a.id, ids.b.id, ids.minor.id].sort());
    await api(ctx, media.token).post('/admin/gallery').send({ category: 'Training', image: { source: 'link', url: 'https://images.example.org/secret.jpg' }, players: [ids.a.id], status: 'hidden' });

    const video = await api(ctx, media.token).post('/admin/videos').send({ title: 'Ade scores twice', category: 'Goals', source: 'youtube', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', players: [ids.a.id] });
    expect(video.status, JSON.stringify(video.body)).toBe(201);
    ids.video = video.body.data.id;
    await api(ctx, media.token).post('/admin/videos').send({ title: 'Draft clip', category: 'Goals', source: 'youtube', youtubeUrl: 'dQw4w9WgXcQ', players: [ids.a.id], status: 'draft' });

    const a = (await pub.get(`/players/${ids.a.slug}`)).body.data;
    expect(a.media.photos.map((p) => p.id)).toEqual([ids.photo]); // hidden photo excluded
    expect(a.media.videos.map((v) => v.title)).toEqual(['Ade scores twice']); // draft excluded
    expect(a.media.videos[0].youtubeId).toBe('dQw4w9WgXcQ');
    // Public media never reveals who else is tagged (or tags of hidden players).
    expect(JSON.stringify(a.media)).not.toMatch(/"players"/);
    expect((await pub.get(`/players/${ids.b.slug}`)).body.data.media.photos).toHaveLength(1);
    // Photo hidden publicly (minor): no tagged photos on the profile.
    expect((await pub.get(`/players/${ids.minor.slug}`)).body.data.media.photos).toEqual([]);
    // Players hidden from the website have no public profile at all.
    expect((await pub.get(`/players/${ids.hidden.slug}`)).status).toBe(404);
    // Gallery itself keeps working with link images.
    expect((await pub.get('/gallery')).body.data.items.some((g) => g.image.url === IMG)).toBe(true);
  });

  it('removing a player tag keeps the media item and the other tags', async () => {
    const res = await admin.delete(`/admin/players/${ids.b.id}/media/photo/${ids.photo}`);
    expect(res.status).toBe(200);
    const item = await GalleryItem.findById(ids.photo).lean();
    expect(item.deletedAt).toBeNull();
    expect(item.players.map(String).sort()).toEqual([ids.a.id, ids.minor.id].sort());
    expect((await admin.delete(`/admin/players/${ids.b.id}/media/photo/${ids.photo}`)).status).toBe(404);
    const vid = await admin.delete(`/admin/players/${ids.a.id}/media/video/${ids.video}`);
    expect(vid.status).toBe(200);
    expect(await Video.exists({ _id: ids.video, deletedAt: null })).toBeTruthy();
  });

  it('editing a photo without sending tags keeps its tags', async () => {
    const res = await api(ctx, media.token).put(`/admin/gallery/${ids.photo}`).send({ category: 'Matches', image: { source: 'link', url: IMG }, title: 'Renamed' });
    expect(res.status).toBe(200);
    expect((await GalleryItem.findById(ids.photo).lean()).players).toHaveLength(2);
  });

  it('staff media list and permissions: viewers can look, only media managers can change tags', async () => {
    const list = await admin.get(`/admin/players/${ids.a.id}/media`);
    expect(list.status).toBe(200);
    expect(list.body.data.photos.length).toBe(2); // includes the hidden one for staff
    expect(list.body.data.canManage).toBe(true);
    // Media Officer (media.manage, no players.view) can see options and tag lists.
    expect((await api(ctx, media.token).get('/admin/players/options')).status).toBe(200);
    expect((await api(ctx, media.token).get(`/admin/players/${ids.a.id}/media`)).status).toBe(200);

    // Team Manager of another team: no access to this player's media, cannot untag.
    const otherTeam = (await admin.post('/admin/teams').send({ name: 'Saki Stars U19', isClubTeam: true })).body.data.id;
    const tm = await createStaff(ctx, director.token, 'tm@links.test', 'team_manager', { assignedTeams: [otherTeam] });
    expect((await api(ctx, tm.token).get(`/admin/players/${ids.a.id}/media`)).status).toBe(403);
    expect((await api(ctx, tm.token).delete(`/admin/players/${ids.a.id}/media/photo/${ids.photo}`)).status).toBe(403);
    expect((await api(ctx, tm.token).post('/admin/gallery').send({ category: 'Matches', image: { source: 'link', url: IMG } })).status).toBe(403);

    // Ordinary signed-in users and visitors: no access.
    const fan = await registerUser(ctx, 'fan@links.test');
    expect((await api(ctx, fan.token).get(`/admin/players/${ids.a.id}/media`)).status).toBe(403);
    expect((await api(ctx, fan.token).get('/admin/players/options')).status).toBe(403);
    expect((await pub.get(`/admin/players/${ids.a.id}/media`)).status).toBe(401);
  });

  it('deleting a tagged player does not break media', async () => {
    await Player.updateOne({ _id: ids.minor.id }, { $set: { deletedAt: new Date() } });
    const gallery = await pub.get('/gallery');
    expect(gallery.status).toBe(200);
  });
});
