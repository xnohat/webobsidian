// Pure logic for the Tasks board (FR-15). Keep the canonical/alias table in
// sync with the twin in server/src/services/tasks.ts.
import { api, type TaskRecord } from './api';

export interface CanonicalStatus {
  id: string;
  label: string;
}

export interface Column {
  id: string;
  label: string;
  canonical: boolean;
  tasks: TaskRecord[];
}

export const CANONICAL_STATUSES: CanonicalStatus[] = [
  { id: 'open', label: 'Backlog' },
  { id: 'in-progress', label: 'Doing' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Done' },
];

const CANONICAL_IDS = new Set(CANONICAL_STATUSES.map((c) => c.id));

// Aliases (case-insensitive, trimmed) → canonical id.
const ALIASES: Record<string, string> = {
  todo: 'open',
  doing: 'in-progress',
  wip: 'in-progress',
  waiting: 'blocked',
  'on-hold': 'blocked',
  closed: 'done',
  completed: 'done',
  complete: 'done',
};

const DUE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Canonical id if canonical/alias; else the raw value unchanged (trimmed); 'open' when missing/empty. */
export function normaliseStatus(raw: string | null | undefined): string {
  if (raw == null) return 'open';
  const v = raw.trim();
  if (!v) return 'open';
  const lc = v.toLowerCase();
  if (CANONICAL_IDS.has(lc)) return lc;
  if (ALIASES[lc]) return ALIASES[lc];
  return v;
}

/** Which board column a task belongs to. Driven by statusRaw (the source of truth), not the pre-computed status. */
export function columnIdFor(task: TaskRecord): string {
  return normaliseStatus(task.statusRaw);
}

/** True iff the note's frontmatter has no status key at all (statusRaw is null). */
export function isMissingStatus(task: TaskRecord): boolean {
  return task.statusRaw === null;
}

// A large finite sentinel (not Infinity — Infinity - Infinity is NaN, which
// breaks the comparator below for two "no priority" cards).
const NO_PRIORITY_RANK = Number.MAX_SAFE_INTEGER;

function priorityRank(priority: string | null): number {
  if (!priority) return NO_PRIORITY_RANK;
  const m = /^P([0-9]+)$/i.exec(priority.trim());
  return m ? Number(m[1]) : NO_PRIORITY_RANK;
}

/** [0, date] for a real YYYY-MM-DD due date (sorts ascending, before anything else); [1, ''] otherwise. */
function dueSortKey(due: string | null): [number, string] {
  return due && DUE_RE.test(due) ? [0, due] : [1, ''];
}

function compareTasks(a: TaskRecord, b: TaskRecord): number {
  const pr = priorityRank(a.priority) - priorityRank(b.priority);
  if (pr !== 0) return pr;
  const [ag, ad] = dueSortKey(a.due);
  const [bg, bd] = dueSortKey(b.due);
  if (ag !== bg) return ag - bg;
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/**
 * Always the 4 canonical columns in order (even when empty), then one column
 * per distinct unknown status (label = raw value, sorted alphabetically).
 * Cards within a column are sorted by priority, then due, then title.
 */
export function columnsFor(tasks: TaskRecord[]): Column[] {
  const byId = new Map<string, TaskRecord[]>();
  for (const c of CANONICAL_STATUSES) byId.set(c.id, []);
  const unknownIds = new Set<string>();
  for (const t of tasks) {
    const id = columnIdFor(t);
    if (!byId.has(id)) {
      byId.set(id, []);
      unknownIds.add(id);
    }
    byId.get(id)!.push(t);
  }
  const columns: Column[] = CANONICAL_STATUSES.map((c) => ({
    id: c.id,
    label: c.label,
    canonical: true,
    tasks: [...(byId.get(c.id) ?? [])].sort(compareTasks),
  }));
  for (const id of [...unknownIds].sort((a, b) => a.localeCompare(b))) {
    columns.push({ id, label: id, canonical: false, tasks: [...(byId.get(id) ?? [])].sort(compareTasks) });
  }
  return columns;
}

/** True iff `due` is a past YYYY-MM-DD date and the task isn't done. */
export function isOverdue(task: TaskRecord, today: string): boolean {
  if (!task.due || !DUE_RE.test(task.due)) return false;
  if (task.due >= today) return false;
  return task.status !== 'done';
}

/**
 * Statuses hidden by default in the Tasks view (issue #39): finished work should
 * not clutter the board or the timeline the moment you open them. Everything
 * else — including unmapped statuses — stays visible until the user says
 * otherwise; silently hiding data nobody opted out of would be worse than clutter.
 */
export const DEFAULT_HIDDEN_STATUSES: readonly string[] = ['done'];

export interface StatusFacet {
  id: string;
  label: string;
  canonical: boolean;
  count: number;
}

/**
 * Every status worth offering as a filter: the four canonical ones first (in
 * board order, even at count 0, so the control does not jump around), then the
 * unmapped values present in the data, alphabetically.
 */
export function statusFacets(tasks: TaskRecord[]): StatusFacet[] {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    const id = columnIdFor(t);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const out: StatusFacet[] = CANONICAL_STATUSES.map((c) => ({
    id: c.id,
    label: c.label,
    canonical: true,
    count: counts.get(c.id) ?? 0,
  }));
  for (const id of [...counts.keys()].filter((i) => !CANONICAL_IDS.has(i)).sort((a, b) => a.localeCompare(b))) {
    out.push({ id, label: id, canonical: false, count: counts.get(id) ?? 0 });
  }
  return out;
}

/** Cards whose status is not in `hidden` (resolved through the alias table). */
export function filterByStatus(tasks: TaskRecord[], hidden: readonly string[]): TaskRecord[] {
  if (hidden.length === 0) return tasks;
  const hide = new Set(hidden);
  return tasks.filter((t) => !hide.has(columnIdFor(t)));
}

/** How many cards the status filter is currently hiding. */
export function hiddenByStatus(tasks: TaskRecord[], hidden: readonly string[]): number {
  return tasks.length - filterByStatus(tasks, hidden).length;
}

/**
 * Optimistic move: returns a new array with `path`'s status/statusRaw set to
 * `statusId` (the target column's id — canonical id, or the raw label for an
 * unknown column, since an unknown column's id IS its raw label).
 */
export function moveTask(tasks: TaskRecord[], path: string, statusId: string): TaskRecord[] {
  return tasks.map((t) => (t.path === path ? { ...t, status: statusId, statusRaw: statusId } : t));
}

/**
 * Undo a failed optimistic move: put `previous` back in place of the task at
 * its path, leaving every other task (incl. any auto-refresh landed since the
 * move started) untouched. A no-op (new array, same contents) if that path
 * isn't present any more.
 */
export function restoreTask(tasks: TaskRecord[], previous: TaskRecord): TaskRecord[] {
  return tasks.map((t) => (t.path === previous.path ? previous : t));
}

/** True iff the note has no usable date on `due` (absent, empty, or the vault's `none`). */
export function isUndated(task: TaskRecord): boolean {
  return !task.due || !DUE_RE.test(task.due);
}

/** Local-date YYYY-MM-DD (not UTC — matches what a human sees on their clock). */
export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// YAML scalars that a bare word would be read back as something other than
// the plain string it looks like (case-insensitive) — must be quoted.
const YAML_KEYWORD_RE = /^(null|true|false|yes|no|on|off|y|n|~)$/i;
const BARE_WORD_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** Bare only when YAML would read it back as the same plain string; otherwise
 *  JSON-quote it (leading digit, spaces, YAML boolean/null keyword lookalikes, …).
 *  A YYYY-MM-DD date (the only other value this is called with — `today`) is a
 *  documented exception: gray-matter parses it back as a Date, which the read
 *  path (scalarToField, both twins) reformats to the identical YYYY-MM-DD
 *  string, so it round-trips even though it doesn't match the bare-word rule. */
function serializeValue(v: string): string {
  if (DUE_RE.test(v)) return v;
  return BARE_WORD_RE.test(v) && !YAML_KEYWORD_RE.test(v) ? v : JSON.stringify(v);
}

/** Index range [start, end) of a top-level `key:` line plus its indented continuation lines. */
function findKeyBlock(lines: string[], key: string): { start: number; end: number } | null {
  const re = new RegExp(`^${key}:`);
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && /^[ \t]/.test(lines[end])) end++;
  return { start, end };
}

/** Replace (or insert) a top-level `key: value` line in a frontmatter body (array of lines, no delimiters). */
function upsertTopLevelKey(frontLines: string[], key: string, value: string, afterKey?: string): string[] {
  const newLine = `${key}: ${serializeValue(value)}`;
  const block = findKeyBlock(frontLines, key);
  if (block) {
    return [...frontLines.slice(0, block.start), newLine, ...frontLines.slice(block.end)];
  }
  if (afterKey) {
    const afterBlock = findKeyBlock(frontLines, afterKey);
    if (afterBlock) {
      // After the WHOLE afterKey block (incl. its indented continuation lines) —
      // splitting a block with a bare line in the middle produces invalid YAML.
      const insertAt = afterBlock.end;
      return [...frontLines.slice(0, insertAt), newLine, ...frontLines.slice(insertAt)];
    }
  }
  return [...frontLines, newLine];
}

// A frontmatter delimiter line may carry trailing whitespace (some editors
// leave it); the opening fence is always `---`, the closing one `---` or `...`.
const OPEN_DELIM_RE = /^---[ \t]*$/;
const CLOSE_DELIM_RE = /^(---|\.\.\.)[ \t]*$/;

/**
 * Frontmatter surgery shared by every write-back the Tasks view does: set each
 * key (replacing its line, or inserting it after `afterKey`, else at the end of
 * the block), bump `updated`, and leave every other byte of the note alone —
 * line endings, BOM, key order and body included.
 */
function writeFrontmatterKeys(
  content: string,
  keys: { key: string; value: string; afterKey?: string }[],
  today: string,
): string {
  const bom = content.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = bom ? content.slice(1) : content;
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(eol);

  const hasOpenDelim = OPEN_DELIM_RE.test(lines[0]);
  const closeIdx = hasOpenDelim ? lines.findIndex((l, i) => i > 0 && CLOSE_DELIM_RE.test(l)) : -1;
  if (!hasOpenDelim || closeIdx === -1) {
    const pairs = [...keys.map((k) => `${k.key}: ${serializeValue(k.value)}`), `updated: ${serializeValue(today)}`];
    return `${bom}---${eol}${pairs.join(eol)}${eol}---${eol}${body}`;
  }

  const openLine = lines[0];
  const closeLine = lines[closeIdx];
  let frontLines = lines.slice(1, closeIdx);
  const rest = lines.slice(closeIdx + 1);

  for (const k of keys) frontLines = upsertTopLevelKey(frontLines, k.key, k.value, k.afterKey);
  frontLines = upsertTopLevelKey(frontLines, 'updated', today);

  return bom + [openLine, ...frontLines, closeLine, ...rest].join(eol);
}

/** Status write-back (FR-15) — computed purely from the note's current text. */
export function setTaskStatus(content: string, status: string, today: string): string {
  return writeFrontmatterKeys(content, [{ key: 'status', value: status, afterKey: 'type' }], today);
}

/**
 * Due-date write-back (FR-15 / #41): `due` is a `YYYY-MM-DD` date, or `none` to
 * clear it. Same guarantees as setTaskStatus — only the `due:` and `updated:`
 * lines change, everything else is byte-identical.
 */
export function setTaskDue(content: string, due: string, today: string): string {
  return writeFrontmatterKeys(content, [{ key: 'due', value: due, afterKey: 'type' }], today);
}

/**
 * Full status-change flow: read the note, rewrite its `status`/`updated`
 * frontmatter, write it back CAS-guarded by the version that was just read.
 * Errors (incl. a 409 version_conflict ApiError) propagate to the caller.
 */
export async function changeTaskStatus(
  path: string,
  status: string,
  deps: { today?: string } = {},
): Promise<void> {
  const today = deps.today ?? todayISO();
  const r = await api.read(path);
  await api.write(path, setTaskStatus(r.content, status, today), r.version);
}

/**
 * Full due-date-change flow, twin of changeTaskStatus: read the note, rewrite
 * `due`/`updated`, write it back CAS-guarded by the version just read. `due` is
 * a `YYYY-MM-DD` date or `none` to clear it.
 */
export async function changeTaskDue(
  path: string,
  due: string,
  deps: { today?: string } = {},
): Promise<void> {
  const today = deps.today ?? todayISO();
  const r = await api.read(path);
  await api.write(path, setTaskDue(r.content, due, today), r.version);
}
