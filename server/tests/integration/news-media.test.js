import { it, expect, beforeAll } from 'vitest';
import { describeDb, setupApp, api, createDirector, mediaObject } from './setup.js';
import { News } from '../../src/models/index.js';

/** News can carry an uploaded (Cloudinary) image, an external image link and a YouTube video. */
describeDb('news media: uploads, external image links and YouTube videos', () => {
  const ctx = setupApp('newsmedia');
  let admin;
  let pub;

  beforeAll(async () => {
    const director = await createDirector(ctx);
    admin = api(ctx, director.token);
    pub = api(ctx);
  });

  const base = { title: 'Saki Stars win again', content: 'A great performance from the whole squad today.' };

  async function publish(body) {
    const created = await admin.post('/admin/news').send({ ...base, ...body });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((await admin.post(`/admin/news/${created.body.data.id}/publish`)).status).toBe(200);
    return created.body.data;
  }

  it('stores an external image link and a YouTube video as references and shows them publicly', async () => {
    const a = await publish({ externalImageUrl: 'https://example.com/photos/match.jpg', externalImageAlt: 'Captain lifts the trophy', videoUrl: 'https://youtu.be/dQw4w9WgXcQ?si=abc' });
    expect(a.externalImageUrl).toBe('https://example.com/photos/match.jpg');
    expect(a.videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const doc = await News.findById(a.id).lean();
    expect(doc.video).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(doc.externalImage).toEqual({ url: 'https://example.com/photos/match.jpg', alt: 'Captain lifts the trophy' });
    expect(JSON.stringify(doc)).not.toMatch(/<iframe|youtu\.be/);

    const article = (await pub.get(`/news/${a.slug}`)).body.data;
    expect(article.featuredImage).toMatchObject({ url: 'https://example.com/photos/match.jpg', alt: 'Captain lifts the trophy' });
    expect(article.video).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
    const listed = (await pub.get('/news')).body.data.items.find((n) => n.slug === a.slug);
    expect(listed.featuredImage.url).toBe('https://example.com/photos/match.jpg');
  });

  it('keeps Cloudinary uploads working, and an uploaded image wins over a link', async () => {
    const upload = mediaObject('news');
    const a = await publish({ featuredImage: upload, externalImageUrl: 'https://example.com/other.jpg' });
    expect(a.featuredImage.url).toBe(upload.url);
    const article = (await pub.get(`/news/${a.slug}`)).body.data;
    expect(article.featuredImage.url).toBe(upload.url);
    expect(article.video).toBeNull();
  });

  it('rejects unsafe or invalid media links', async () => {
    for (const body of [
      { externalImageUrl: 'javascript:alert(1)' },
      { externalImageUrl: 'http://insecure.example.com/a.jpg' },
      { externalImageUrl: 'data:image/png;base64,AAAA' },
      { videoUrl: '<iframe src="https://evil.example"></iframe>' },
      { videoUrl: 'https://vimeo.com/123456' },
    ]) {
      const res = await admin.post('/admin/news').send({ ...base, ...body });
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
  });

  it('existing articles without the new fields still work, and media can be removed', async () => {
    const a = await publish({});
    const article = (await pub.get(`/news/${a.slug}`)).body.data;
    expect(article.featuredImage).toBeNull();
    expect(article.video).toBeNull();

    const withVideo = await publish({ videoUrl: 'dQw4w9WgXcQ' });
    const cleared = await admin.put(`/admin/news/${withVideo.id}`).send({ ...base, videoUrl: '', externalImageUrl: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.videoUrl).toBe('');
    expect((await News.findById(withVideo.id).lean()).video).toBeNull();
  });
});
