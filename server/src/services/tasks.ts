import type { ParsedNote } from './markdown.js';

/**
 * Tasks (PRD FR-15) — pure logic over `type: task` notes, no I/O.
 * Twin of `web/src/lib/tasks.ts` — keep the canonical/alias table in sync with it.
 */

export interface TaskRecord {
  path: string; // vault-relative
  title: string; // frontmatter title, fallback file name without extension (parseNote's rule)
  status: string; // canonical id if canonical/alias; else the raw value unchanged; 'open' when missing
  statusRaw: string | null; // the raw frontmatter value as a string; null when the key is absent/empty
  priority: string | null;
  owner: string | null;
  due: string | null; // 'YYYY-MM-DD' | other raw string (e.g. 'none') | null
  raised: string | null;
  created: string | null;
  updated: string | null;
  tags: string[]; // parseNote(...).tags
}

/** Canonical statuses / columns, in board order. */
export const CANONICAL_STATUSES = ['open', 'in-progress', 'blocked', 'done'] as const;
const CANONICAL_SET = new Set<string>(CANONICAL_STATUSES);

/** Aliases (case-insensitive, trimmed) onto a canonical status id. */
const STATUS_ALIASES: Record<string, string> = {
  todo: 'open',
  doing: 'in-progress',
  wip: 'in-progress',
  waiting: 'blocked',
  'on-hold': 'blocked',
  closed: 'done',
  completed: 'done',
  complete: 'done',
};

/** Resolve a status value to its comparison key: canonical id for
 *  canonical/alias values, lowercased-trimmed raw value otherwise. */
function statusKey(raw: string): string {
  const key = raw.trim().toLowerCase();
  return STATUS_ALIASES[key] ?? key;
}

/**
 * Normalise a frontmatter `status` value.
 * - Missing/empty (null/undefined/'') -> { status: 'open', statusRaw: null }.
 * - Canonical or alias (case-insensitive, trimmed) -> canonical id, raw value kept in statusRaw.
 * - Anything else (unknown) -> the raw value UNCHANGED as both status and statusRaw — never
 *   silently coerced or rewritten.
 */
export function normaliseStatus(raw: unknown): { status: string; statusRaw: string | null } {
  const statusRaw = scalarToField(raw);
  // Blank/whitespace-only (e.g. `status: "   "`) is blank too — keep in sync
  // with the web twin's normaliseStatus (web/src/lib/tasks.ts).
  if (statusRaw === null || statusRaw.trim() === '') return { status: 'open', statusRaw: null };
  const trimmed = statusRaw.trim();
  const key = trimmed.toLowerCase();
  if (CANONICAL_SET.has(key)) return { status: key, statusRaw };
  if (STATUS_ALIASES[key]) return { status: STATUS_ALIASES[key], statusRaw };
  // Unknown — trimmed value as both, never the raw untrimmed form (web twin parity).
  return { status: trimmed, statusRaw: trimmed };
}

/** Format a frontmatter scalar for the record: gray-matter parses an unquoted
 *  YAML date as a JS Date, formatted here as YYYY-MM-DD using UTC getters (the
 *  date carries no time zone in the source). Any other scalar -> String(v);
 *  empty string / null / undefined -> null. */
function scalarToField(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  return s === '' ? null : s;
}

/** A note lives under a template folder — any path segment literally named
 *  "templates" (case-insensitive) — and is never selected as a task, even when
 *  it carries `type: task` (the vault's own Wiki/templates/task.md does). */
export function isTemplatePath(rel: string): boolean {
  return rel.split('/').some((seg) => seg.toLowerCase() === 'templates');
}

/** Build a TaskRecord from an already-parsed note, or null if it isn't a
 *  (non-template) `type: task` note. Pure — no I/O. */
export function taskRecordFrom(rel: string, note: ParsedNote): TaskRecord | null {
  const type = note.frontmatter?.type;
  if (typeof type !== 'string' || type.trim().toLowerCase() !== 'task') return null;
  if (isTemplatePath(rel)) return null;

  const { status, statusRaw } = normaliseStatus(note.frontmatter?.status);
  return {
    path: rel,
    title: note.title,
    status,
    statusRaw,
    priority: scalarToField(note.frontmatter?.priority),
    owner: scalarToField(note.frontmatter?.owner),
    due: scalarToField(note.frontmatter?.due),
    raised: scalarToField(note.frontmatter?.raised),
    created: scalarToField(note.frontmatter?.created),
    updated: scalarToField(note.frontmatter?.updated),
    tags: note.tags,
  };
}

export interface TaskFilter {
  folder?: string;
  status?: string;
  priority?: string;
  owner?: string;
  q?: string;
}

/** Pure filter over already-selected TaskRecords. Empty/absent params are ignored. */
export function filterTasks(tasks: TaskRecord[], filter: TaskFilter): TaskRecord[] {
  let out = tasks;

  const folder = filter.folder?.replace(/^\/+|\/+$/g, '');
  if (folder) {
    out = out.filter((t) => t.path === folder || t.path.startsWith(folder + '/'));
  }

  if (filter.status) {
    const want = statusKey(filter.status);
    out = out.filter((t) => statusKey(t.status) === want);
  }

  if (filter.priority) {
    const want = filter.priority.trim().toLowerCase();
    out = out.filter((t) => t.priority?.toLowerCase() === want);
  }

  if (filter.owner) {
    const want = filter.owner.trim().toLowerCase();
    out = out.filter((t) => t.owner?.toLowerCase() === want);
  }

  if (filter.q) {
    const want = filter.q.trim().toLowerCase();
    out = out.filter((t) => t.title.toLowerCase().includes(want));
  }

  return out;
}
