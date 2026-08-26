import assert from 'node:assert/strict';
import test from 'node:test';
import {
  forgetCreatedNote,
  isCreatedNote,
  loadDraft,
  moveCreatedNote,
  rememberCreatedNote,
  saveDraft,
} from '../src/lib/drafts.js';
import { blobToBase64 } from '../src/lib/draftAssets.js';

test('keeps a newly created contribution note and its draft together when renamed', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });

  const original = 'docs/学习指南/Untitled.md';
  const renamed = 'docs/学习指南/选课准备.md';
  saveDraft(original, '# 选课准备');
  rememberCreatedNote(original);

  assert.equal(moveCreatedNote(original, renamed), true);
  assert.equal(isCreatedNote(original), false);
  assert.equal(isCreatedNote(renamed), true);
  assert.equal(loadDraft(original), null);
  assert.equal(loadDraft(renamed), '# 选课准备');

  forgetCreatedNote(renamed);
  assert.equal(isCreatedNote(renamed), false);
});

test('encodes a dropped binary attachment for the GitHub Blob API', async () => {
  const encoded = await blobToBase64(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]));
  assert.equal(encoded, 'iVBORw==');
});
