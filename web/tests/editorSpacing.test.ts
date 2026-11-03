import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * CodeMirror draws the editor from a *height map* built out of border-box rects of
 * the tiles it renders, and it assumes tiles stack directly on top of each other.
 * Space contributed by a vertical `margin` therefore never reaches the map: the map
 * stays shorter than the real document, and every click below the gap resolves to a
 * document line one or two rows further down ("I clicked here, the caret went there").
 *
 * The rule for editor CSS is therefore: vertical spacing on an editor *block* is
 * `padding` (visible to the map), never `margin`. Nested elements are fine as long as
 * the block that contains them has padding of its own (a margined child stays inside
 * a padded parent's box, so the map still sees the space).
 *
 * This test is the guard: it fails when a vertical margin is (re)introduced on any of
 * the elements CodeMirror renders as an editor block.
 */

/**
 * The widget DOMs CodeMirror renders as *blocks* inside `.cm-content`, i.e. the ones
 * the height map measures directly. Inline widgets (images, media players, note
 * transclusions) live inside a `.cm-line` and are covered by that line's rect, so
 * their own margins are harmless — verified in a real browser, see the PR notes.
 */
const BLOCK_ROOTS = [
  '.cm-inline-title', // note title widget (block widget)
  '.cm-properties', // frontmatter / properties shell (block replace)
  '.cm-table-wrap', // interactive table widget (block replace)
  '.cm-html-preview', // ```html render toggle (block widget/replace)
  '.cm-html-block', // raw HTML block (block replace)
  '.cm-mermaid', // mermaid diagram (block replace)
];

interface Rule {
  source: string;
  selector: string;
  declarations: string;
}

/** Parse plain CSS (`selector { declarations }`), ignoring comments and at-rules. */
function parseCss(source: string, text: string): Rule[] {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (selector.startsWith('@')) continue;
    rules.push({ source, selector, declarations: m[2] });
  }
  return rules;
}

/**
 * Parse the flat entries of a CodeMirror `baseTheme({...})` object: `'.sel': { ... }`.
 * (Theme entries are one level deep, so a non-greedy brace match is enough.)
 */
function parseThemeObject(source: string, text: string): Rule[] {
  const start = text.indexOf('livePreviewTheme = EditorView.baseTheme(');
  const body = start === -1 ? text : text.slice(start);
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const rules: Rule[] = [];
  const re = /'([^']+)':\s*\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) rules.push({ source, selector: m[1], declarations: m[2] });
  return rules;
}

/** Non-zero vertical components of `margin` / `marginTop` / `marginBottom`. */
/** Non-zero vertical components of `margin` / `marginTop` / `marginBottom`. */
function verticalMargins(declarations: string): string[] {
  const found: string[] = [];
  // CSS separates declarations with ';', the CodeMirror theme object with ','.
  const decls = declarations.split(';').flatMap((d) => d.split(/,(?![^(]*\))/));
  for (const decl of decls) {
    const m = decl.match(/(?:^|[\s'"])(margin(?:-top|-bottom|Top|Bottom)?)\s*:\s*(?:'([^']*)'|"([^"]*)"|([^;']+))/);
    if (!m) continue;
    const prop = m[1];
    const value = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (prop === 'margin-right' || prop === 'margin-left' || prop === 'marginRight' || prop === 'marginLeft') continue;
    const parts = value.split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    // `margin: <v>` / `<v> <h>` / `<v> <h> <v>` / `<v> <h> <v> <h>`
    const vertical = [parts[0], parts.length >= 3 ? parts[2] : parts[0]];
    const bad = vertical.filter((v) => !/^0(px|em|rem|%)?$/.test(v));
    if (bad.length) found.push(`${prop}: ${value}`);
  }
  return found;
}

function lastCompound(selector: string): string {
  const parts = selector.split(/[\s>+~]+/).filter(Boolean);
  return parts[parts.length - 1] ?? selector;
}

test('editor block widgets never use vertical margins (they are invisible to CodeMirror)', () => {
  const root = new URL('../src/', import.meta.url);
  const sources: [string, string][] = [
    ['styles/obsidian.css', readFileSync(new URL('styles/obsidian.css', root), 'utf8')],
    ['lib/livePreview.ts', readFileSync(new URL('lib/livePreview.ts', root), 'utf8')],
  ];
  const offences: string[] = [];
  for (const [name, text] of sources) {
    const rules = name.endsWith('.css') ? parseCss(name, text) : parseThemeObject(name, text);
    for (const rule of rules) {
      for (const selector of rule.selector.split(',')) {
        const target = lastCompound(selector.trim()).replace(/:{1,2}[\w-]+(\([^)]*\))?/g, '');
        if (!BLOCK_ROOTS.includes(target)) continue;
        for (const margin of verticalMargins(rule.declarations)) {
          offences.push(`${name}: "${selector.trim()}" declares ${margin}`);
        }
      }
    }
  }
  assert.deepEqual(
    offences,
    [],
    'Vertical margins on editor blocks shift clicks (use padding):\n  ' +
      offences.join('\n  ') +
      '\nSee README › Live Preview geometry.',
  );
});

test('the guard itself catches a vertical margin (self-check)', () => {
  const css = '.cm-table-wrap { display: block; margin: 8px 18px 18px 0; }\n.cm-inline-title { margin-bottom: 0.5em; }';
  const rules = parseCss('self-check.css', css);
  const offences = rules.flatMap((r) => verticalMargins(r.declarations));
  assert.equal(offences.length, 2);
  assert.deepEqual(verticalMargins('.cm-x { margin: 0; margin-top: 0px; padding: 4px 0 8px; }'), []);
  assert.deepEqual(verticalMargins("'.cm-x': { margin: '0 0 0.5em', padding: '0' }"), ['margin: 0 0 0.5em']);
});
