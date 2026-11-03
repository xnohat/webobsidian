import { describe, it, expect } from 'vitest';
import { parseNote } from './markdown.js';
import { normaliseStatus, taskRecordFrom, filterTasks, type TaskRecord } from './tasks.js';

/** Build a ParsedNote the same way the real pipeline does (through gray-matter),
 *  so Date-typed frontmatter values (unquoted YAML dates) are exercised for real. */
function note(rel: string, raw: string) {
  return parseNote(rel, raw);
}

describe('normaliseStatus', () => {
  it('canonical values pass through as-is', () => {
    expect(normaliseStatus('open')).toEqual({ status: 'open', statusRaw: 'open' });
    expect(normaliseStatus('in-progress')).toEqual({ status: 'in-progress', statusRaw: 'in-progress' });
    expect(normaliseStatus('blocked')).toEqual({ status: 'blocked', statusRaw: 'blocked' });
    expect(normaliseStatus('done')).toEqual({ status: 'done', statusRaw: 'done' });
  });

  it('canonical values are matched case-insensitively and trimmed', () => {
    expect(normaliseStatus(' Open ')).toEqual({ status: 'open', statusRaw: ' Open ' });
    expect(normaliseStatus('DONE')).toEqual({ status: 'done', statusRaw: 'DONE' });
  });

  it('maps aliases onto the canonical id (case-insensitive, trimmed)', () => {
    expect(normaliseStatus('todo')).toEqual({ status: 'open', statusRaw: 'todo' });
    expect(normaliseStatus('Doing')).toEqual({ status: 'in-progress', statusRaw: 'Doing' });
    expect(normaliseStatus('wip')).toEqual({ status: 'in-progress', statusRaw: 'wip' });
    expect(normaliseStatus('waiting')).toEqual({ status: 'blocked', statusRaw: 'waiting' });
    expect(normaliseStatus('on-hold')).toEqual({ status: 'blocked', statusRaw: 'on-hold' });
    expect(normaliseStatus('closed')).toEqual({ status: 'done', statusRaw: 'closed' });
    expect(normaliseStatus('completed')).toEqual({ status: 'done', statusRaw: 'completed' });
    expect(normaliseStatus(' Complete ')).toEqual({ status: 'done', statusRaw: ' Complete ' });
  });

  it('an unknown value keeps its raw form as the status (never coerced)', () => {
    expect(normaliseStatus('escalated')).toEqual({ status: 'escalated', statusRaw: 'escalated' });
  });

  it('missing (null/undefined/empty) status defaults to open with statusRaw null', () => {
    expect(normaliseStatus(undefined)).toEqual({ status: 'open', statusRaw: null });
    expect(normaliseStatus(null)).toEqual({ status: 'open', statusRaw: null });
    expect(normaliseStatus('')).toEqual({ status: 'open', statusRaw: null });
  });

  it('a whitespace-only status is blank too — defaults to open with statusRaw null', () => {
    expect(normaliseStatus('   ')).toEqual({ status: 'open', statusRaw: null });
    expect(normaliseStatus('\t\n')).toEqual({ status: 'open', statusRaw: null });
  });

  it('an unknown value is trimmed before becoming both status and statusRaw (web twin parity)', () => {
    expect(normaliseStatus(' Needs Review ')).toEqual({ status: 'Needs Review', statusRaw: 'Needs Review' });
  });
});

describe('taskRecordFrom — selection', () => {
  it('selects a note whose frontmatter type is task (case-insensitive, trimmed)', () => {
    const n = note(
      'Wiki/tasks/a.md',
      '---\ntitle: A\ntype: Task \nstatus: open\n---\nBody',
    );
    const rec = taskRecordFrom('Wiki/tasks/a.md', n);
    expect(rec).not.toBeNull();
    expect(rec?.title).toBe('A');
  });

  it('excludes a note with a different type', () => {
    const n = note('Wiki/notes/b.md', '---\ntitle: B\ntype: note\n---\nBody');
    expect(taskRecordFrom('Wiki/notes/b.md', n)).toBeNull();
  });

  it('excludes a note with no type at all', () => {
    const n = note('Wiki/notes/c.md', '---\ntitle: C\n---\nBody');
    expect(taskRecordFrom('Wiki/notes/c.md', n)).toBeNull();
  });

  it('excludes notes inside any folder segment named "templates" (case-insensitive), even with type: task', () => {
    const n = note(
      'Wiki/templates/task.md',
      '---\ntitle: Short imperative title\ntype: task\nstatus: open\n---\nBody',
    );
    expect(taskRecordFrom('Wiki/templates/task.md', n)).toBeNull();
    const n2 = note('Wiki/Templates/task.md', '---\ntype: task\n---\nBody');
    expect(taskRecordFrom('Wiki/Templates/task.md', n2)).toBeNull();
  });

  it('title falls back to the file name (parseNote rule) when frontmatter has no title', () => {
    const n = note('Wiki/tasks/untitled-thing.md', '---\ntype: task\nstatus: open\n---\nBody');
    const rec = taskRecordFrom('Wiki/tasks/untitled-thing.md', n);
    expect(rec?.title).toBe('untitled-thing');
  });
});

describe('taskRecordFrom — field normalisation', () => {
  it('formats an unquoted YAML date (parsed by gray-matter as a Date) as YYYY-MM-DD (UTC)', () => {
    const raw = [
      '---',
      'title: Deliver the plan',
      'created: 2026-09-15',
      'updated: 2026-09-16',
      'type: task',
      'status: open',
      'priority: P1',
      'owner: hung',
      'due: 2026-09-29',
      'raised: 2026-09-15',
      'tags: [action-item, planning]',
      '---',
      '# Deliver the plan',
    ].join('\n');
    const n = note('Wiki/tasks/deliver.md', raw);
    const rec = taskRecordFrom('Wiki/tasks/deliver.md', n) as TaskRecord;
    expect(rec.due).toBe('2026-09-29');
    expect(rec.created).toBe('2026-09-15');
    expect(rec.updated).toBe('2026-09-16');
    expect(rec.raised).toBe('2026-09-15');
    expect(rec.priority).toBe('P1');
    expect(rec.owner).toBe('hung');
    expect(rec.status).toBe('open');
    expect(rec.statusRaw).toBe('open');
    expect(rec.tags).toEqual(['action-item', 'planning']);
    expect(rec.path).toBe('Wiki/tasks/deliver.md');
  });

  it('a non-date scalar (e.g. due: none) passes through as a plain string', () => {
    const n = note(
      'Wiki/tasks/no-date.md',
      '---\ntitle: No date\ntype: task\nstatus: open\ndue: none\n---\nBody',
    );
    const rec = taskRecordFrom('Wiki/tasks/no-date.md', n) as TaskRecord;
    expect(rec.due).toBe('none');
  });

  it('empty/absent scalar fields normalise to null, not empty string', () => {
    const n = note(
      'Wiki/tasks/sparse.md',
      '---\ntitle: Sparse\ntype: task\nstatus: open\nowner: ""\n---\nBody',
    );
    const rec = taskRecordFrom('Wiki/tasks/sparse.md', n) as TaskRecord;
    expect(rec.owner).toBeNull();
    expect(rec.priority).toBeNull();
    expect(rec.due).toBeNull();
    expect(rec.raised).toBeNull();
    expect(rec.created).toBeNull();
    expect(rec.updated).toBeNull();
  });

  it('an unknown status is preserved verbatim as both status and statusRaw', () => {
    const n = note(
      'Wiki/tasks/escalated.md',
      '---\ntitle: Escalated\ntype: task\nstatus: escalated\n---\nBody',
    );
    const rec = taskRecordFrom('Wiki/tasks/escalated.md', n) as TaskRecord;
    expect(rec.status).toBe('escalated');
    expect(rec.statusRaw).toBe('escalated');
  });

  it('a missing status key defaults to open with statusRaw null', () => {
    const n = note('Wiki/tasks/no-status.md', '---\ntitle: No status\ntype: task\n---\nBody');
    const rec = taskRecordFrom('Wiki/tasks/no-status.md', n) as TaskRecord;
    expect(rec.status).toBe('open');
    expect(rec.statusRaw).toBeNull();
  });
});

describe('filterTasks', () => {
  const tasks: TaskRecord[] = [
    {
      path: 'Wiki/tasks/a.md', title: 'Deliver the budget plan', status: 'open', statusRaw: 'open',
      priority: 'P1', owner: 'hung', due: '2026-09-29', raised: '2026-09-15', created: '2026-09-15',
      updated: '2026-09-15', tags: ['planning'],
    },
    {
      path: 'Wiki/tasks/b.md', title: 'Work the QC issues list', status: 'blocked', statusRaw: 'waiting',
      priority: 'P2', owner: 'hung', due: null, raised: '2026-09-21', created: '2026-09-21',
      updated: '2026-09-21', tags: ['quality'],
    },
    {
      path: 'Wiki/tasks/sub/c.md', title: 'Source label material', status: 'open', statusRaw: 'open',
      priority: 'P3', owner: 'phuong', due: null, raised: '2026-09-21', created: '2026-09-21',
      updated: '2026-09-21', tags: ['material'],
    },
    {
      path: 'Wiki/tasks/d.md', title: 'Escalated fixture', status: 'escalated', statusRaw: 'escalated',
      priority: 'P1', owner: 'fixture', due: '2026-10-05', raised: '2026-09-10', created: '2026-09-10',
      updated: '2026-09-20', tags: [],
    },
  ];

  it('returns every task when no filters are given', () => {
    expect(filterTasks(tasks, {})).toHaveLength(4);
  });

  it('ignores empty/absent params', () => {
    expect(filterTasks(tasks, { folder: '', status: '', priority: '', owner: '', q: '' })).toHaveLength(4);
  });

  it('folder: strips leading/trailing slashes and keeps exact + subtree matches', () => {
    const out = filterTasks(tasks, { folder: '/Wiki/tasks/sub/' });
    expect(out.map((t) => t.path)).toEqual(['Wiki/tasks/sub/c.md']);
  });

  it('folder: a bare prefix like "Wiki/tasks" does not match "Wiki/tasks-other"', () => {
    const withSibling: TaskRecord[] = [
      ...tasks,
      { ...tasks[0], path: 'Wiki/tasks-other/x.md' },
    ];
    const out = filterTasks(withSibling, { folder: 'Wiki/tasks' });
    expect(out.some((t) => t.path === 'Wiki/tasks-other/x.md')).toBe(false);
  });

  it('status: query is normalised the same way, so an alias matches its canonical column', () => {
    const out = filterTasks(tasks, { status: 'waiting' });
    expect(out.map((t) => t.path)).toEqual(['Wiki/tasks/b.md']);
    const out2 = filterTasks(tasks, { status: 'blocked' });
    expect(out2.map((t) => t.path)).toEqual(['Wiki/tasks/b.md']);
  });

  it('status: unknown values compare case-insensitively against the raw status', () => {
    const out = filterTasks(tasks, { status: 'Escalated' });
    expect(out.map((t) => t.path)).toEqual(['Wiki/tasks/d.md']);
  });

  it('priority and owner match case-insensitively', () => {
    expect(filterTasks(tasks, { priority: 'p1' }).map((t) => t.path)).toEqual([
      'Wiki/tasks/a.md',
      'Wiki/tasks/d.md',
    ]);
    expect(filterTasks(tasks, { owner: 'HUNG' }).map((t) => t.path)).toEqual([
      'Wiki/tasks/a.md',
      'Wiki/tasks/b.md',
    ]);
  });

  it('q matches a case-insensitive substring of the title', () => {
    expect(filterTasks(tasks, { q: 'budget' }).map((t) => t.path)).toEqual(['Wiki/tasks/a.md']);
    expect(filterTasks(tasks, { q: 'QC' }).map((t) => t.path)).toEqual(['Wiki/tasks/b.md']);
  });

  it('combines multiple filters (AND)', () => {
    const out = filterTasks(tasks, { folder: 'Wiki/tasks', status: 'open', owner: 'hung' });
    expect(out.map((t) => t.path)).toEqual(['Wiki/tasks/a.md']);
  });
});
