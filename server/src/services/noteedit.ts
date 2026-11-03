/**
 * Atomic find/replace for the Agent API (`PATCH /api/v1/notes/{path}`).
 *
 * A pure function — no filesystem access — so the route and the tests exercise exactly
 * the same code. Every match and every replacement is LITERAL: `find` never goes through
 * `new RegExp()` (special characters would change meaning) and the replacement never goes
 * through `String.replace(string, …)` (where `$&`, `$1`, `$$` in the replacement text
 * would be interpreted). `indexOf` + `split/join` instead.
 *
 * Adopted from the fork `blueberry6401/webobsidian` (their `services/noteedit.ts`), which
 * is why the error names are theirs — agents already written against that API keep working.
 */

export interface EditSuccess {
  /** Content after the replacement. */
  content: string;
  /** How many occurrences were replaced (always 1 unless `replaceAll`). */
  replaced: number;
}

export interface EditFailure {
  error: 'find_not_found' | 'find_ambiguous';
  /** Occurrence count — present only for `find_ambiguous`. */
  count?: number;
}

export type EditResult = EditSuccess | EditFailure;

/** Non-overlapping occurrences of `find` in `content`. `find` must be non-empty. */
function countOccurrences(content: string, find: string): number {
  return content.split(find).length - 1;
}

/**
 * Apply find/replace to `content`. Preconditions (validated by the route): `find` is a
 * non-empty string, `replace` is a string (empty allowed).
 * - 0 matches → `{ error: 'find_not_found' }`
 * - ≥2 matches without `replaceAll` → `{ error: 'find_ambiguous', count }` — the caller
 *   must disambiguate (more context, or `replaceAll: true`) instead of guessing
 * - otherwise → first occurrence (or all of them with `replaceAll`)
 */
export function applyEdit(content: string, find: string, replace: string, replaceAll: boolean): EditResult {
  const count = countOccurrences(content, find);
  if (count === 0) return { error: 'find_not_found' };
  if (count >= 2 && !replaceAll) return { error: 'find_ambiguous', count };
  if (replaceAll) {
    // split/join = literal replaceAll: immune to regex characters in `find` and to
    // `$`-patterns in `replace`.
    return { content: content.split(find).join(replace), replaced: count };
  }
  const idx = content.indexOf(find);
  return { content: content.slice(0, idx) + replace + content.slice(idx + find.length), replaced: 1 };
}
