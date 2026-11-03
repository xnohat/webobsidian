import { describe, it, expect } from 'vitest';
import { grepNote } from './notegrep.js';
import { contentVersion } from './noteversion.js';

const doc = [
  '---',
  'title: Demo',
  '---',
  '',
  'The Task board lists tasks.',
  'Another task here.',
  'no match on this line',
].join('\n');

describe('grepNote — literal line grep for the Agent API', () => {
  it('counts every occurrence but caps the returned lines', () => {
    const r = grepNote(doc, 'task', { maxMatches: 1 });
    expect(r.count).toBe(3); // "tasks" counts twice on line 5, once on line 6
    expect(r.matches).toHaveLength(1);
    expect(r.truncated).toBe(true);
  });

  it('reports 1-based line numbers counting from the first line of the file', () => {
    const r = grepNote(doc, 'no match');
    expect(r.matches[0].line).toBe(7);
    expect(r.matches[0].text).toBe('no match on this line');
  });

  it('is case-insensitive by default and case-sensitive on request', () => {
    expect(grepNote(doc, 'TASK').count).toBe(3);
    expect(grepNote(doc, 'TASK', { caseSensitive: true }).count).toBe(0);
    expect(grepNote(doc, 'Task', { caseSensitive: true }).count).toBe(1);
  });

  it('returns the column ranges of each match on a line', () => {
    const r = grepNote('ab ab ab', 'ab');
    expect(r.count).toBe(3);
    expect(r.matches[0].ranges).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 6, end: 8 },
    ]);
  });

  it('does not overlap matches (same rule as the find/replace edit)', () => {
    expect(grepNote('aaaa', 'aa').count).toBe(2);
  });

  it('adds neighbouring lines as context when asked', () => {
    const r = grepNote(doc, 'Another task', { context: 1 });
    expect(r.matches[0].pre).toBe('The Task board lists tasks.');
    expect(r.matches[0].post).toBe('no match on this line');
  });

  it('treats the query literally (no regex)', () => {
    expect(grepNote('a.b axb', 'a.b').count).toBe(1);
  });

  it('returns an empty result for an empty query', () => {
    expect(grepNote(doc, '')).toEqual({ count: 0, matches: [], truncated: false });
  });
});

describe('contentVersion — optimistic-lock token', () => {
  it('is deterministic for the same bytes', () => {
    expect(contentVersion('hello')).toBe(contentVersion('hello'));
  });

  it('changes when a single character changes', () => {
    expect(contentVersion('hello')).not.toBe(contentVersion('hello!'));
  });

  it('is 16 hex characters', () => {
    expect(contentVersion('anything')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('distinguishes an empty note from a whitespace-only note', () => {
    expect(contentVersion('')).not.toBe(contentVersion('\n'));
  });
});
