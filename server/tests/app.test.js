import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { buildTestApp } from './helpers.js';
import { createErrorHandler } from '../src/middleware/errorHandler.js';
import { createLogger } from '../src/utils/logger.js';

describe('health endpoints', () => {
  it('GET /api/v1/health reports the process is up', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /api/v1/health/ready is 200 when the database is connected', async () => {
    const res = await request(buildTestApp({ isDatabaseReady: () => true })).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ready', database: 'connected' });
  });

  it('GET /api/v1/health/ready is 503 when the database is not connected', async () => {
    const res = await request(buildTestApp({ isDatabaseReady: () => false })).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe('unavailable');
  });
});

describe('error handling', () => {
  it('returns the standard 404 shape for unknown routes', async () => {
    const res = await request(buildTestApp()).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });

  it('rejects malformed JSON with 400 and no internal details', async () => {
    const res = await request(buildTestApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|at .*\.js/);
  });

  it('rejects oversized bodies with 413', async () => {
    const res = await request(buildTestApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ big: 'x'.repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('hides internal error details in production', async () => {
    const app = express();
    app.use((req, res, next) => {
      req.id = 'test-request-id';
      next();
    });
    app.get('/boom', () => {
      throw new Error('database password is hunter2');
    });
    app.use(createErrorHandler({ logger: createLogger({ level: 'silent' }), exposeDetails: false }));

    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(res.body.error.details).toBeUndefined();
  });

  it('does not accept a malicious request ID header', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health').set('X-Request-Id', '<script>alert(1)</script>');
    expect(res.headers['x-request-id']).not.toContain('<');
  });
});

describe('security headers and CORS', () => {
  it('sends security headers and hides the framework', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
  });

  it('allows credentials for an allowlisted origin', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant CORS to an unknown origin', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('returns 429 in the standard error shape once the limit is exceeded', async () => {
    const app = buildTestApp({ env: { RATE_LIMIT_MAX: '2' } });
    await request(app).get('/api/v1/anything');
    await request(app).get('/api/v1/anything');
    const res = await request(app).get('/api/v1/anything');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('never rate-limits the health check', async () => {
    const app = buildTestApp({ env: { RATE_LIMIT_MAX: '1' } });
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
    }
  });
});
