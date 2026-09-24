import { describe, it, expect } from 'vitest';
import { redact } from '../src/utils/logger.js';

describe('redact', () => {
  it('removes secrets at any depth', () => {
    const out = redact({
      email: 'fan@example.com',
      password: 'secret',
      nested: { refreshToken: 'abc', headers: { authorization: 'Bearer x', cookie: 'y' } },
      list: [{ apiKey: 'k' }],
    });
    expect(out.email).toBe('fan@example.com');
    expect(out.password).toBe('[Redacted]');
    expect(out.nested.refreshToken).toBe('[Redacted]');
    expect(out.nested.headers.authorization).toBe('[Redacted]');
    expect(out.nested.headers.cookie).toBe('[Redacted]');
    expect(out.list[0].apiKey).toBe('[Redacted]');
  });
});
