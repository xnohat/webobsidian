import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasPickList, optionsFor, pickListFor, PROP_PICK_LISTS, STATUS_BY_TYPE } from '../src/lib/propOptions';

const TASK_STATUSES = ['open', 'in-progress', 'waiting', 'blocked', 'done', 'dropped'];

test('the vault vocabulary is offered for the keys that have one, in SCHEMA order', () => {
  assert.deepEqual(pickListFor('status', 'task'), TASK_STATUSES);
  assert.deepEqual(pickListFor('priority'), ['P1', 'P2', 'P3']);
  assert.deepEqual(pickListFor('origin'), ['abnormality', 'assigned']);
  assert.deepEqual(pickListFor('confidence'), ['high', 'medium', 'low']);
  assert.deepEqual(pickListFor('severity'), ['minor', 'major', 'critical']);
});

test('status is per page kind — a task’s statuses are not an abnormality’s', () => {
  assert.deepEqual(pickListFor('status', 'abnormality'), [
    'open',
    'contained',
    'countermeasure-agreed',
    'verified',
    'closed',
  ]);
  assert.deepEqual(pickListFor('status', 'document'), ['open', 'acted', 'archived']);
  // A page kind with no status vocabulary in SCHEMA offers no picker — better no list than the
  // wrong one (`accepted` on an ADR is not a task status).
  for (const type of ['system', 'entity', 'daily', '', '  ']) {
    assert.equal(pickListFor('status', type), null, `status on a ${type || 'typeless'} page`);
    assert.equal(hasPickList('status', type), false);
    assert.equal(optionsFor('status', 'open', type), null);
  }
});

test('the keys that are not per-kind are offered whatever the page type', () => {
  for (const type of ['task', 'abnormality', 'system', '']) {
    assert.deepEqual(pickListFor('priority', type), ['P1', 'P2', 'P3']);
    assert.deepEqual(pickListFor('severity', type), ['minor', 'major', 'critical']);
  }
});

test('every list is non-empty and free of duplicates', () => {
  for (const [key, list] of Object.entries({ ...PROP_PICK_LISTS, ...STATUS_BY_TYPE })) {
    assert.ok(list.length > 0, `${key} has no values`);
    assert.equal(new Set(list).size, list.length, `${key} repeats a value`);
  }
});

test('keys with no closed vocabulary get no picker', () => {
  for (const key of ['title', 'owner', 'due', 'raised', 'sources', 'tags', 'type', 'nonsense']) {
    assert.equal(pickListFor(key, 'task'), null);
    assert.equal(hasPickList(key, 'task'), false);
    assert.equal(optionsFor(key, 'open', 'task'), null);
  }
});

test('the key is matched case- and whitespace-insensitively', () => {
  assert.deepEqual(pickListFor(' Status ', ' Task '), pickListFor('status', 'task'));
  assert.deepEqual(optionsFor('STATUS', 'open', 'TASK'), optionsFor('status', 'open', 'task'));
});

test('the note’s current value is marked, and the vault order is kept', () => {
  const opts = optionsFor('status', 'blocked', 'task');
  assert.deepEqual(
    opts?.map((o) => o.value),
    TASK_STATUSES,
  );
  assert.deepEqual(
    opts?.filter((o) => o.current).map((o) => o.value),
    ['blocked'],
  );
  assert.ok(opts?.every((o) => !o.offList));
});

test('a value the page kind does not know is kept, first, flagged as off-list', () => {
  const opts = optionsFor('status', 'accepted', 'task');
  assert.deepEqual(
    opts?.map((o) => o.value),
    ['accepted', ...TASK_STATUSES],
  );
  assert.deepEqual(opts?.[0], { value: 'accepted', offList: true, current: true });
  assert.equal(opts?.filter((o) => o.current).length, 1);
  // `countermeasure-agreed` is off-list on a task page but canonical on an abnormality page.
  assert.equal(optionsFor('status', 'countermeasure-agreed', 'task')?.[0].offList, true);
  assert.equal(
    optionsFor('status', 'countermeasure-agreed', 'abnormality')?.[0].offList,
    false,
  );
});

test('an empty value adds no option — clearing is the row’s own control', () => {
  const opts = optionsFor('status', '', 'task');
  assert.equal(opts?.length, 6);
  assert.ok(opts?.every((o) => !o.current && !o.offList));
  assert.equal(optionsFor('priority', '   ')?.length, 3);
});

test('surrounding whitespace in the current value does not make it off-list', () => {
  const opts = optionsFor('priority', ' P2 ');
  assert.equal(opts?.length, 3);
  assert.deepEqual(
    opts?.filter((o) => o.current).map((o) => o.value),
    ['P2'],
  );
  assert.ok(opts?.every((o) => !o.offList));
});
