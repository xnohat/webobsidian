import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { api, ApiError, type TaskRecord } from '../src/lib/api';
import {
  changeTaskDue,
  changeTaskStatus,
  DEFAULT_HIDDEN_STATUSES,
  filterByStatus,
  hiddenByStatus,
  statusFacets,
  columnIdFor,
  columnsFor,
  isMissingStatus,
  isOverdue,
  isUndated,
  moveTask,
  normaliseStatus,
  restoreTask,
  setTaskDue,
  setTaskStatus,
  todayISO,
} from '../src/lib/tasks';

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    path: 'Wiki/Task.md',
    title: 'Task',
    status: 'open',
    statusRaw: 'open',
    priority: null,
    owner: null,
    due: null,
    raised: null,
    created: null,
    updated: null,
    tags: [],
    ...overrides,
  };
}

// ---- normaliseStatus / columnIdFor / isMissingStatus ----

test('normaliseStatus maps canonical ids (case-insensitive, trimmed)', () => {
  assert.equal(normaliseStatus('open'), 'open');
  assert.equal(normaliseStatus(' In-Progress '), 'in-progress');
  assert.equal(normaliseStatus('BLOCKED'), 'blocked');
  assert.equal(normaliseStatus('done'), 'done');
});

test('normaliseStatus maps aliases (case-insensitive, trimmed)', () => {
  assert.equal(normaliseStatus('todo'), 'open');
  assert.equal(normaliseStatus('TODO'), 'open');
  assert.equal(normaliseStatus('doing'), 'in-progress');
  assert.equal(normaliseStatus('wip'), 'in-progress');
  assert.equal(normaliseStatus('waiting'), 'blocked');
  assert.equal(normaliseStatus('on-hold'), 'blocked');
  assert.equal(normaliseStatus('closed'), 'done');
  assert.equal(normaliseStatus('completed'), 'done');
  assert.equal(normaliseStatus('complete'), 'done');
});

test('normaliseStatus returns unknown values unchanged (trimmed)', () => {
  assert.equal(normaliseStatus('Needs Review'), 'Needs Review');
  assert.equal(normaliseStatus('  Needs Review  '), 'Needs Review');
});

test('normaliseStatus treats missing/empty as open', () => {
  assert.equal(normaliseStatus(null), 'open');
  assert.equal(normaliseStatus(''), 'open');
  assert.equal(normaliseStatus('   '), 'open');
});

test('columnIdFor uses statusRaw through normaliseStatus', () => {
  assert.equal(columnIdFor(task({ statusRaw: 'todo' })), 'open');
  assert.equal(columnIdFor(task({ statusRaw: 'Needs Review' })), 'Needs Review');
  assert.equal(columnIdFor(task({ statusRaw: null })), 'open');
});

test('isMissingStatus is true only when statusRaw is null', () => {
  assert.equal(isMissingStatus(task({ statusRaw: null })), true);
  assert.equal(isMissingStatus(task({ statusRaw: 'open' })), false);
  assert.equal(isMissingStatus(task({ statusRaw: '' })), false);
});

// ---- columnsFor ----

test('columnsFor always returns the 4 canonical columns in order, even when empty', () => {
  const cols = columnsFor([]);
  assert.deepEqual(cols.map((c) => c.id), ['open', 'in-progress', 'blocked', 'done']);
  assert.deepEqual(cols.map((c) => c.label), ['Backlog', 'Doing', 'Blocked', 'Done']);
  assert.ok(cols.every((c) => c.canonical));
  assert.ok(cols.every((c) => c.tasks.length === 0));
});

test('columnsFor buckets aliases into their canonical column', () => {
  const cols = columnsFor([task({ path: 'a.md', statusRaw: 'todo' }), task({ path: 'b.md', statusRaw: 'wip' })]);
  const backlog = cols.find((c) => c.id === 'open')!;
  const doing = cols.find((c) => c.id === 'in-progress')!;
  assert.deepEqual(backlog.tasks.map((t) => t.path), ['a.md']);
  assert.deepEqual(doing.tasks.map((t) => t.path), ['b.md']);
});

test('columnsFor puts unknown statuses in their own column, after the canonical four, sorted alphabetically', () => {
  const cols = columnsFor([
    task({ path: 'z.md', statusRaw: 'Zeta' }),
    task({ path: 'a.md', statusRaw: 'Alpha' }),
  ]);
  assert.deepEqual(cols.map((c) => c.id), ['open', 'in-progress', 'blocked', 'done', 'Alpha', 'Zeta']);
  const alpha = cols.find((c) => c.id === 'Alpha')!;
  assert.equal(alpha.canonical, false);
  assert.equal(alpha.label, 'Alpha'); // label = raw value, never coerced
  assert.deepEqual(alpha.tasks.map((t) => t.path), ['a.md']);
});

test('columnsFor puts missing status in Backlog', () => {
  const cols = columnsFor([task({ path: 'm.md', statusRaw: null, status: 'open' })]);
  const backlog = cols.find((c) => c.id === 'open')!;
  assert.deepEqual(backlog.tasks.map((t) => t.path), ['m.md']);
  assert.equal(isMissingStatus(backlog.tasks[0]), true);
});

test('columnsFor sorts cards by priority (P1<P2<P3<none), then due (dated first, ascending), then title', () => {
  const cols = columnsFor([
    task({ path: 'p3.md', title: 'P3 task', statusRaw: 'open', priority: 'P3' }),
    task({ path: 'none-b.md', title: 'B no priority', statusRaw: 'open', priority: null }),
    task({ path: 'p1-later.md', title: 'P1 later', statusRaw: 'open', priority: 'P1', due: '2026-10-05' }),
    task({ path: 'p1-earlier.md', title: 'P1 earlier', statusRaw: 'open', priority: 'P1', due: '2026-09-01' }),
    task({ path: 'none-a.md', title: 'A no priority', statusRaw: 'open', priority: null }),
    task({ path: 'p1-nodue.md', title: 'P1 no due', statusRaw: 'open', priority: 'P1' }),
  ]);
  const backlog = cols.find((c) => c.id === 'open')!;
  assert.deepEqual(backlog.tasks.map((t) => t.path), [
    'p1-earlier.md', 'p1-later.md', 'p1-nodue.md', 'p3.md', 'none-a.md', 'none-b.md',
  ]);
});

// ---- isOverdue ----

test('the default status filter hides finished work only', () => {
  assert.deepEqual([...DEFAULT_HIDDEN_STATUSES], ['done']);
});

test('filterByStatus drops the hidden statuses and nothing else', () => {
  const tasks = [
    task({ path: 'a.md', status: 'open', statusRaw: 'open' }),
    task({ path: 'b.md', status: 'done', statusRaw: 'done' }),
    task({ path: 'c.md', status: 'blocked', statusRaw: 'waiting' }), // alias
    task({ path: 'd.md', status: 'escalated', statusRaw: 'escalated' }), // unmapped
    task({ path: 'e.md', status: 'open', statusRaw: null }), // no status key
  ];
  assert.deepEqual(
    filterByStatus(tasks, DEFAULT_HIDDEN_STATUSES).map((t) => t.path),
    ['a.md', 'c.md', 'd.md', 'e.md'],
    'only the done card goes',
  );
  assert.equal(filterByStatus(tasks, []).length, 5, 'an empty filter hides nothing');
  assert.deepEqual(
    filterByStatus(tasks, ['done', 'blocked']).map((t) => t.path),
    ['a.md', 'd.md', 'e.md'],
    'aliases are resolved before hiding',
  );
  assert.equal(hiddenByStatus(tasks, ['done']), 1);
  assert.equal(hiddenByStatus(tasks, ['done', 'blocked', 'escalated']), 3);
  assert.equal(hiddenByStatus(tasks, []), 0);
});

test('statusFacets lists the canonical four first (even at zero), then unmapped values', () => {
  const tasks = [
    task({ status: 'open', statusRaw: 'open' }),
    task({ status: 'done', statusRaw: 'closed' }), // alias counts as done
    task({ status: 'escalated', statusRaw: 'escalated' }),
    task({ status: 'escalated', statusRaw: 'escalated' }),
    task({ status: 'blocked', statusRaw: 'waiting' }),
  ];
  const facets = statusFacets(tasks);
  assert.deepEqual(facets.map((f) => f.id), ['open', 'in-progress', 'blocked', 'done', 'escalated']);
  assert.deepEqual(facets.map((f) => f.count), [1, 0, 1, 1, 2]);
  assert.deepEqual(facets.slice(0, 4).map((f) => f.label), ['Backlog', 'Doing', 'Blocked', 'Done']);
  assert.deepEqual(facets.slice(0, 4).map((f) => f.canonical), [true, true, true, true]);
  assert.equal(facets[4].canonical, false);
  assert.equal(facets[4].label, 'escalated', 'an unmapped status is its own label');
});

test('statusFacets counts a card with no status key as Backlog', () => {
  const facets = statusFacets([task({ status: 'open', statusRaw: null })]);
  assert.equal(facets[0].count, 1);
  assert.equal(facets[3].count, 0, 'Done starts empty');
});

test('isOverdue', () => {
  assert.equal(isOverdue(task({ due: '2026-01-01', status: 'open' }), '2026-09-25'), true);
  assert.equal(isOverdue(task({ due: '2026-12-25', status: 'open' }), '2026-09-25'), false);
  assert.equal(isOverdue(task({ due: '2026-09-25', status: 'open' }), '2026-09-25'), false); // due today is not overdue
  assert.equal(isOverdue(task({ due: 'none', status: 'open' }), '2026-09-25'), false);
  assert.equal(isOverdue(task({ due: null, status: 'open' }), '2026-09-25'), false);
  assert.equal(isOverdue(task({ due: '2026-01-01', status: 'done' }), '2026-09-25'), false);
});

// ---- setTaskDue / changeTaskDue / isUndated (#41) ----

test('setTaskDue replaces an existing due: line and bumps updated:', () => {
  const src = '---\ntitle: T\ntype: task\nstatus: open\ndue: 2026-09-01\nupdated: 2026-09-01\n---\nBody\n';
  assert.equal(
    setTaskDue(src, '2026-10-05', '2026-09-25'),
    '---\ntitle: T\ntype: task\nstatus: open\ndue: 2026-10-05\nupdated: 2026-09-25\n---\nBody\n',
  );
});

test('setTaskDue inserts due after the type: block when the key is absent', () => {
  const src = '---\ntitle: T\ntype: task\nstatus: open\nupdated: 2026-09-01\n---\nBody\n';
  assert.equal(
    setTaskDue(src, '2026-10-05', '2026-09-25'),
    '---\ntitle: T\ntype: task\ndue: 2026-10-05\nstatus: open\nupdated: 2026-09-25\n---\nBody\n',
  );
});

test('setTaskDue writes none unquoted, to clear a date the way the vault expects', () => {
  const src = '---\ntype: task\ndue: 2026-10-05\nupdated: 2026-09-01\n---\nBody\n';
  const out = setTaskDue(src, 'none', '2026-09-25');
  assert.match(out, /^due: none$/m);
  assert.ok(!out.includes('"none"'), 'a bare word, matching the vault convention');
});

test('setTaskDue creates a frontmatter block when the note has none', () => {
  assert.equal(
    setTaskDue('Body only\n', '2026-10-05', '2026-09-25'),
    '---\ndue: 2026-10-05\nupdated: 2026-09-25\n---\nBody only\n',
  );
});

test('setTaskDue leaves the body, key order, CRLF endings and a BOM untouched', () => {
  const src = '\uFEFF---\r\ntype: task\r\ndue: none\r\nupdated: 2026-09-01\r\n---\r\n# Body\r\n\r\ntext\r\n';
  const out = setTaskDue(src, '2026-10-05', '2026-09-25');
  assert.equal(
    out,
    '\uFEFF---\r\ntype: task\r\ndue: 2026-10-05\r\nupdated: 2026-09-25\r\n---\r\n# Body\r\n\r\ntext\r\n',
  );
  assert.ok(out.startsWith('\uFEFF'), 'BOM kept');
  assert.ok(!/(?<!\r)\n/.test(out), 'no bare LF introduced');
});

test('setTaskStatus and setTaskDue share one surgery, so status writes are unchanged', () => {
  // Guards the refactor: the status write-back must still behave exactly as the
  // tests above (from FR-15) assert.
  const src = '---\ntype: task\nstatus: open\nupdated: 2026-09-01\n---\nBody\n';
  assert.equal(
    setTaskStatus(src, 'blocked', '2026-09-25'),
    '---\ntype: task\nstatus: blocked\nupdated: 2026-09-25\n---\nBody\n',
  );
});

test('isUndated is true for a missing, empty or "none" due, false for a real date', () => {
  assert.equal(isUndated(task({ due: null })), true);
  assert.equal(isUndated(task({ due: 'none' })), true);
  assert.equal(isUndated(task({ due: 'asap' })), true);
  assert.equal(isUndated(task({ due: '2026-10-05' })), false);
});

test('changeTaskDue reads, rewrites the due date, and writes back with the read version', async () => {
  const writes = mock.method(api, 'write', async () => ({ ok: true }));
  await changeTaskDue('Task.md', '2026-10-05', { today: '2026-09-25' });
  assert.deepEqual(writes.mock.calls[0].arguments, [
    'Task.md',
    '---\ntype: task\ndue: 2026-10-05\nstatus: open\nupdated: 2026-09-25\n---\nBody\n',
    'v1',
  ]);
});

test('changeTaskDue propagates a 409 version conflict from api.write', async () => {
  mock.method(api, 'write', async () => {
    throw new ApiError('version_conflict', 409);
  });
  await assert.rejects(
    changeTaskDue('Task.md', '2026-10-05', { today: '2026-09-25' }),
    (e: unknown) => e instanceof ApiError && e.status === 409,
  );
});

// ---- moveTask ----

test('moveTask sets status and statusRaw to the target column id and leaves others untouched', () => {
  const tasks = [task({ path: 'a.md', statusRaw: 'open', status: 'open' }), task({ path: 'b.md', statusRaw: 'open', status: 'open' })];
  const moved = moveTask(tasks, 'a.md', 'in-progress');
  assert.notEqual(moved, tasks); // new array
  assert.equal(moved.find((t) => t.path === 'a.md')!.status, 'in-progress');
  assert.equal(moved.find((t) => t.path === 'a.md')!.statusRaw, 'in-progress');
  assert.equal(moved.find((t) => t.path === 'b.md')!.status, 'open');
  assert.equal(tasks.find((t) => t.path === 'a.md')!.status, 'open'); // original untouched
});

test('moveTask into an unknown column stores the raw label as statusRaw', () => {
  const tasks = [task({ path: 'a.md' })];
  const moved = moveTask(tasks, 'a.md', 'Needs Review');
  assert.equal(moved[0].status, 'Needs Review');
  assert.equal(moved[0].statusRaw, 'Needs Review');
});

// ---- restoreTask ----

test('restoreTask puts the previous record back for the matching path and leaves other tasks untouched', () => {
  const before = task({ path: 'a.md', status: 'open', statusRaw: 'open' });
  const tasks = moveTask([before, task({ path: 'b.md' })], 'a.md', 'in-progress');
  const restored = restoreTask(tasks, before);
  assert.deepEqual(restored.find((t) => t.path === 'a.md'), before);
  assert.equal(restored.find((t) => t.path === 'b.md')!.status, 'open');
  assert.notEqual(restored, tasks); // new array
});

test('restoreTask is a no-op (new array, same contents) when the path is absent', () => {
  const tasks = [task({ path: 'a.md' })];
  const restored = restoreTask(tasks, task({ path: 'missing.md' }));
  assert.deepEqual(restored, tasks);
});

// ---- setTaskStatus ----

test('setTaskStatus replaces an existing status: line', () => {
  const content = '---\ntype: task\nstatus: open\nowner: Alice\n---\nBody text\n';
  const out = setTaskStatus(content, 'in-progress', '2026-09-25');
  assert.equal(out, '---\ntype: task\nstatus: in-progress\nowner: Alice\nupdated: 2026-09-25\n---\nBody text\n');
});

test('setTaskStatus inserts status right after the type: line when absent', () => {
  const content = '---\ntype: task\nowner: Alice\n---\nBody\n';
  const out = setTaskStatus(content, 'open', '2026-09-25');
  assert.equal(out, '---\ntype: task\nstatus: open\nowner: Alice\nupdated: 2026-09-25\n---\nBody\n');
});

test('setTaskStatus inserts status after the whole type: block, not between it and its indented continuation lines', () => {
  const content = '---\ntype: |\n  task\nowner: Alice\n---\nBody\n';
  const out = setTaskStatus(content, 'open', '2026-09-25');
  assert.equal(out, '---\ntype: |\n  task\nstatus: open\nowner: Alice\nupdated: 2026-09-25\n---\nBody\n');
});

test('setTaskStatus inserts status as the last line of the block when there is no type: line', () => {
  const content = '---\nowner: Alice\n---\nBody\n';
  const out = setTaskStatus(content, 'open', '2026-09-25');
  assert.equal(out, '---\nowner: Alice\nstatus: open\nupdated: 2026-09-25\n---\nBody\n');
});

test('setTaskStatus prepends a frontmatter block when there is none', () => {
  const content = '# My task\n\nSome body.\n';
  const out = setTaskStatus(content, 'open', '2026-09-25');
  assert.equal(out, '---\nstatus: open\nupdated: 2026-09-25\n---\n# My task\n\nSome body.\n');
});

test('setTaskStatus replaces an existing updated: line', () => {
  const content = '---\ntype: task\nstatus: open\nupdated: 2020-01-01\n---\nBody\n';
  const out = setTaskStatus(content, 'done', '2026-09-25');
  assert.equal(out, '---\ntype: task\nstatus: done\nupdated: 2026-09-25\n---\nBody\n');
});

test('setTaskStatus replaces multi-line (indented continuation) status/updated values', () => {
  const content = '---\ntype: task\nstatus: |\n  open\n  extra\nowner: Alice\n---\nBody\n';
  const out = setTaskStatus(content, 'done', '2026-09-25');
  assert.equal(out, '---\ntype: task\nstatus: done\nowner: Alice\nupdated: 2026-09-25\n---\nBody\n');
});

test('setTaskStatus accepts an opening/closing delimiter with trailing whitespace, keeping those lines byte-identical', () => {
  const content = '---  \ntype: task\nstatus: open\n---\t\nBody\n';
  const out = setTaskStatus(content, 'done', '2026-09-25');
  assert.equal(out, '---  \ntype: task\nstatus: done\nupdated: 2026-09-25\n---\t\nBody\n');
});

test('setTaskStatus accepts a "..." closing delimiter (with trailing whitespace), keeping it byte-identical', () => {
  const content = '---\ntype: task\nstatus: open\n...  \nBody\n';
  const out = setTaskStatus(content, 'done', '2026-09-25');
  assert.equal(out, '---\ntype: task\nstatus: done\nupdated: 2026-09-25\n...  \nBody\n');
});

test('setTaskStatus appends updated: as the last line of the block when absent, leaving everything else byte-identical', () => {
  const content = '---\ntitle: X\ntype: task\nstatus: open\nowner: Bob\n---\nBody\n';
  // status unchanged — only the missing `updated:` key should move.
  const out = setTaskStatus(content, 'open', '2026-09-25');
  assert.equal(out, '---\ntitle: X\ntype: task\nstatus: open\nowner: Bob\nupdated: 2026-09-25\n---\nBody\n');
});

test('setTaskStatus preserves CRLF line endings', () => {
  const content = '---\r\ntype: task\r\nstatus: open\r\n---\r\nBody\r\n';
  const out = setTaskStatus(content, 'done', '2026-09-25');
  assert.equal(out, '---\r\ntype: task\r\nstatus: done\r\nupdated: 2026-09-25\r\n---\r\nBody\r\n');
});

test('setTaskStatus leaves all other lines, key order, and the body byte-identical', () => {
  const content = '---\ntitle: Fix bug\ntype: task\nstatus: open\npriority: P1\nowner: Bob\ntags:\n  - urgent\n  - bug\n---\n# Fix bug\n\n- [ ] step one\n- [ ] step two\n';
  const out = setTaskStatus(content, 'blocked', '2026-09-25');
  assert.equal(
    out,
    '---\ntitle: Fix bug\ntype: task\nstatus: blocked\npriority: P1\nowner: Bob\ntags:\n  - urgent\n  - bug\nupdated: 2026-09-25\n---\n# Fix bug\n\n- [ ] step one\n- [ ] step two\n',
  );
});

test('setTaskStatus JSON-quotes values that are not bare word characters', () => {
  const content = '---\ntype: task\n---\nBody\n';
  const out = setTaskStatus(content, 'Needs Review', '2026-09-25');
  assert.equal(out, '---\ntype: task\nstatus: "Needs Review"\nupdated: 2026-09-25\n---\nBody\n');
});

test('setTaskStatus keeps a bare word status unquoted (unknown-column label)', () => {
  const content = '---\ntype: task\n---\nBody\n';
  const out = setTaskStatus(content, 'in-progress', '2026-09-25');
  assert.equal(out, '---\ntype: task\nstatus: in-progress\nupdated: 2026-09-25\n---\nBody\n');
});

test('setTaskStatus JSON-quotes a value that starts with a digit — YAML would read it back as a number, not a string', () => {
  const content = '---\ntype: task\n---\nBody\n';
  const out = setTaskStatus(content, '2026', '2026-09-25');
  assert.equal(out, '---\ntype: task\nstatus: "2026"\nupdated: 2026-09-25\n---\nBody\n');
});

test('setTaskStatus JSON-quotes YAML boolean/null keyword lookalikes (case-insensitive)', () => {
  const content = '---\ntype: task\n---\nBody\n';
  for (const v of ['yes', 'YES', 'No', 'true', 'False', 'on', 'Off', 'y', 'N', 'null', 'NULL']) {
    const out = setTaskStatus(content, v, '2026-09-25');
    assert.equal(out, `---\ntype: task\nstatus: ${JSON.stringify(v)}\nupdated: 2026-09-25\n---\nBody\n`, v);
  }
});

// ---- todayISO ----

test('todayISO formats a local date as YYYY-MM-DD', () => {
  const d = new Date(2026, 8, 25); // months are 0-based: September
  assert.equal(todayISO(d), '2026-09-25');
});

// ---- changeTaskStatus ----

beforeEach(() => {
  mock.method(api, 'read', async () => ({ path: 'Task.md', content: '---\ntype: task\nstatus: open\n---\nBody\n', version: 'v1' }));
  mock.method(api, 'write', async () => ({ ok: true }));
});

afterEach(() => {
  mock.restoreAll();
});

test('changeTaskStatus reads, rewrites the status, and writes back with the read version as baseVersion', async () => {
  const writes = mock.method(api, 'write', async () => ({ ok: true }));
  await changeTaskStatus('Task.md', 'in-progress', { today: '2026-09-25' });
  assert.deepEqual(writes.mock.calls[0].arguments, [
    'Task.md',
    '---\ntype: task\nstatus: in-progress\nupdated: 2026-09-25\n---\nBody\n',
    'v1',
  ]);
});

test('changeTaskStatus propagates a 409 version conflict from api.write', async () => {
  mock.method(api, 'write', async () => { throw new ApiError('version_conflict', 409); });
  await assert.rejects(
    changeTaskStatus('Task.md', 'done', { today: '2026-09-25' }),
    (e: unknown) => e instanceof ApiError && e.status === 409,
  );
});
