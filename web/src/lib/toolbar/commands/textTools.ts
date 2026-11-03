/** Pure selection transforms. No clipboard, DOM, editor or whole-document access.
 * Semantics follow Editing Toolbar's textEnhancement at 7f41f8df, with literal
 * extraction, stable CRLF, escaped table pipes and validated numbering.
 */
export interface TextTransformResult { output: string; warnings: string[] }

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/u;
const LINE_BREAK = /\r\n|\n|\r/;
const PAIRS: Record<string, string> = { '"': '"', "'": "'", '“': '”', '‘': '’', '(': ')', '（': '）', '[': ']', '{': '}', '《': '》' };
const ok = (output: string): TextTransformResult => ({ output, warnings: [] });
const warn = (output: string, message: string): TextTransformResult => ({ output, warnings: [message] });

function newlineOf(input: string): string { return input.match(LINE_BREAK)?.[0] ?? '\n'; }

function plainText(input: string, newline: string): string {
  // Protect literal code and escaped punctuation before removing Markdown.
  let token = '\uE000plain';
  while (input.includes(token)) token += '_';
  const literals: string[] = [];
  const protectedText = input.replace(/(^|\n)[ \t]*(`{3,}|~{3,})[^\r\n]*\r?\n([\s\S]*?)\r?\n[ \t]*\2[^\r\n]*|(`+)([^\r\n]*?)\4|\\([\\`*_{}\[\]()#+.!|>~-])/g,
    (_match, leading: string | undefined, _fence: string, code: string | undefined, _ticks: string, inline: string | undefined, escaped: string | undefined) => {
      const value = code !== undefined ? `${leading ?? ''}${code}` : inline ?? escaped ?? '';
      return `${token}${literals.push(value) - 1}\uE001`;
    });
  const text = protectedText
    .replace(/!?(?:\[\[)([^\]\n]+)\]\]/g, (_m, target: string) => target.includes('|') ? target.slice(target.lastIndexOf('|') + 1) : target)
    .replace(/!?\[([^\]\n]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, '$1')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<\/?[A-Za-z][^<>]*>/g, '')
    .replace(/^\s{0,3}#{1,6}[ \t]+|[ \t]+#+[ \t]*$/gm, '')
    .replace(/^[ \t]*(?:>[ \t]*)+/gm, '')
    .replace(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '')
    .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '')
    .replace(/==(?:🔴|🟠|🟡|🟢|🔵|🟣)?([^\n]*?)==/g, '$1')
    .replace(/(\*\*|__|~~)(?=\S)([^]*?\S)\1/g, '$2')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/(^|[^\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}])/gu, '$1$2')
    .split(LINE_BREAK).map(line => line.trim()).join(newline);
  return text.replace(new RegExp(`${token}(\\d+)\uE001`, 'g'), (_m, index: string) => literals[Number(index)]);
}

function smartSymbols(input: string): string {
  const chinese = (input.match(/[\u3400-\u9fff\uf900-\ufaff]/gu)?.length ?? 0) / input.length > 0.1;
  const convert = (part: string): string => chinese
    ? part.replace(/,/g, '，').replace(/\.(?!\d)/g, '。').replace(/;/g, '；').replace(/:/g, '：')
      .replace(/\?/g, '？').replace(/!/g, '！').replace(/\(/g, '（').replace(/\)/g, '）')
      .replace(/"([^"]*)"/g, '“$1”').replace(/([\u3400-\u9fff])([a-zA-Z0-9])/g, '$1 $2')
      .replace(/([a-zA-Z0-9])([\u3400-\u9fff])/g, '$1 $2')
    : part.replace(/[，。；：？！]/g, symbol => ({ '，': ', ', '。': '. ', '；': '; ', '：': ': ', '？': '? ', '！': '! ' })[symbol]!)
      .replace(/（/g, '(').replace(/）/g, ')').replace(/[“”]/g, '"').replace(/ {2,}/g, ' ');
  // Transform only gaps between protected regions; no collision-prone sentinels.
  const protectedRegion = /(`{3,}|~{3,})[^]*?\1|`+[^`]*`+|\$\$[^]*?\$\$|\$[^$\r\n]+\$|!?\[[^\]\n]*\]\((?:[^()\n]|\([^()\n]*\))*\)|https?:\/\/[^\s)]+/g;
  const parts: string[] = [];
  let cursor = 0;
  for (const match of input.matchAll(protectedRegion)) {
    parts.push(convert(input.slice(cursor, match.index)), match[0]);
    cursor = match.index + match[0].length;
  }
  parts.push(convert(input.slice(cursor)));
  return parts.join('');
}

function splitOutsidePairs(input: string, separator: string): string[] {
  // Most large selections contain no quoting. Let the native string splitter
  // handle those without a JavaScript scan for every possible separator.
  if (!/[\\"'“‘(（\[{《]/.test(input)) return input.split(separator).map(part => part.trim()).filter(Boolean);
  const stack: string[] = [];
  const parts: string[] = [];
  let from = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '\\') { i++; continue; }
    if (stack.length && char === stack[stack.length - 1]) { stack.pop(); continue; }
    const quote = stack[stack.length - 1];
    if (quote === '"' || quote === "'" || quote === '”' || quote === '’') continue;
    if (PAIRS[char] && !(char === "'" && /[\p{L}\p{N}]/u.test(input[i - 1] ?? ''))) {
      stack.push(PAIRS[char]);
      continue;
    }
    if (!stack.length && input.startsWith(separator, i)) {
      parts.push(input.slice(from, i).trim());
      from = i + separator.length;
      i += separator.length - 1;
    }
  }
  parts.push(input.slice(from).trim());
  return parts.filter(Boolean);
}

function splitLines(input: string, params: Record<string, string>, newline: string): TextTransformResult {
  let separator = params.sep ?? params.separator;
  if (separator === undefined || separator === '') {
    // Require a marker followed by whitespace, so decimals are never list markers.
    const list = /(?:^|\s)\d+[.、][ \t]+/g;
    if ([...input.matchAll(list)].length > 1) return ok(input.split(list).map(part => part.trim()).filter(Boolean).join(newline));
    const arrow = /\s*(?:→|=>|>)[ \t]*/g;
    if ([...input.matchAll(arrow)].length > 1) return ok(input.split(arrow).map(part => part.trim()).filter(Boolean).join(newline));
    let bestCount = 0;
    const unquoted = !/[\\"'“‘(（\[{《]/.test(input);
    const counts = new Map<string, number>();
    if (unquoted) {
      for (const match of input.matchAll(/[、，,;；|·]/g)) counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
    }
    for (const candidate of ['、', '，', ',', ';', '；', '|', '·']) {
      const count = unquoted ? counts.get(candidate) ?? 0 : splitOutsidePairs(input, candidate).length - 1;
      if (count > bestCount) { bestCount = count; separator = candidate; }
    }
  }
  if (!separator) return warn(input, 'No separator or list pattern found.');
  return ok(splitOutsidePairs(input, separator).join(newline));
}

function mergeLines(lines: string[], separator: string, newline: string): string {
  if (separator !== '') return lines.map(line => line.trim()).filter(Boolean).join(separator);
  const result: string[] = [];
  let previous = '';
  let paragraphBreak = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (previous) paragraphBreak = true; continue; }
    if (previous) {
      if (paragraphBreak) result.push(newline, newline);
      else if (!(CJK.test(previous.slice(-1)) && CJK.test(line[0]))) result.push(' ');
    }
    result.push(line);
    previous = line;
    paragraphBreak = false;
  }
  return result.join('');
}

function escapeCell(input: string): string {
  // Existing escapes count: a pipe must have an odd number of backslashes.
  return input.replace(/(\\*)\|/g, (_match, slashes: string) => `${slashes}${slashes.length % 2 ? '' : '\\'}|`);
}

function tableCells(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let hadSeparator = false;
  const source = line.trim();
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\\' && (source[i + 1] === '|' || source[i + 1] === '\\')) { cell += source[++i]; continue; }
    if (char === '|') { cells.push(cell.trim()); cell = ''; hadSeparator = true; }
    else cell += char;
  }
  cells.push(cell.trim());
  if (source.startsWith('|')) cells.shift();
  if (source.endsWith('|') && cells[cells.length - 1] === '') cells.pop();
  return hadSeparator ? cells : [];
}

function listToTable(input: string, lines: string[], newline: string): TextTransformResult {
  const listPattern = /^([ \t]*)(?:[-*+]|\d+\.)[ \t]+(.*)$/;
  const entries = lines.map(line => ({ line, match: line.match(listPattern) }));
  const indents = entries.filter(entry => entry.match).map(entry => entry.match![1].replace(/\t/g, '    ').length);
  if (!indents.length) return warn(input, 'Select a Markdown list first.');
  const baseline = indents.reduce((min, indent) => Math.min(min, indent), Infinity);
  const positive = indents.filter(indent => indent > baseline);
  const unit = positive.length ? positive.reduce((min, indent) => Math.min(min, indent), Infinity) - baseline : 4;
  const depthOf = (indent: string) => Math.round((indent.replace(/\t/g, '    ').length - baseline) / unit);
  const maxLevel = entries.reduce((max, entry) => entry.match ? Math.max(max, depthOf(entry.match[1])) : max, 0);
  const rows: string[][] = [];
  const pre: string[] = [];
  let row: string[] = [];
  let started = false;
  for (const { line, match } of entries) {
    if (!match) {
      if (!started) pre.push(line);
      else if (line.trim() && row.length) row[row.length - 1] += `<br>${line.trim()}`;
      continue;
    }
    started = true;
    const level = depthOf(match[1]);
    const content = match[2].trim();
    if (maxLevel === 1) {
      if (level === 0) {
        if (row.length) rows.push(row);
        row = [content, ''];
      } else {
        row[1] = row[1] ? `${row[1]}<br>${content}` : content;
      }
    } else {
      if (row[level] !== undefined) { rows.push(row); row = row.slice(0, level); }
      row[level] = content;
    }
  }
  if (row.length) rows.push(row);
  const columns = maxLevel + 1;
  const output = [
    `| ${Array.from({ length: columns }, (_, i) => i ? `Content ${i}` : 'Item').join(' | ')} |`,
    `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`,
  ];
  let previous: string[] = [];
  for (const source of rows) {
    const cells = Array.from({ length: columns }, (_, i) => {
      const value = source[i] ?? '';
      const repeatedAncestor = maxLevel !== 1 && value === previous[i] && source.slice(0, i).every((parent, index) => parent === previous[index]);
      return escapeCell(repeatedAncestor ? '' : value);
    });
    output.push(`| ${cells.join(' | ')} |`);
    previous = source;
  }
  const lead = pre.join(newline).trimEnd();
  return ok(`${lead ? lead + newline + newline : ''}${output.join(newline)}`);
}

function tableToList(input: string, lines: string[], newline: string): TextTransformResult {
  const rows = lines.filter(line => line.trim()).map(tableCells);
  const separator = rows.findIndex(row => row.length > 0 && row.every(cell => /^:?-{3,}:?$/.test(cell)));
  if (separator < 1 || rows.some(row => !row.length)) return warn(input, 'Select a valid Markdown table first.');
  const result: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (i === separator) continue;
    // Only our generated header is omitted; real labels such as Contentment stay.
    if (i === separator - 1 && rows[i].every((cell, col) => cell === (col ? `Content ${col}` : 'Item'))) continue;
    rows[i].forEach((cell, col) => {
      if (cell) result.push(`${'  '.repeat(col)}- ${cell}`);
    });
  }
  return ok(result.join(newline));
}

/**
 * Accepts `editing-toolbar:ID` or `ID`. Parameters are literal strings:
 * - add-wrap: prefix, suffix (blank lines remain untouched)
 * - number-lines: start='1', step='1', sep='. ', prefix=''
 * - merge-lines: sep='' for smart spacing, or a literal custom separator
 * - split-lines: optional sep; otherwise detect lists or punctuation
 * - extract-between: nonempty literal start and end
 * `separator` is also accepted as an alias for `sep`. Invalid input is a no-op
 * with a warning. The caller owns selection, preview, Cancel and dispatch.
 */
export function transformText(id: string, input: string, params: Record<string, string>): TextTransformResult {
  if (!input) return ok(input);
  const key = id.replace(/^editing-toolbar:/, '');
  const newline = newlineOf(input);
  const lines = input.split(LINE_BREAK);
  switch (key) {
    case 'get-plain-text': return ok(plainText(input, newline));
    case 'smart-symbols': return ok(smartSymbols(input));
    case 'insert-blank-lines': {
      const result: string[] = [];
      lines.forEach((line, index) => {
        result.push(line);
        if (line.trim() && index < lines.length - 1 && lines[index + 1].trim()) result.push('');
      });
      return ok(result.join(newline));
    }
    case 'remove-blank-lines': return ok(lines.filter(line => line.trim()).join(newline));
    case 'split-lines': return splitLines(input, params, newline);
    case 'merge-lines': return ok(mergeLines(lines, params.sep ?? params.separator ?? '', newline));
    case 'dedupe-lines': {
      const seen = new Set<string>();
      return ok(lines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (seen.has(trimmed)) return false;
        seen.add(trimmed);
        return true;
      }).join(newline));
    }
    case 'add-wrap': return ok(lines.map(line => line.trim() ? `${params.prefix ?? ''}${line}${params.suffix ?? ''}` : line).join(newline));
    case 'number-lines': {
      const start = Number(params.start ?? '1');
      const step = Number(params.step ?? '1');
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(step) || params.start === '' || params.step === '') return warn(input, 'Start and step must be safe integers.');
      const count = lines.reduce((total, line) => total + (line.trim() ? 1 : 0), 0);
      if (!Number.isSafeInteger(start + Math.max(0, count - 1) * step)) return warn(input, 'Numbering exceeds the safe integer range.');
      let number = start;
      return ok(lines.map(line => {
        if (!line.trim()) return line;
        const content = line.replace(/^[ \t]*\d+[.)）、][ \t]*/, '');
        const numbered = `${params.prefix ?? ''}${number}${params.sep ?? params.separator ?? '. '}${content}`;
        number += step;
        return numbered;
      }).join(newline));
    }
    case 'remove-whitespace-trim': return ok(lines.map(line => line.trim()).join(newline));
    case 'remove-whitespace-compress': return ok(input.replace(/[ \u3000]+/g, ' '));
    case 'remove-whitespace-all': return ok(input.replace(/[ \u3000\t]+/g, ''));
    case 'list-to-table': return listToTable(input, lines, newline);
    case 'table-to-list': return tableToList(input, lines, newline);
    case 'extract-between': {
      const { start, end } = params;
      if (!start || !end) return warn(input, 'Specify nonempty start and end strings.');
      const matches: string[] = [];
      let cursor = 0;
      while (cursor < input.length) {
        const from = input.indexOf(start, cursor);
        if (from < 0) break;
        const contentFrom = from + start.length;
        const to = input.indexOf(end, contentFrom);
        if (to < 0) break;
        matches.push(input.slice(contentFrom, to));
        cursor = to + end.length;
      }
      return matches.length ? ok(matches.join(newline)) : warn(input, 'No matches found.');
    }
    default: return warn(input, `Unknown text tool: ${id}`);
  }
}
