import type { TreeNode } from './api';
import { findNode } from './tree';

/**
 * New note from template (FR-17) — the pure half.
 *
 * Everything here is side-effect free so it is unit-testable without a DOM or a
 * server; the store action `newFromTemplate` does the I/O and calls into this
 * module. No plugin API, no Templater, no new endpoint.
 */

export interface TemplateTokens {
  /** The title the human typed: the filename stem's tail, and `{{title}}`. */
  title: string;
  /** Browser-local date, `YYYY-MM-DD` (this deployment runs GMT+7). */
  date: string;
  /** Browser-local time, `HH:mm`. */
  time: string;
  /** Filename-safe form of the title. */
  slug: string;
}

const MD_RE = /\.(md|markdown)$/i;
const pad = (n: number) => String(n).padStart(2, '0');

export function dateStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeStamp(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Filename-safe slug: lowercase ASCII, diacritics folded — `đ`/`Đ` explicitly,
 * because NFD leaves them alone while it does decompose `ế`, `ộ`, … (Vietnamese
 * titles are the normal case here). Punctuation collapses to single hyphens and
 * the result is capped so a sentence-long title cannot make an unopenable path.
 */
export function slugify(text: string): string {
  return text
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * Fill a template's placeholders.
 *
 * The literal shapes the vault's own templates are written in (`YYYY-MM-DD`,
 * `YYYY-MM-DD-slug`) are substituted as well, so this works on templates as
 * they already are — no vault migration. The compound token goes first:
 * otherwise the bare date token consumes its `YYYY-MM-DD` prefix and leaves a
 * `-slug` behind in a `sources:` path.
 */
export function substituteTemplate(content: string, t: TemplateTokens): string {
  return content
    .replace(/YYYY-MM-DD-slug/g, `${t.date}-${t.slug}`)
    .replace(/YYYY-MM-DD/g, t.date)
    .replace(/\{\{title\}\}/g, t.title)
    .replace(/\{\{date\}\}/g, t.date)
    .replace(/\{\{time\}\}/g, t.time)
    .replace(/\{\{slug\}\}/g, t.slug);
}

/**
 * The vault's templates folder: the shallowest folder named `templates`
 * (case-insensitive), e.g. `Wiki/templates`. Breadth-first, so a nested copy
 * cannot shadow the top-level one.
 */
export function findTemplatesFolder(root: TreeNode | null): string | null {
  if (!root) return null;
  const queue: TreeNode[] = [...(root.children ?? [])];
  while (queue.length) {
    const n = queue.shift()!;
    if (n.type === 'folder' && n.name.toLowerCase() === 'templates') return n.path;
    queue.push(...(n.children ?? []));
  }
  return null;
}

/** Every markdown template in that folder, alphabetical. */
export function listTemplates(
  root: TreeNode | null,
  folder: string | null,
): { path: string; title: string }[] {
  const node = folder ? findNode(root, folder) : null;
  return (node?.children ?? [])
    .filter((c) => c.type === 'file' && MD_RE.test(c.name))
    .map((c) => ({ path: c.path, title: c.name.replace(MD_RE, '') }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Folder names a template's notes belong in, most likely first: pluralised
 * (`meeting` → `meetings`), the basename as written (`daily` → `daily`), `y` →
 * `ies` (`query`, `abnormality`), `-es` after a sibilant, and finally the last
 * hyphen segment pluralised — which is how `weekly-review` finds `reviews`.
 */
export function targetCandidates(basename: string): string[] {
  const b = basename.toLowerCase();
  const out: string[] = [];
  if (/[^aeiou]y$/.test(b)) out.push(`${b.slice(0, -1)}ies`);
  else if (/(s|x|z|ch|sh)$/.test(b)) out.push(`${b}es`);
  else out.push(`${b}s`);
  out.push(b);
  const last = b.split('-').pop() ?? b;
  if (last !== b) for (const c of targetCandidates(last)) if (!out.includes(c)) out.push(c);
  return out;
}

/**
 * Where a note made from this template goes, or `''` when the vault has no
 * folder for it yet. Candidate names are looked up among the templates
 * folder's siblings (`Wiki/templates/meeting.md` → `Wiki/meetings`).
 *
 * A missing folder is deliberately *not* created: the field is shown editable
 * instead, so a typo cannot scatter pages into a junk folder.
 */
export function resolveTargetFolder(root: TreeNode | null, templatePath: string): string {
  const dir = templatePath.includes('/') ? templatePath.slice(0, templatePath.lastIndexOf('/')) : '';
  const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
  const parentNode = parent ? findNode(root, parent) : root;
  const folders = (parentNode?.children ?? []).filter((c) => c.type === 'folder');
  const basename = (templatePath.split('/').pop() ?? '').replace(MD_RE, '');
  for (const cand of targetCandidates(basename)) {
    const hit = folders.find((c) => c.name.toLowerCase() === cand);
    if (hit) return hit.path;
  }
  return '';
}

/**
 * `<folder>/<base>.md`, falling back to `-2`, `-3` … for as long as `exists()`
 * says the path is taken — a new note never overwrites an existing one.
 */
export function uniqueNotePath(
  folder: string,
  base: string,
  exists: (path: string) => boolean,
): string {
  const join = (n: string) => (folder ? `${folder}/${n}` : n);
  let path = join(`${base}.md`);
  for (let i = 2; exists(path); i++) path = join(`${base}-${i}.md`);
  return path;
}
