import { promises as fs } from 'node:fs';
import MiniSearch from 'minisearch';
import { getSettings } from './settings.js';
import { INDEX_FILE, config } from '../config.js';
import { listMarkdownFiles, readFileText } from './vault.js';
import { parseNote, type ParsedNote } from './markdown.js';
import { taskRecordFrom, type TaskRecord } from './tasks.js';
import { getVaultPreferences } from './vaultPreferences.js';
import { isUserIgnored } from './vaultPreferencesFilters.js';

/**
 * QMD — the WebObsidian search engine.
 * A thin, opinionated layer over MiniSearch giving fielded, fuzzy, prefix and
 * boolean queries over the vault's markdown, with incremental updates and a
 * persisted on-disk snapshot. Startup rebuilds from the current vault. (PRD FR-7)
 */

export interface QmdDoc {
  id: string; // vault-relative path
  title: string;
  headings: string;
  tags: string;
  path: string;
  body: string;
}

export interface SearchHit {
  path: string;
  title: string;
  score: number;
  tags: string[];
  snippet: string;
}

/** One match snippet within a note. `ranges` are [start,len] offsets into `text`
 *  marking where the query terms occur (for highlighting). */
export interface MatchContext {
  text: string;
  ranges: [number, number][];
  /** ellipsis flags — context is clipped from the surrounding body. */
  pre: boolean;
  post: boolean;
}

export interface NoteMatches {
  path: string;
  count: number; // total term occurrences in the note's body
  contexts: MatchContext[];
}

const FIELDS = ['title', 'headings', 'tags', 'path', 'body'] as const;

// Obsidian's built-in properties are always List-typed.
const CORE_LIST_PROPS = new Set(['tags', 'aliases', 'cssclasses']);

/** Classify a frontmatter value into an Obsidian property type
 *  (text | list | number | checkbox | date | datetime). */
function inferPropType(key: string, v: unknown): string {
  if (CORE_LIST_PROPS.has(key)) return 'list';
  if (Array.isArray(v)) return 'list';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'checkbox';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) return 'datetime';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date';
  }
  return 'text';
}

/** Re-base highlight ranges after `text.trim()` drops leading whitespace. */
function shiftRanges(untrimmed: string, ranges: [number, number][]): [number, number][] {
  const lead = untrimmed.length - untrimmed.replace(/^\s+/, '').length;
  const trimmedLen = untrimmed.trim().length;
  return ranges
    .map(([s, l]) => [Math.max(0, s - lead), l] as [number, number])
    .filter(([s]) => s < trimmedLen);
}

export class QmdEngine {
  private mini: MiniSearch<QmdDoc>;
  private snippets = new Map<string, string>();
  private tagSet = new Map<string, string[]>();
  // Per-note frontmatter key→type, for the vault-wide property suggestions list.
  private propMeta = new Map<string, Record<string, string>>();
  // `type: task` notes (PRD FR-15), keyed by path — built alongside the search
  // index so the Tasks board never triggers a per-request vault walk.
  private tasks = new Map<string, TaskRecord>();
  private ready = false;

  constructor() {
    this.mini = this.newIndex();
  }

  private newIndex() {
    return new MiniSearch<QmdDoc>({
      fields: FIELDS as unknown as string[],
      storeFields: ['title', 'path', 'tags'],
      // Auto-vacuum runs in a deferred task after discard/replace and has crashed
      // the process on large vaults (TreeIterator.dive → undefined). Disable it;
      // the index is fully rebuilt on restart, so stale terms never accumulate far.
      autoVacuum: false,
      searchOptions: {
        boost: { title: 4, headings: 2, tags: 3 },
        prefix: true,
        fuzzy: 0.2,
      },
    });
  }

  // Cap how much of a single note's body we index (some notes are huge); the
  // tail rarely changes search relevance and very large bodies blow up memory.
  private static MAX_BODY = 100_000;

  private async toDoc(rel: string): Promise<QmdDoc> {
    const raw = await readFileText(rel);
    return this.parsedToDoc(rel, parseNote(rel, raw));
  }

  private parsedToDoc(rel: string, note: ParsedNote): QmdDoc {
    // Copy the short snippet so a V8 sliced string cannot retain a huge body.
    const snippet = Buffer.from(note.body.replace(/\s+/g, ' ').trim().slice(0, 280)).toString('utf8');
    this.snippets.set(rel, snippet);
    this.tagSet.set(rel, note.tags);
    const meta: Record<string, string> = {};
    for (const [k, v] of Object.entries(note.frontmatter ?? {})) meta[k] = inferPropType(k, v);
    this.propMeta.set(rel, meta);
    const task = taskRecordFrom(rel, note);
    if (task) this.tasks.set(rel, task);
    else this.tasks.delete(rel);
    const body = note.body.length > QmdEngine.MAX_BODY ? note.body.slice(0, QmdEngine.MAX_BODY) : note.body;
    return {
      id: rel,
      title: note.title,
      headings: note.headings.join(' '),
      tags: note.tags.join(' '),
      path: rel,
      body,
    };
  }

  applyParsed(rel: string, note: ParsedNote): void {
    const doc = this.parsedToDoc(rel, note);
    if (this.mini.has(rel)) this.mini.replace(doc);
    else this.mini.add(doc);
    this.ready = true;
  }

  get documentCount(): number { return this.mini.documentCount; }

  exportState(): QmdState {
    return { mini: this.mini.toJSON(), snippets: [...this.snippets], tags: [...this.tagSet],
      propMeta: [...this.propMeta], tasks: [...this.tasks] };
  }

  static fromState(state: QmdState): QmdEngine {
    const engine = new QmdEngine();
    engine.mini = MiniSearch.loadJSON<QmdDoc>(JSON.stringify(state.mini), {
      fields: [...FIELDS], storeFields: ['title', 'path', 'tags'], autoVacuum: false,
    });
    engine.snippets = new Map(state.snippets); engine.tagSet = new Map(state.tags);
    engine.propMeta = new Map(state.propMeta); engine.tasks = new Map(state.tasks);
    engine.ready = true;
    return engine;
  }

  markReady(): void { this.ready = true; }

  /** Full (re)build from the vault. Adds incrementally so we never hold every
   *  note's full text in a single array (keeps peak memory bounded). */
  async build(): Promise<void> {
    const files = await listMarkdownFiles();
    this.mini = this.newIndex();
    this.snippets.clear();
    this.tagSet.clear();
    this.propMeta.clear();
    this.tasks.clear();
    for (const rel of files) {
      try {
        this.mini.add(await this.toDoc(rel));
      } catch {
        /* skip unreadable */
      }
    }
    this.ready = true;
    await this.persist();
  }

  async upsert(rel: string): Promise<void> {
    if (!/\.(md|markdown)$/i.test(rel)) return;
    try {
      const doc = await this.toDoc(rel);
      if (this.mini.has(rel)) this.mini.replace(doc);
      else this.mini.add(doc);
    } catch {
      // Preserve the last successful document during transient filesystem errors.
    }
  }

  remove(rel: string): void {
    if (this.mini.has(rel)) this.mini.discard(rel);
    this.snippets.delete(rel);
    this.tagSet.delete(rel);
    this.propMeta.delete(rel);
    this.tasks.delete(rel);
  }

  async rename(from: string, to: string): Promise<void> {
    this.remove(from);
    await this.upsert(to);
  }

  /** `limit <= 0` returns every match (caller renders incrementally). */
  async search(query: string, limit = 0, excludeFilters: readonly string[] = []): Promise<SearchHit[]> {
    if (!this.ready) await this.build();
    const s = await getSettings();
    const { filterText, fields } = parseFielded(query);

    const opts: Record<string, unknown> = {
      prefix: s.search.prefix,
      fuzzy: s.search.fuzzy,
      boost: { title: 4, headings: 2, tags: 3 },
    };
    if (fields.length) opts.fields = fields;

    const q = filterText.trim() || query.trim();
    const results = q ? this.mini.search(q, opts) : [];

    const visible = results.filter(r => !isUserIgnored(String(r.id), excludeFilters));
    const picked = limit > 0 ? visible.slice(0, limit) : visible;
    return picked.map((r) => ({
      path: r.id as string,
      title: (r as any).title ?? r.id,
      score: r.score,
      tags: this.tagSet.get(r.id as string) ?? [],
      snippet: this.snippets.get(r.id as string) ?? '',
    }));
  }

  /** Free-text terms from a query (operators like `tag:`/`path:` stripped),
   *  used to scan note bodies for highlightable occurrences. */
  queryTerms(query: string): string[] {
    const { filterText } = parseFielded(query);
    return (filterText || query)
      .split(/\s+/)
      .map((t) => t.replace(/^["']|["']$/g, '').trim())
      .filter((t) => t.length >= 2);
  }

  /** Read a note's body and extract every occurrence of `terms`, grouped into
   *  context windows (Obsidian-style per-note match list). Reads from disk so
   *  it's called lazily for the notes actually rendered. */
  async matchesFor(
    rel: string,
    terms: string[],
    opts: { caseSensitive?: boolean; maxContexts?: number } = {},
  ): Promise<NoteMatches> {
    const needles = terms.map((t) => (opts.caseSensitive ? t : t.toLowerCase())).filter(Boolean);
    if (!needles.length) return { path: rel, count: 0, contexts: [] };

    let body = '';
    try {
      body = parseNote(rel, await readFileText(rel)).body;
    } catch {
      return { path: rel, count: 0, contexts: [] };
    }
    const hay = opts.caseSensitive ? body : body.toLowerCase();

    // Collect every occurrence, then drop overlaps (greedy left-to-right).
    const raw: { start: number; len: number }[] = [];
    for (const n of needles) {
      for (let i = hay.indexOf(n); i !== -1; i = hay.indexOf(n, i + n.length)) {
        raw.push({ start: i, len: n.length });
      }
    }
    if (!raw.length) return { path: rel, count: 0, contexts: [] };
    raw.sort((a, b) => a.start - b.start || b.len - a.len);
    const occ: { start: number; len: number }[] = [];
    let lastEnd = -1;
    for (const o of raw) {
      if (o.start >= lastEnd) {
        occ.push(o);
        lastEnd = o.start + o.len;
      }
    }

    const PAD = 32; // chars of context on each side
    const MERGE_GAP = 64; // merge occurrences closer than this into one window
    const MAX = opts.maxContexts ?? 20;
    const contexts: MatchContext[] = [];
    let group: { start: number; len: number }[] = [];

    const flush = () => {
      if (!group.length || contexts.length >= MAX) {
        group = [];
        return;
      }
      const winStart = Math.max(0, group[0].start - PAD);
      const lastOcc = group[group.length - 1];
      const winEnd = Math.min(body.length, lastOcc.start + lastOcc.len + PAD);
      // length-preserving newline/tab → space so range offsets stay valid
      const text = body.slice(winStart, winEnd).replace(/[\n\r\t]/g, ' ');
      const ranges = group.map((o) => [o.start - winStart, o.len] as [number, number]);
      contexts.push({ text: text.trim(), ranges: shiftRanges(text, ranges), pre: winStart > 0, post: winEnd < body.length });
      group = [];
    };

    for (const o of occ) {
      if (group.length && o.start - (group[group.length - 1].start + group[group.length - 1].len) > MERGE_GAP) {
        flush();
      }
      group.push(o);
    }
    flush();

    return { path: rel, count: occ.length, contexts };
  }

  /** All `type: task` notes (PRD FR-15), sorted by path. Ensures the index is
   *  built first, same as search(), so callers never see a cold-start empty list. */
  async allTasks(): Promise<TaskRecord[]> {
    if (!this.ready) await this.build();
    return [...this.tasks.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Rebuild the tasks map from the vault after explicitly restoring a snapshot.
   * The Tasks board's contract is "source of truth stays the markdown vault": a
   * note edited while the server was down (or a deploy's `git pull`, which the
   * watcher's `ignoreInitial` never reports) must show its current column
   * right after boot, not whatever was true at the last full build.
   *
   * Normal startup now rebuilds the entire search index. Callers explicitly
   * using restore() can use this method to refresh tasks. Replaces the
   * map atomically at the end so a concurrent allTasks() never observes a
   * partially-rebuilt map.
   */
  async refreshTasks(): Promise<void> {
    const files = await listMarkdownFiles();
    const next = new Map<string, TaskRecord>();
    for (const rel of files) {
      try {
        const note = parseNote(rel, await readFileText(rel));
        const task = taskRecordFrom(rel, note);
        if (task) next.set(rel, task);
      } catch {
        /* skip unreadable */
      }
    }
    this.tasks = next;
  }

  allTags(): { tag: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const tags of this.tagSet.values()) {
      for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** Vault-wide frontmatter property keys (for the property-name suggester). */
  allProperties(): { key: string; type: string; count: number }[] {
    const count = new Map<string, number>();
    const types = new Map<string, Map<string, number>>();
    // Always offer Obsidian's built-in List properties, even if unused yet.
    for (const k of CORE_LIST_PROPS) {
      count.set(k, 0);
      types.set(k, new Map([['list', 1]]));
    }
    for (const meta of this.propMeta.values()) {
      for (const [k, t] of Object.entries(meta)) {
        count.set(k, (count.get(k) ?? 0) + 1);
        const tm = types.get(k) ?? new Map<string, number>();
        tm.set(t, (tm.get(t) ?? 0) + 1);
        types.set(k, tm);
      }
    }
    return [...count.entries()]
      .map(([key, c]) => {
        let best = 'text';
        let bn = 0;
        for (const [t, n] of types.get(key) ?? []) if (n > bn) { bn = n; best = t; }
        return { key, type: best, count: c };
      })
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }

  private async persist(): Promise<void> {
    try {
      await fs.mkdir(config.dataDir, { recursive: true });
      // `tasks` is deliberately NOT persisted (see refreshTasks()'s doc comment):
      // the Tasks board must always reflect the vault as of boot, not whatever
      // was true at the last full build.
      const payload = {
        mini: this.mini.toJSON(),
        snippets: [...this.snippets.entries()],
        tags: [...this.tagSet.entries()],
        propMeta: [...this.propMeta.entries()],
      };
      await fs.writeFile(INDEX_FILE, JSON.stringify(payload));
    } catch {
      /* non-fatal */
    }
  }

  async restore(): Promise<boolean> {
    try {
      const raw = await fs.readFile(INDEX_FILE, 'utf8');
      const payload = JSON.parse(raw);
      this.mini = MiniSearch.loadJSON<QmdDoc>(JSON.stringify(payload.mini), {
        fields: FIELDS as unknown as string[],
        storeFields: ['title', 'path', 'tags'],
        autoVacuum: false,
      });
      // A persisted *empty* index (e.g. a prior build ran while the vault was
      // briefly unreadable) must not be trusted — restoring it would leave the
      // engine ready=true with zero docs, so every query returns nothing and we
      // never rebuild. Treat it as a cache miss for callers explicitly restoring snapshots.
      if (this.mini.documentCount === 0) return false;
      this.snippets = new Map(payload.snippets);
      this.tagSet = new Map(payload.tags);
      this.propMeta = new Map(payload.propMeta ?? []);
      // this.tasks is intentionally left alone here — restore() doesn't load a
      // persisted tasks map. Explicit snapshot callers must refreshTasks();
      // normal startup rebuilds every field through build().
      this.ready = true;
      return true;
    } catch {
      return false;
    }
  }

  async save(): Promise<void> {
    await this.persist();
  }
}

/** Pull `field:` qualifiers out of a query into MiniSearch field filters. */
function parseFielded(query: string): { filterText: string; fields: string[] } {
  const fieldMap: Record<string, string> = {
    tag: 'tags',
    tags: 'tags',
    title: 'title',
    path: 'path',
    heading: 'headings',
  };
  const fields = new Set<string>();
  const rest: string[] = [];
  for (const tok of query.split(/\s+/)) {
    const m = tok.match(/^(\w+):(.+)$/);
    if (m && fieldMap[m[1].toLowerCase()]) {
      fields.add(fieldMap[m[1].toLowerCase()]);
      rest.push(m[2]);
    } else {
      rest.push(tok);
    }
  }
  return { filterText: rest.join(' '), fields: [...fields] };
}

export interface QmdState {
  mini: ReturnType<MiniSearch<QmdDoc>['toJSON']>;
  snippets: [string, string][];
  tags: [string, string[]][];
  propMeta: [string, Record<string, string>][];
  tasks: [string, TaskRecord][];
}

export let qmd = new QmdEngine();
export function publishQmd(engine: QmdEngine): void { qmd = engine; }

/** Runtime preference projection; the underlying engine stays restorable without a vault read. */
export async function searchVault(query: string, limit = 0): Promise<SearchHit[]> {
  const { values } = await getVaultPreferences();
  return qmd.search(query, limit, values.userIgnoreFilters);
}

/** Reconcile search with the current vault before accepting requests.
 * A persisted snapshot can miss files added/changed/deleted while stopped;
 * ignoreInitial watchers will never report those changes. The former boot
 * task refresh already read every note, so rebuild all indexed fields in the
 * same pass instead of trusting a non-empty but arbitrarily old snapshot. */
export async function initSearch(): Promise<void> {
  await qmd.build();
}
