import { describe, it, expect } from 'vitest';
import { redactUrlCreds } from './redact.js';

describe('redactUrlCreds', () => {
  it('strips a PAT from an https remote', () => {
    expect(redactUrlCreds('https://ghp_TOKEN123@github.com/o/r.git')).toBe(
      'https://***@github.com/o/r.git',
    );
  });

  it('strips user:pass userinfo', () => {
    expect(redactUrlCreds('https://user:pass@host/x')).toBe('https://***@host/x');
  });

  it('redacts a userinfo on any scheme (e.g. ssh://)', () => {
    expect(redactUrlCreds('ssh://git@host/x')).toBe('ssh://***@host/x');
  });

  it('leaves scp-style git@host:path untouched (no scheme://)', () => {
    expect(redactUrlCreds('git@github.com:o/r.git')).toBe('git@github.com:o/r.git');
  });

  it('redacts every credentialed URL in a longer string (global)', () => {
    const input = 'fatal: https://a@x.com/1 and https://b@y.com/2 failed';
    expect(redactUrlCreds(input)).toBe('fatal: https://***@x.com/1 and https://***@y.com/2 failed');
  });

  it('leaves text with no credentialed URL unchanged', () => {
    expect(redactUrlCreds('nothing to see here')).toBe('nothing to see here');
    expect(redactUrlCreds('https://github.com/o/r.git')).toBe('https://github.com/o/r.git');
  });

  it('coerces non-string input (undefined -> empty, Error message redacted)', () => {
    expect(redactUrlCreds(undefined)).toBe('');
    expect(redactUrlCreds(null)).toBe('');
    const err = new Error('clone failed: https://tok@github.com/o/r.git');
    expect(redactUrlCreds(err.message)).toBe('clone failed: https://***@github.com/o/r.git');
  });
});
