import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createLogger } from '../../src/utils/logger.js';
import { createApp } from '../../src/app.js';
import { User, Staff } from '../../src/models/index.js';
import { hashPassword } from '../../src/auth/password.js';
import { clearSettingsCache } from '../../src/services/settings.service.js';

/**
 * Integration tests need a real MongoDB. Set TEST_MONGODB_URI (a local mongod, a throwaway
 * Atlas cluster/database, or any MongoDB-compatible server). Without it these tests are skipped.
 * Each test file uses its own database, which is dropped afterwards.
 */
export const TEST_URI = process.env.TEST_MONGODB_URI;
export const describeDb = TEST_URI ? describe : describe.skip;

export const PASSWORD = 'Str0ng-pass-2026';
export const CLOUD = 'testcloud';

/** In-memory stand-in for Cloudinary so tests never upload real files. */
export function fakeMedia() {
  let n = 0;
  return {
    enabled: true,
    uploaded: [],
    destroyed: [],
    async upload(file, { kind, folder, isPrivate }) {
      n += 1;
      const resourceType = kind === 'video' ? 'video' : kind === 'document' ? 'raw' : 'image';
      const m = {
        publicId: `saki-stars/${folder}/file${n}`,
        url: `https://res.cloudinary.com/${CLOUD}/${resourceType}/${isPrivate ? 'private' : 'upload'}/saki-stars/${folder}/file${n}.jpg`,
        resourceType,
        deliveryType: isPrivate ? 'private' : 'upload',
        format: 'jpg',
        width: 800,
        height: 600,
        bytes: file?.size ?? 100,
      };
      this.uploaded.push(m);
      return m;
    },
    async destroy(m) {
      if (m?.publicId) this.destroyed.push(m.publicId);
    },
    privateUrl(m) {
      return `https://res.cloudinary.com/${CLOUD}/signed/${m.publicId}?expires=300`;
    },
  };
}

export function mediaObject(folder = 'players', n = Math.floor(Math.random() * 1e6)) {
  return {
    publicId: `saki-stars/${folder}/seed${n}`,
    url: `https://res.cloudinary.com/${CLOUD}/image/upload/saki-stars/${folder}/seed${n}.jpg`,
    resourceType: 'image',
    width: 400,
    height: 400,
    format: 'jpg',
    alt: 'photo',
  };
}

export function setupApp(name) {
  const ctx = {};
  beforeAll(async () => {
    await mongoose.connect(TEST_URI, { dbName: `ssfc_test_${name}_${process.pid}`, autoIndex: true });
    await mongoose.connection.db.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => {})));
    clearSettingsCache();
    const config = loadConfig({
      NODE_ENV: 'test',
      CORS_ORIGINS: 'http://localhost:5173',
      APP_URL: 'http://localhost:5173',
      CLOUDINARY_CLOUD_NAME: CLOUD,
      CLOUDINARY_API_KEY: 'k',
      CLOUDINARY_API_SECRET: 's',
    });
    ctx.media = fakeMedia();
    ctx.app = createApp({ config, logger: createLogger({ level: 'silent' }), isDatabaseReady: () => true, services: { media: ctx.media } });
    ctx.email = ctx.app.locals.ctx.email;
    ctx.config = config;
  });
  afterAll(async () => {
    await mongoose.connection.db.dropDatabase().catch(() => {});
    await mongoose.disconnect();
  });
  return ctx;
}

/** Last email link sent to `to` (verification, reset...), returning its token. */
export function lastToken(ctx, to) {
  const mail = [...ctx.email.outbox].reverse().find((m) => m.to === to && m.action?.url?.includes('token='));
  if (!mail) throw new Error(`No email with a token for ${to}`);
  return new URL(mail.action.url).searchParams.get('token');
}

export function api(ctx, token) {
  const agent = request(ctx.app);
  const wrap = (method) => (path) => {
    const r = agent[method](`/api/v1${path}`);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') };
}

export async function login(ctx, email, password = PASSWORD) {
  const res = await request(ctx.app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = res.headers['set-cookie']?.find((c) => c.startsWith('ssfc_rt='));
  return { token: res.body.data.accessToken, user: res.body.data.user, cookie };
}

/** Registers through the API, confirms the email with the emailed token, and signs in. */
export async function registerUser(ctx, email, name = 'Test Person') {
  const r = await request(ctx.app).post('/api/v1/auth/register').send({ name, email, password: PASSWORD, acceptTerms: true });
  if (r.status !== 202) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
  const v = await request(ctx.app).post('/api/v1/auth/verify-email').send({ token: lastToken(ctx, email) });
  if (v.status !== 200) throw new Error(`verify failed: ${JSON.stringify(v.body)}`);
  return login(ctx, email);
}

/** Same effect as scripts/create-director.js. */
export async function createDirector(ctx, email = 'director@club.test') {
  const user = await User.create({ email, name: 'Dana Director', passwordHash: await hashPassword(PASSWORD, 4), status: 'active', emailVerifiedAt: new Date() });
  const staff = await Staff.create({ user: user._id, fullName: user.name, staffRole: 'director', title: 'Club Director', status: 'active' });
  user.role = 'staff';
  user.staff = staff._id;
  await user.save();
  return login(ctx, email);
}

/** Registers a user and has the Director appoint them to `staffRole`. */
export async function createStaff(ctx, directorToken, email, staffRole, extra = {}) {
  await registerUser(ctx, email, extra.name || `${staffRole} person`);
  const res = await api(ctx, directorToken).post('/admin/staff/appoint').send({ email, staffRole, useDefaultGrants: !extra.grants, ...extra });
  if (res.status !== 201) throw new Error(`appoint failed: ${JSON.stringify(res.body)}`);
  const session = await login(ctx, email);
  return { ...session, staffId: res.body.data.id };
}
