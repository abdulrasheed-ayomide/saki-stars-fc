import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/env.js';

const validProduction = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.example.mongodb.net/sakistars',
  CORS_ORIGINS: 'https://sakistarsfc.com',
  APP_URL: 'https://sakistarsfc.com',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
  RESEND_API_KEY: 're_test_key',
  EMAIL_FROM: 'Saki Stars <no-reply@sakistarsfc.com>',
};

describe('loadConfig', () => {
  it('accepts a valid production configuration', () => {
    const config = loadConfig(validProduction);
    expect(config.isProduction).toBe(true);
    expect(config.corsOrigins).toEqual(['https://sakistarsfc.com']);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('requires MONGODB_URI outside tests', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow(/MONGODB_URI is required/);
  });

  it('rejects a wildcard or non-https CORS origin in production', () => {
    expect(() => loadConfig({ ...validProduction, CORS_ORIGINS: '*' })).toThrow(/must not contain "\*"/);
    expect(() => loadConfig({ ...validProduction, CORS_ORIGINS: 'http://sakistarsfc.com' })).toThrow(/https/);
  });

  it('requires CORS_ORIGINS in production', () => {
    expect(() => loadConfig({ ...validProduction, CORS_ORIGINS: '' })).toThrow(/CORS_ORIGINS is required/);
  });

  it('reports every problem at once', () => {
    try {
      loadConfig({ NODE_ENV: 'production', PORT: 'abc' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.problems.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('explains placeholder text left in MONGODB_URI', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'development', MONGODB_URI: 'mongodb+srv://<user>:<password>@<cluster>.mongodb.net/x' }),
    ).toThrow(/placeholder text/);
  });

  it('requires secrets, email and https cookies in production', () => {
    expect(() => loadConfig({ ...validProduction, JWT_ACCESS_SECRET: '' })).toThrow(/JWT_ACCESS_SECRET is required/);
    expect(() => loadConfig({ ...validProduction, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/);
    expect(() => loadConfig({ ...validProduction, RESEND_API_KEY: '' })).toThrow(/RESEND_API_KEY/);
    expect(() => loadConfig({ ...validProduction, EMAIL_TRANSPORT: 'console' })).toThrow(/not allowed in production/);
    expect(() => loadConfig({ ...validProduction, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() => loadConfig({ ...validProduction, APP_URL: '' })).toThrow(/APP_URL/);
  });

  it('requires all three Cloudinary settings together', () => {
    expect(() => loadConfig({ ...validProduction, CLOUDINARY_CLOUD_NAME: 'demo' })).toThrow(/CLOUDINARY/);
    const config = loadConfig({ ...validProduction, CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' });
    expect(config.cloudinary.enabled).toBe(true);
  });

  it('uses the console email transport and a temporary secret in development', () => {
    const config = loadConfig({ NODE_ENV: 'development', MONGODB_URI: 'mongodb://localhost/x' });
    expect(config.email.transport).toBe('console');
    expect(config.auth.jwtSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.auth.cookieSecure).toBe(false);
  });

  it('normalises trailing slashes on origins', () => {
    const config = loadConfig({ ...validProduction, CORS_ORIGINS: 'https://a.com/, https://b.com' });
    expect(config.corsOrigins).toEqual(['https://a.com', 'https://b.com']);
  });
});

describe('DIRECTOR_* (first admin) variables', () => {
  const dev = { NODE_ENV: 'development', MONGODB_URI: 'mongodb://127.0.0.1:27017/saki' };
  it('are optional', () => {
    expect(() => loadConfig(dev)).not.toThrow();
  });
  it('must be set together', () => {
    expect(() => loadConfig({ ...dev, DIRECTOR_EMAIL: 'boss@example.com' })).toThrow(/DIRECTOR_EMAIL and DIRECTOR_PASSWORD/);
  });
  it('reject a weak password at start-up', () => {
    expect(() => loadConfig({ ...dev, DIRECTOR_EMAIL: 'boss@example.com', DIRECTOR_PASSWORD: 'password1' })).toThrow(/DIRECTOR_PASSWORD is too weak/);
  });
  it('never copy the password into the config object', () => {
    const config = loadConfig({ ...dev, DIRECTOR_EMAIL: 'boss@example.com', DIRECTOR_PASSWORD: 'Green-Pitch-2026-Kick' });
    expect(JSON.stringify(config)).not.toContain('Green-Pitch-2026-Kick');
  });
});
