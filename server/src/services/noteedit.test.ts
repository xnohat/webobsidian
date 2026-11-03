import { describe, it, expect } from 'vitest';
import { applyEdit } from './noteedit.js';

describe('applyEdit — literal find/replace for the Agent API', () => {
  const doc = 'alpha\nbeta\ngamma\n';

  it('replaces a single occurrence and reports it', () => {
    const r = applyEdit(doc, 'beta', 'BETA');
    expect(r).toEqual({ content: 'alpha\nBETA\ngamma\n', replaced: 1 });
  });

  it('reports find_not_found instead of writing nothing', () => {
    expect(applyEdit(doc, 'nope', 'x')).toEqual({ error: 'find_not_found' });
  });

  it('refuses an ambiguous match without replaceAll (forces the caller to disambiguate)', () => {
    const twice = 'note a\nnote b\n';
    expect(applyEdit(twice, 'note', 'memo')).toEqual({ error: 'find_ambiguous', count: 2 });
  });

  it('replaces every occurrence with replaceAll and counts them', () => {
    const twice = 'note a\nnote b\n';
    const r = applyEdit(twice, 'note', 'memo', true);
    expect(r).toEqual({ content: 'memo a\nmemo b\n', replaced: 2 });
  });

  it('treats find as a literal string, never a regex', () => {
    const withRegexChars = 'value: a.b\nother: axb\n';
    // `a.b` as a regex would also match `axb`; literally it must not.
    const r = applyEdit(withRegexChars, 'a.b', 'a-b');
    expect(r).toEqual({ content: 'value: a-b\nother: axb\n', replaced: 1 });
  });

  it('does not interpret $-patterns in the replacement', () => {
    const r = applyEdit('price = 1', '1', '$&0');
    expect(r).toEqual({ content: 'price = $&0', replaced: 1 });
  });

  it('allows an empty replacement (deletion)', () => {
    const r = applyEdit('keep me\n', 'keep ', '');
    expect(r).toEqual({ content: 'me\n', replaced: 1 });
  });

  it('replaces the first occurrence only when not replaceAll', () => {
    const r = applyEdit('x x x', 'x', 'y');
    // three occurrences → ambiguous, so disambiguate with more context
    expect(r).toEqual({ error: 'find_ambiguous', count: 3 });
    const r2 = applyEdit('x x x', 'x x', 'y');
    expect(r2).toEqual({ content: 'y x', replaced: 1 });
  });
});
