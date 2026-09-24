import { it, expect } from 'vitest';
import request from 'supertest';
import { describeDb, setupApp, registerUser, login, api, lastToken, PASSWORD, createDirector } from './setup.js';
import { User, RefreshSession, AuditLog } from '../../src/models/index.js';

describeDb('authentication', () => {
  const ctx = setupApp('auth');

  it('registers a normal user who must confirm their email', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ name: 'Fan One', email: 'Fan1@Example.com', password: PASSWORD, acceptTerms: true, role: 'staff', status: 'active' });
    expect(res.status).toBe(202);
    const user = await User.findOne({ email: 'fan1@example.com' }).select('+passwordHash').lean();
    expect(user.role).toBe('user'); // "role" in the body is ignored
    expect(user.status).toBe('pending');
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.consents.termsVersion).toBeTruthy();

    const token = lastToken(ctx, 'fan1@example.com');
    const verify = await request(ctx.app).post('/api/v1/auth/verify-email').send({ token });
    expect(verify.status).toBe(200);
    const again = await request(ctx.app).post('/api/v1/auth/verify-email').send({ token });
    expect(again.status).toBe(400); // single use
    expect((await User.findOne({ email: 'fan1@example.com' }).lean()).status).toBe('active');
  });

  it('rejects weak passwords and missing consent', async () => {
    const weak = await request(ctx.app).post('/api/v1/auth/register').send({ name: 'Weak', email: 'weak@example.com', password: 'password1', acceptTerms: true });
    expect(weak.status).toBe(422);
    const noConsent = await request(ctx.app).post('/api/v1/auth/register').send({ name: 'No', email: 'no@example.com', password: PASSWORD });
    expect(noConsent.status).toBe(422);
  });

  it('never creates a second account for an existing email and does not reveal it exists', async () => {
    await registerUser(ctx, 'dup@example.com');
    const res = await request(ctx.app).post('/api/v1/auth/register').send({ name: 'Imposter', email: 'dup@example.com', password: PASSWORD, acceptTerms: true });
    expect(res.status).toBe(202);
    expect(await User.countDocuments({ email: 'dup@example.com' })).toBe(1);
    const warning = ctx.email.outbox.filter((m) => m.to === 'dup@example.com').at(-1);
    expect(warning.subject).toMatch(/Security notice/);
  });

  it('logs in, returns the current user, and never returns secrets', async () => {
    const { token, user, cookie } = await registerUser(ctx, 'me@example.com', 'Me Myself');
    expect(user.email).toBe('me@example.com');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    const me = await api(ctx, token).get('/auth/me');
    expect(me.status).toBe(200);
    const text = JSON.stringify(me.body);
    expect(text).not.toMatch(/passwordHash|TokenHash|failedLogin/);
  });

  it('gives the same error for unknown email and wrong password', async () => {
    const a = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: PASSWORD });
    const b = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'me@example.com', password: 'Wrong-pass-123' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
    expect(await AuditLog.countDocuments({ action: 'auth.login_failed' })).toBeGreaterThanOrEqual(2);
  });

  it('locks sign-in after repeated failures', async () => {
    await registerUser(ctx, 'lock@example.com');
    for (let i = 0; i < 10; i += 1) {
      await request(ctx.app).post('/api/v1/auth/login').send({ email: 'lock@example.com', password: 'Wrong-pass-123' });
    }
    const res = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'lock@example.com', password: PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('rotates refresh tokens and detects reuse of an old one', async () => {
    const { cookie } = await registerUser(ctx, 'rotate@example.com');
    const first = await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'fetch');
    expect(first.status).toBe(200);
    const newCookie = first.headers['set-cookie'].find((c) => c.startsWith('ssfc_rt='));
    expect(newCookie).not.toBe(cookie);

    // Pretend the grace period for simultaneous tabs has passed, then replay the OLD token.
    await RefreshSession.updateMany({ rotatedAt: { $ne: null } }, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });
    const replay = await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'fetch');
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('SESSION_REVOKED');
    // The whole family is revoked, so even the newest token no longer works.
    const afterTheft = await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', newCookie).set('X-Requested-With', 'fetch');
    expect(afterTheft.status).toBe(200);
    expect(afterTheft.body.data).toBeNull(); // not signed in any more
    expect(await AuditLog.countDocuments({ action: 'auth.refresh_token_reuse' })).toBe(1);
  });

  it('keeps the user signed in when the same token arrives twice within the grace window', async () => {
    const { cookie } = await registerUser(ctx, 'twice@example.com');
    const first = await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'fetch');
    expect(first.status).toBe(200);
    // e.g. a reload interrupted by a navigation: the browser never stored the new cookie.
    const again = await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'fetch');
    expect(again.status).toBe(200);
    expect(again.body.data.accessToken).toBeTruthy();
    expect(again.body.data.user.email).toBe('twice@example.com');
    expect(again.headers['set-cookie'].some((c) => c.startsWith('ssfc_rt=') && !c.startsWith('ssfc_rt=;'))).toBe(true);
    expect(await AuditLog.countDocuments({ action: 'auth.refresh_token_reuse', entityId: again.body.data.user.id })).toBe(0);
  });

  it('answers "not signed in" (not an error) when there is no session cookie', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/refresh').set('X-Requested-With', 'fetch');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('requires the CSRF header on cookie-based endpoints', async () => {
    const { cookie } = await login(ctx, 'me@example.com');
    const res = await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(403);
    const evil = await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'fetch').set('Origin', 'https://evil.example');
    expect(evil.status).toBe(403);
  });

  it('logout ends the session immediately, including the access token', async () => {
    const { token, cookie } = await login(ctx, 'me@example.com');
    const out = await request(ctx.app).post('/api/v1/auth/logout').set('Cookie', cookie).set('X-Requested-With', 'fetch');
    expect(out.status).toBe(200);
    const me = await api(ctx, token).get('/auth/me');
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('SESSION_REVOKED');
  });

  it('resets a password with a single-use token and signs out every device', async () => {
    const { token: oldAccess } = await login(ctx, 'me@example.com');
    const forgot = await request(ctx.app).post('/api/v1/auth/forgot-password').send({ email: 'me@example.com' });
    expect(forgot.status).toBe(202);
    const unknown = await request(ctx.app).post('/api/v1/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(unknown.body).toEqual(forgot.body);

    const resetToken = lastToken(ctx, 'me@example.com');
    const reset = await request(ctx.app).post('/api/v1/auth/reset-password').send({ token: resetToken, password: 'Brand-new-pass-99' });
    expect(reset.status).toBe(200);
    const reuse = await request(ctx.app).post('/api/v1/auth/reset-password').send({ token: resetToken, password: 'Another-pass-100' });
    expect(reuse.status).toBe(400);
    expect((await api(ctx, oldAccess).get('/auth/me')).status).toBe(401);
    await login(ctx, 'me@example.com', 'Brand-new-pass-99');
  });

  it('change password keeps this device and signs out others', async () => {
    const other = await login(ctx, 'me@example.com', 'Brand-new-pass-99');
    const current = await login(ctx, 'me@example.com', 'Brand-new-pass-99');
    const res = await api(ctx, current.token).post('/auth/change-password').send({ currentPassword: 'Brand-new-pass-99', newPassword: 'Third-pass-2026x' });
    expect(res.status).toBe(200);
    expect((await api(ctx, other.token).get('/auth/me')).status).toBe(401);
    expect((await api(ctx, res.body.data.accessToken).get('/auth/me')).status).toBe(200);
  });

  it('lists and revokes sessions', async () => {
    const a = await login(ctx, 'rotate2@example.com').catch(async () => registerUser(ctx, 'rotate2@example.com'));
    const b = await login(ctx, 'rotate2@example.com');
    const list = await api(ctx, b.token).get('/auth/sessions');
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);
    const other = list.body.data.find((s) => !s.current);
    expect((await api(ctx, b.token).delete(`/auth/sessions/${other.id}`)).status).toBe(200);
    expect((await api(ctx, a.token).get('/auth/me')).status).toBe(401);
  });

  it('suspended accounts cannot sign in and existing tokens stop working at once', async () => {
    const director = await createDirector(ctx);
    const target = await registerUser(ctx, 'suspend-me@example.com');
    const res = await api(ctx, director.token).post(`/admin/users/${target.user.id}/suspend`).send({ reason: 'Abusive comments' });
    expect(res.status).toBe(200);
    expect((await api(ctx, target.token).get('/auth/me')).status).toBe(401);
    const again = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'suspend-me@example.com', password: PASSWORD });
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('rejects NoSQL operator injection', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });
});
