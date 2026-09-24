/**
 * Integration tests for the first-Director bootstrap and the shared login.
 * They need a throwaway MongoDB: set TEST_MONGODB_URI (see .env.example). Skipped otherwise.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { buildTestApp } from './helpers.js';
import { ensureDirectorFromEnv } from '../src/auth/bootstrapDirector.js';
import { User, Staff, RefreshSession } from '../src/models/index.js';
import { verifyPassword } from '../src/auth/password.js';

const BASE = process.env.TEST_MONGODB_URI;
const run = BASE ? describe : describe.skip;

const EMAIL = 'director@example.test';
const PASSWORD = 'Green-Pitch-2026-Kick';

run('first Director from the environment', () => {
  let app;

  beforeAll(async () => {
    const dbName = `saki_test_bootstrap_${Date.now()}`;
    const uri = BASE.includes('?') ? BASE.replace('?', `/${dbName}?`) : `${BASE.replace(/\/+$/, '')}/${dbName}`;
    await mongoose.connect(uri, { autoIndex: true });
    app = buildTestApp();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Staff.deleteMany({}), RefreshSession.deleteMany({})]);
  });

  it('does nothing when the variables are not set', async () => {
    expect((await ensureDirectorFromEnv({})).action).toBe('skipped');
    expect(await User.countDocuments()).toBe(0);
  });

  it('creates an active Director with a bcrypt-hashed password', async () => {
    const result = await ensureDirectorFromEnv({ email: EMAIL, name: 'Club Boss', password: PASSWORD, rounds: 4 });
    expect(result.action).toBe('created');
    const user = await User.findOne({ email: EMAIL }).select('+passwordHash').lean();
    expect(user.passwordHash).not.toBe(PASSWORD);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user.role).toBe('staff');
    const staff = await Staff.findById(user.staff).lean();
    expect(staff.staffRole).toBe('director');
    expect(staff.status).toBe('active');
  });

  it('never overwrites the password once a Director exists (so changing it later sticks)', async () => {
    await ensureDirectorFromEnv({ email: EMAIL, password: PASSWORD, rounds: 4 });
    const second = await ensureDirectorFromEnv({ email: EMAIL, password: 'Another-pass-123', rounds: 4 });
    expect(second.action).toBe('exists');
    const user = await User.findOne({ email: EMAIL }).select('+passwordHash').lean();
    expect(await verifyPassword(PASSWORD, user.passwordHash)).toBe(true);
  });

  it('takes over a pre-registered account by REPLACING its password and signing it out', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Someone Else', email: EMAIL, password: 'Attacker-pass-999', acceptTerms: true });
    expect(reg.status).toBe(202);
    const result = await ensureDirectorFromEnv({ email: EMAIL, password: PASSWORD, rounds: 4 });
    expect(result.action).toBe('promoted');
    const old = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: 'Attacker-pass-999' });
    expect(old.status).toBe(401);
    const ok = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(ok.status).toBe(200);
  });

  it('rejects a weak password without creating anything', async () => {
    const result = await ensureDirectorFromEnv({ email: EMAIL, password: 'short', rounds: 4 });
    expect(result.action).toBe('rejected');
    expect(await User.countDocuments()).toBe(0);
  });

  it('Director signs in on the shared /auth/login and reaches the admin API', async () => {
    await ensureDirectorFromEnv({ email: EMAIL, password: PASSWORD, rounds: 4 });
    const login = await request(app).post('/api/v1/auth/login').send({ email: EMAIL.toUpperCase(), password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user.staff).toBeTruthy();
    const cookie = login.headers['set-cookie']?.join(';') || '';
    expect(cookie).toMatch(/HttpOnly/i);
    const token = login.body.data.accessToken;
    const overview = await request(app).get('/api/v1/admin/dashboard/overview').set('Authorization', `Bearer ${token}`);
    expect(overview.status).toBe(200);
    const seasons = await request(app).get('/api/v1/admin/seasons').set('Authorization', `Bearer ${token}`);
    expect(seasons.status).toBe(200);
  });

  it('an ordinary registered user signs in on the same page but is refused by the admin API', async () => {
    await request(app).post('/api/v1/auth/register').send({ name: 'Fan Person', email: 'fan@example.test', password: 'Fan-pass-12345', acceptTerms: true });
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'fan@example.test', password: 'Fan-pass-12345' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.staff).toBeFalsy();
    const token = login.body.data.accessToken;
    for (const path of ['/admin/dashboard/overview', '/admin/seasons', '/admin/competitions', '/admin/users']) {
      const res = await request(app).get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
      expect(res.status, path).toBe(403);
    }
    const anon = await request(app).get('/api/v1/admin/users');
    expect(anon.status).toBe(401);
  });
});
