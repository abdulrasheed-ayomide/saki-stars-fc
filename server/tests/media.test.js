import { describe, it, expect } from 'vitest';
import { sniffType } from '../src/services/media.service.js';
import { parseYouTubeId } from '../src/modules/media/media.routes.js';
import { resolveGrants, scopeCovers, DEFAULT_GRANTS, PERMISSION_KEYS, isValidGrant } from '../src/auth/permissions.js';
import { passwordProblems } from '../src/auth/password.js';

describe('file type sniffing', () => {
  it('identifies real file signatures, not names', () => {
    expect(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('image/jpeg');
    expect(sniffType(Buffer.from('89504e470d0a1a0a0000000000', 'hex'))).toBe('image/png');
    expect(sniffType(Buffer.from('%PDF-1.7 hello world'))).toBe('application/pdf');
    expect(sniffType(Buffer.from('<?php echo "x"; ?> not an image'))).toBeNull();
    expect(sniffType(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(4)]))).toBe('video/mp4');
  });
});

describe('YouTube links', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=10', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://vimeo.com/1234', null],
    ['javascript:alert(1)', null],
  ])('%s', (url, id) => expect(parseYouTubeId(url)).toBe(id));
});

describe('permission catalogue', () => {
  it('Directors hold everything; other roles only their grants', () => {
    expect(resolveGrants({ staffRole: 'director' }).size).toBe(PERMISSION_KEYS.length);
    const chairman = resolveGrants({ staffRole: 'chairman', grants: DEFAULT_GRANTS.chairman });
    expect(chairman.has('users.manage')).toBe(false);
    expect(chairman.has('settings.manage')).toBe(false);
  });
  it('recommended role permissions are all valid', () => {
    for (const grants of Object.values(DEFAULT_GRANTS)) for (const g of grants) expect(isValidGrant(g), g.permission).toBe(true);
  });
  it('IT Manager and Media Officer get no sensitive player or scouting access by default', () => {
    for (const role of ['it_manager', 'media_officer']) {
      const keys = DEFAULT_GRANTS[role].map((g) => g.permission);
      expect(keys.some((k) => k.startsWith('scouting.') || k.startsWith('players.'))).toBe(false);
    }
  });
  it('scope ordering', () => {
    expect(scopeCovers('all', 'assigned_teams')).toBe(true);
    expect(scopeCovers('assigned_teams', 'all')).toBe(false);
    expect(resolveGrants({ staffRole: 'x', grants: [{ permission: 'players.view', scope: 'assigned_teams' }, { permission: 'players.view', scope: 'all' }] }).get('players.view')).toBe('all');
  });
});

describe('password rules', () => {
  it('accepts a strong password and explains weak ones', () => {
    expect(passwordProblems('Str0ng-pass-2026', { email: 'a@b.c' })).toEqual([]);
    expect(passwordProblems('short1')).not.toEqual([]);
    expect(passwordProblems('onlyletterslong')).not.toEqual([]);
    expect(passwordProblems('password123')).not.toEqual([]);
    expect(passwordProblems('adebola12345', { email: 'adebola@x.com' })).not.toEqual([]);
  });
});
