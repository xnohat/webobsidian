import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { THEME_CLASS, THEME_SELECTOR, themedPopupHost, themedRoot } from '../src/lib/theme';

/**
 * The palette variables (`--text-normal`, `--background-primary`, …) are declared on the
 * `.theme-*` wrapper, so a floating popup is themed only while it lives *inside* that
 * subtree. A popup appended to `<body>` — which is where a lookup that only matches
 * `.theme-light, .theme-dark` ends up on the four Catppuccin themes — resolves every `var()`
 * to nothing and renders black text on a transparent background.
 *
 * Reported bug (#49): typing `[[` on Catppuccin Mocha showed the suggester's titles in black.
 * These tests fail if the helper is bypassed or the two-class shortcut comes back.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url));

const sourceFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => ({ rel: f, text: readFileSync(`${SRC}/${f}`, 'utf8') }));

test('THEME_SELECTOR matches every theme in THEME_CLASS', () => {
  for (const cls of Object.values(THEME_CLASS)) {
    assert.ok(
      THEME_SELECTOR.split(',').map((s) => s.trim()).includes(`.${cls}`),
      `THEME_SELECTOR must include .${cls}, got "${THEME_SELECTOR}"`,
    );
  }
});

test('themed root is never looked up with the `.theme-light, .theme-dark` shortcut', () => {
  for (const { rel, text } of sourceFiles) {
    const hits = [...text.matchAll(/querySelector(?:<[^>]*>)?\(\s*['"`]\.theme-light\s*,\s*\.theme-dark['"`]/g)];
    assert.equal(
      hits.length,
      0,
      `${rel} looks the themed root up with the two-class shortcut — use themedRoot()/` +
        'themedPopupHost() (or THEME_SELECTOR), which cover the Catppuccin themes too',
    );
  }
});

test('popups opened over the editor mount inside the themed root', () => {
  const mountSites = ['lib/suggest.ts', 'lib/livePreview.ts', 'lib/plugins/obsidianApi.ts'];
  for (const rel of mountSites) {
    const text = readFileSync(`${SRC}/${rel}`, 'utf8');
    assert.match(text, /themedPopupHost\(\)\.appendChild\(/, `${rel} should mount via themedPopupHost()`);
    assert.doesNotMatch(
      text,
      /document\.body\.appendChild\(/,
      `${rel} must not append a themed popup to <body>`,
    );
  }
});

test('themedRoot finds the wrapper for every theme class, and themedPopupHost falls back to <body>', () => {
  const wrapper = { tag: 'wrapper' };
  const body = { tag: 'body' };
  const docWith = { querySelector: (sel: string) => (sel === THEME_SELECTOR ? wrapper : null), body };

  assert.equal(themedRoot(docWith as unknown as Document), wrapper);
  assert.equal(themedPopupHost(docWith as unknown as Document), wrapper, 'mounts on the wrapper when it exists');

  const earlyDoc = { querySelector: () => null, body };
  assert.equal(themedRoot(earlyDoc as unknown as Document), null);
  assert.equal(themedPopupHost(earlyDoc as unknown as Document), body, 'falls back to <body> before the app renders');
});
