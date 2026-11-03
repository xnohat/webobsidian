/**
 * Make a search match context read like prose: drop Markdown syntax that the
 * raw body carries (`[[…]]`, `**`, heading `#`s, table pipes and `|---|`
 * separator rows, backticks, `~~`) and collapse whitespace — while re-mapping the
 * highlight ranges so the query terms stay marked on the cleaned text.
 */
export function cleanSnippet(
  text: string,
  ranges: [number, number][],
): { text: string; ranges: [number, number][] } {
  // Mark each source character as kept (true) or dropped (false).
  const keep = new Array<boolean>(text.length).fill(true);
  const drop = (re: RegExp, group?: (m: RegExpExecArray) => [number, number][]) => {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const spans = group ? group(m) : [[m.index, m[0].length] as [number, number]];
      for (const [s, l] of spans) for (let i = s; i < s + l; i++) keep[i] = false;
      if (m[0].length === 0) re.lastIndex++;
    }
  };
  // Table separator rows / cells: `|---|:--:|`
  drop(/\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-*:?/g);
  // Wikilink/embed brackets, keeping the alias when there is one: `![[a|b]]` → `b`.
  drop(/!?\[\[([^\]|]*\|)?|\]\]/g);
  // Bold / code / strikethrough markers. (`__` and `==` are left alone: they
  // show up in code and comparisons far more often than as emphasis.)
  drop(/\*\*|`+|~~/g);
  // Heading markers. The server flattens newlines to spaces, so a line start
  // can't be told apart — list bullets (`- `) and quotes (`> `) are left alone
  // since they look exactly like a spaced dash / comparison in prose.
  drop(/(^|\s)(#{1,6})\s/g, (m) => {
    const lead = m[1].length;
    return [[m.index + lead, m[2].length]];
  });
  // Table cell pipes.
  drop(/\|/g);

  // Build the cleaned string, collapsing runs of whitespace, with an index map.
  const map = new Array<number>(text.length + 1);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    map[i] = out.length;
    if (!keep[i]) continue;
    const ch = /\s/.test(text[i]) ? ' ' : text[i];
    if (ch === ' ' && (out.length === 0 || out.endsWith(' '))) continue;
    out += ch;
  }
  map[text.length] = out.length;
  const trimmedEnd = out.replace(/\s+$/, '').length;
  const clean = out.slice(0, trimmedEnd);

  const mapped: [number, number][] = [];
  for (const [s, l] of ranges) {
    const a = map[Math.min(s, text.length)];
    const b = Math.min(map[Math.min(s + l, text.length)], clean.length);
    if (b > a) mapped.push([a, b - a]);
  }
  return { text: clean, ranges: mapped };
}
