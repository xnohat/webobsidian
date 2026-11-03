import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanSnippet } from '../src/lib/snippet';

const marked = (r: { text: string; ranges: [number, number][] }) =>
  r.ranges.map(([s, l]) => r.text.slice(s, s + l));

test('strips wikilink brackets and keeps the highlight on the term', () => {
  const text = 'raised in [[2026-09-15-manager-budget-planning]]. More';
  const i = text.indexOf('budget');
  const r = cleanSnippet(text, [[i, 6]]);
  assert.equal(r.text, 'raised in 2026-09-15-manager-budget-planning. More');
  assert.deepEqual(marked(r), ['budget']);
});

test('uses the alias of an aliased wikilink', () => {
  const r = cleanSnippet('see [[notes/budget|the budget]] now', []);
  assert.equal(r.text, 'see the budget now');
});

test('drops table separator rows and cell pipes', () => {
  const text = '|---|---|---| | [[deliver-2027-budget-planning]] | [[hung]] |';
  const i = text.indexOf('budget');
  const r = cleanSnippet(text, [[i, 6]]);
  assert.equal(r.text, 'deliver-2027-budget-planning hung');
  assert.deepEqual(marked(r), ['budget']);
});

test('drops heading markers and emphasis', () => {
  const text = '# Deliver the 2027 budget plan to the manager **What:** x';
  const i = text.indexOf('budget');
  const r = cleanSnippet(text, [[i, 6]]);
  assert.equal(r.text, 'Deliver the 2027 budget plan to the manager What: x');
  assert.deepEqual(marked(r), ['budget']);
});

test('keeps plain text, hyphens and numbers untouched', () => {
  const text = 'labor cost 2026 - actuals + 2027 assumption';
  assert.equal(cleanSnippet(text, []).text, text);
});
