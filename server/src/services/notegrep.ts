/**
 * Literal grep inside one note, for `GET /api/v1/note-matches`.
 *
 * Why not the search index: an agent grepping a note wants *every* literal occurrence with
 * its line number, and it wants it to be exactly what `read` would return. The QMD index is
 * tokenised/ranked and rebuilds asynchronously, so it can lag a write; a line scan of the
 * file it just read cannot. The scan is O(note size), which is nothing next to the HTTP hop.
 *
 * Adopted from the fork `blueberry6401/webobsidian` (they route this through their search
 * service's `matchesFor`); the response shape here mirrors theirs so agent clients are
 * portable — see docs/UPSTREAM_PR_MERGES.md → "Adopted from other forks".
 */

export interface GrepRange {
  /** 0-based offset of the match within the line. */
  start: number;
  /** 0-based offset just past the match. */
  end: number;
}

export interface GrepMatch {
  /** 1-based line number, counting from the first line of the file (frontmatter included). */
  line: number;
  /** The whole line, without its newline. */
  text: string;
  /** Every match on this line. */
  ranges: GrepRange[];
  /** The preceding line, when `context` > 0 and it exists. */
  pre?: string;
  /** The following line, when `context` > 0 and it exists. */
  post?: string;
}

export interface GrepResult {
  /** Total occurrences in the note (not capped by `maxMatches`). */
  count: number;
  /** Occurrences grouped per line, capped at `maxMatches` lines. */
  matches: GrepMatch[];
  /** True when `matches` is a prefix of the real match list. */
  truncated: boolean;
}

export interface GrepOptions {
  caseSensitive?: boolean;
  /** Cap on returned matching *lines* (default 20). */
  maxMatches?: number;
  /** Include the neighbouring lines (0 = no context, default 0). */
  context?: number;
}

/**
 * Find every literal occurrence of `query` in `content`.
 *
 * `query` is matched literally (no regex), which is what an agent editing a note needs:
 * `find` in the follow-up `PATCH` is literal too, so the line numbers and the edit agree.
 */
export function grepNote(content: string, query: string, opts: GrepOptions = {}): GrepResult {
  const { caseSensitive = false, maxMatches = 20, context = 0 } = opts;
  if (!query) return { count: 0, matches: [], truncated: false };

  const lines = content.split('\n');
  const haystack = caseSensitive ? lines : lines.map((l) => l.toLowerCase());
  const needle = caseSensitive ? query : query.toLowerCase();

  const matches: GrepMatch[] = [];
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = haystack[i];
    const ranges: GrepRange[] = [];
    let from = 0;
    for (;;) {
      const at = line.indexOf(needle, from);
      if (at === -1) break;
      ranges.push({ start: at, end: at + needle.length });
      count++;
      from = at + needle.length; // non-overlapping, like the find/replace edit
    }
    if (ranges.length === 0) continue;
    if (matches.length < maxMatches) {
      const m: GrepMatch = { line: i + 1, text: lines[i], ranges };
      if (context > 0) {
        if (i > 0) m.pre = lines[i - 1];
        if (i + 1 < lines.length) m.post = lines[i + 1];
      }
      matches.push(m);
    }
  }

  return { count, matches, truncated: count > matches.length };
}
