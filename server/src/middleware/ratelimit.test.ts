import { describe, it, expect } from 'vitest';
import { rateLimitKey } from './ratelimit.js';

const trustAll = () => true;
const trustNone = () => false;

describe('rateLimitKey — login throttle bucket', () => {
  it('keys on the socket address when no client-IP header is configured', () => {
    expect(rateLimitKey('10.0.0.5', '203.0.113.9', undefined, trustAll)).toBe('10.0.0.5');
  });

  it('uses the configured header when the peer is a trusted proxy', () => {
    expect(rateLimitKey('10.0.0.5', '203.0.113.9', 'CF-Connecting-IP', trustAll)).toBe('203.0.113.9');
    expect(rateLimitKey('10.0.0.5', '2001:db8::1', 'CF-Connecting-IP', trustAll)).toBe('2001:db8::1');
  });

  it('gives visitors behind the same proxy separate buckets', () => {
    const a = rateLimitKey('10.0.0.5', '203.0.113.9', 'CF-Connecting-IP', trustAll);
    const b = rateLimitKey('10.0.0.5', '198.51.100.7', 'CF-Connecting-IP', trustAll);
    expect(a).not.toBe(b);
  });

  it('ignores the header from an untrusted peer (F-03: no self-chosen buckets)', () => {
    expect(rateLimitKey('198.51.100.7', '203.0.113.9', 'CF-Connecting-IP', trustNone)).toBe('198.51.100.7');
  });

  it('takes only the first entry of a list header', () => {
    expect(rateLimitKey('10.0.0.5', '203.0.113.9, 10.0.0.1', 'X-Forwarded-For', trustAll)).toBe('203.0.113.9');
  });

  it('falls back to the peer for a missing or non-IP header value', () => {
    expect(rateLimitKey('10.0.0.5', undefined, 'CF-Connecting-IP', trustAll)).toBe('10.0.0.5');
    expect(rateLimitKey('10.0.0.5', 'not an ip', 'CF-Connecting-IP', trustAll)).toBe('10.0.0.5');
    expect(rateLimitKey('10.0.0.5', 'a'.repeat(100), 'CF-Connecting-IP', trustAll)).toBe('10.0.0.5');
  });
});
