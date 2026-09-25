import { describe, it, expect } from 'vitest';
import { classifyError, userMessage, fieldMessage, isRetryable, errorTitle } from './errors.js';

describe('userMessage', () => {
  it('never returns raw JavaScript error text', () => {
    const err = new TypeError("AbortSignal.timeout is not a function. (In 'AbortSignal.timeout(s)', 'AbortSignal.timeout' is undefined)");
    const msg = userMessage(err, 'fixtures');
    expect(msg).toBe('Fixtures are temporarily unavailable. Please try again in a moment.');
    expect(userMessage(new Error("Cannot read properties of undefined (reading 'items')"))).not.toMatch(/undefined|properties/);
  });

  it('maps each category to plain words', () => {
    expect(userMessage({ status: 0, code: 'NETWORK_ERROR' })).toMatch(/trouble connecting/);
    expect(userMessage({ status: 0, code: 'TIMEOUT' })).toMatch(/longer than expected/);
    expect(userMessage({ status: 500 }, 'news')).toBe('News could not be loaded right now. Please try again in a moment.');
    expect(userMessage({ status: 401 })).toBe('Your session has expired. Please sign in again.');
    expect(userMessage({ status: 403 })).toBe('You don’t have permission to access this area.');
    expect(userMessage({ status: 404 })).toMatch(/couldn’t find/);
    expect(userMessage({ status: 429 })).toMatch(/too often/);
    expect(userMessage({ status: 500 }, 'contact')).toBe('We couldn’t send your message right now. Please try again in a moment.');
  });

  it('uses context-specific wording for every public section', () => {
    for (const ctx of ['fixtures', 'results', 'players', 'teams', 'competitions', 'news', 'videos', 'gallery']) {
      expect(userMessage({ status: 502 }, ctx)).toMatch(/Please try again/);
      expect(errorTitle(ctx)).not.toBe(errorTitle('default'));
    }
  });

  it('keeps safe server wording but not technical server wording', () => {
    expect(userMessage({ status: 422, serverMessage: 'Enter a valid email address.', serverMessageSafe: true })).toBe('Enter a valid email address.');
    expect(userMessage({ status: 400, serverMessage: 'Cast to ObjectId failed', serverMessageSafe: false })).toBe('Please check the details you entered and try again.');
  });

  it('classifies and decides when retrying makes sense', () => {
    expect(classifyError({ name: 'AbortError' })).toBe('aborted');
    expect(isRetryable({ status: 500 })).toBe(true);
    expect(isRetryable({ status: 0, code: 'NETWORK_ERROR' })).toBe(true);
    expect(isRetryable({ status: 403 })).toBe(false);
    expect(isRetryable({ status: 404 })).toBe(false);
  });

  it('cleans up generic validation text on form fields', () => {
    expect(fieldMessage('Enter your full name.')).toBe('Enter your full name.');
    expect(fieldMessage('Invalid input: expected string, received number')).toBe('Please check this field.');
    expect(fieldMessage('ValidationError: User.email: Cast to string failed')).toBe('Please check this field.');
  });
});
