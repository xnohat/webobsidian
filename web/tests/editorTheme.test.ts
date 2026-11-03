import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * This app themes through CSS variables on a `.theme-*` wrapper and never enables
 * CodeMirror's `darkTheme` facet, so every one of CodeMirror's *own* hard-coded colours
 * stays in its light variant no matter which theme is active. Two of those are
 * user-visible and were reported as bugs:
 *
 *   - `.cm-cursor` / `.cm-dropCursor`: `drawSelection()` hides the native caret and paints
 *     this element, whose border is hard-coded `black` (`&dark` would make it `#ddd`) — on a
 *     dark theme the caret was black on near-black.
 *   - `.cm-panels` (the Find & Replace panel from `openSearchPanel`): hard-coded `#f5f5f5`
 *     on black text — a bright box on a dark UI.
 *
 * The app must therefore override these with palette variables. This test fails if such an
 * override is dropped or replaced by a literal colour (which would break every theme but
 * the one it was picked in).
 */

const css = readFileSync(new URL('../src/styles/obsidian.css', import.meta.url), 'utf8');

/** Declarations of the last rule whose selector matches `re` (ignoring comments). */
function lastRule(re: RegExp): string | null {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim().replace(/\s+/g, ' '), decl: m[2] }));
  const hit = rules.filter((r) => r.sel.split(',').some((s) => re.test(s.trim())));
  return hit.length ? hit[hit.length - 1].decl : null;
}

test('the drawn caret is themed from the palette, not left at CodeMirror’s black', () => {
  const decl = lastRule(/^\.cm-editor \.cm-dropCursor$/);
  assert.ok(decl, 'expected a `.cm-editor .cm-dropCursor` rule in obsidian.css');
  const m = decl.match(/border-left-color:\s*([^;]+)/);
  assert.ok(m, 'the rule must set border-left-color');
  assert.match(m[1].trim(), /^var\(--/, `caret colour must come from a palette variable, got "${m[1].trim()}"`);
  // the native caret is hidden by drawSelection, but keep the fallback honest
  assert.match(css, /\.cm-editor \.cm-content[^{]*\{[^}]*caret-color:\s*var\(--/, 'native caret fallback should follow the palette');
});

test("CodeMirror's own Find & Replace panel is themed from the palette", () => {
  const panel = lastRule(/^\.cm-panels$/);
  assert.ok(panel, 'expected a `.cm-panels` rule in obsidian.css');
  assert.match(panel, /background:\s*var\(--/, `.cm-panels background must come from a palette variable, got "${panel}"`);
  const field = lastRule(/^\.cm-panels \.cm-textfield$/);
  assert.ok(field, 'expected a `.cm-panels .cm-textfield` rule in obsidian.css');
  assert.match(field, /background:\s*var\(--/, 'panel text field background must come from a palette variable');
  assert.match(field, /color:\s*var\(--/, 'panel text field colour must come from a palette variable');
});
