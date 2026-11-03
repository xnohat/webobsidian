/**
 * Closed-vocabulary properties (FR-23).
 *
 * Some frontmatter keys have a fixed set of allowed values — the vault's `SCHEMA.md` writes them
 * down — so the properties block can offer them as a list instead of making the human type an id
 * from memory. A mistyped status is not cosmetic: the Tasks board maps only canonical ids and
 * aliases, and anything else becomes its own "unknown" column that the board never rewrites.
 *
 * `status` is per page kind: a task's statuses are not an abnormality's, and giving the picker the
 * wrong list would be worse than giving it none — so the list is resolved from the page's own
 * `type` and a page kind with no vocabulary (`system`, `entity`, …) offers no picker at all.
 *
 * The app does not enforce these lists. `optionsFor()` always carries the note's current value, the
 * value field stays editable text, and nothing is normalised on read: a value this table does not
 * know stays exactly as written and is simply marked as off-list in the picker.
 */

/** Allowed values per property key, in the order the vault's SCHEMA lists them. */
export const PROP_PICK_LISTS: Record<string, string[]> = {
  priority: ['P1', 'P2', 'P3'],
  origin: ['abnormality', 'assigned'],
  confidence: ['high', 'medium', 'low'],
  severity: ['minor', 'major', 'critical'],
};

/** `status`, per page kind — the vocabulary the vault's SCHEMA defines for that kind of page. */
export const STATUS_BY_TYPE: Record<string, string[]> = {
  task: ['open', 'in-progress', 'waiting', 'blocked', 'done', 'dropped'],
  abnormality: ['open', 'contained', 'countermeasure-agreed', 'verified', 'closed'],
  document: ['open', 'acted', 'archived'],
};

export interface PropOption {
  /** The value as it will be written into the frontmatter. */
  value: string;
  /** True for the note's own value when the table above does not know it. */
  offList: boolean;
  /** True for the note's current value (the one to show as selected). */
  current: boolean;
}

const normaliseKey = (key: string) => key.trim().toLowerCase();

/** The pick-list for a property key on a page of `type`, or null when there is no vocabulary. */
export function pickListFor(key: string, type = ''): string[] | null {
  const list = normaliseKey(key) === 'status' ? STATUS_BY_TYPE[normaliseKey(type)] : PROP_PICK_LISTS[normaliseKey(key)];
  return list ? [...list] : null;
}

/** True when the key offers a pick-list on a page of `type`. */
export function hasPickList(key: string, type = ''): boolean {
  return pickListFor(key, type) !== null;
}

/**
 * The options to show for `key` on a page of `type`, with the note's own value marked. Returns null
 * when there is no vocabulary for that key on that page kind.
 *
 * An off-list value is kept **in place of nothing** — first in the list, flagged `offList` — so the
 * picker can show what the note actually says without ever offering to change it silently. An empty
 * value adds no option (clearing a property is what the row's × is for).
 */
export function optionsFor(key: string, current = '', type = ''): PropOption[] | null {
  const list = pickListFor(key, type);
  if (!list) return null;
  const cur = current.trim();
  const known = list.some((v) => v.toLowerCase() === cur.toLowerCase());
  const opts: PropOption[] = list.map((value) => ({
    value,
    offList: false,
    current: cur !== '' && value.toLowerCase() === cur.toLowerCase(),
  }));
  if (cur !== '' && !known) opts.unshift({ value: cur, offList: true, current: true });
  return opts;
}
