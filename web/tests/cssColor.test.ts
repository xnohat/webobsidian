import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveColorValue } from '../src/lib/cssColor';
import { THEME_SELECTOR } from '../src/lib/theme';
import { THEME_CLASS } from '../src/lib/theme';

/**
 * resolveColorValue: pure colour/var resolution (no DOM), so it is unit-testable.
 * `read(name)` returns the raw CSS custom-property value; `isColor(v)` validates a
 * concrete value (the DOM layer plugs in CSS.supports). Returns a paintable colour
 * string or null.
 */
const FALSE = () => false;
const TRUE = () => true;

test('returns the value unchanged when it is already a plain colour', () => {
  const read = () => '#dadada';
  assert.equal(resolveColorValue('--text-normal', read, () => /^#/.test(read('--text-normal'))), '#dadada');
  assert.equal(resolveColorValue('--text-normal', read, TRUE), '#dadada');
});

test('follows a var() alias chain to a concrete colour', () => {
  const vars: Record<string, string> = { '--text-normal': 'var(--color-base-100)', '--color-base-100': '#dadada' };
  const read = (n) => vars[n] ?? '';
  assert.equal(resolveColorValue('--text-normal', read, TRUE), '#dadada');
});

test('uses the fallback inside var() when the referenced variable is missing', () => {
  // the queried property is an alias whose target does not exist anywhere
  const vars: Record<string, string> = { '--text-normal': 'var(--nope, #999999)' };
  const read = (n) => vars[n] ?? '';
  assert.equal(resolveColorValue('--text-normal', read, TRUE), '#999999');
});

test('resolves a var() inside a fallback', () => {
  const vars: Record<string, string> = {
    '--text-accent-hover': 'var(--x, var(--accent-2))',
    '--accent-2': '#a0a0a0',
  };
  const read = (n) => vars[n] ?? '';
  assert.equal(resolveColorValue('--text-accent-hover', read, TRUE), '#a0a0a0');
});

test('returns null (not a string) when nothing resolves', () => {
  assert.equal(resolveColorValue('--missing', () => '', TRUE), null);
  const selfCycle = 'var(--a)';
  const read = () => selfCycle;
  assert.equal(resolveColorValue('--a', read, TRUE), null); // cycle-guarded, no infinite loop
});

test('returns null when the resolved value is not a valid colour', () => {
  // a variable that is defined but its value is not a colour (e.g. a length or empty)
  const read = () => '12px';
  assert.equal(resolveColorValue('--weird', read, FALSE), null);
});

test('trims surrounding whitespace returned by computed style', () => {
  assert.equal(resolveColorValue('--text-normal', () => '  #dadada  ', TRUE), '#dadada');
});

test('THEME_SELECTOR covers every theme class, so a dark/light/catppuccin root is always found', () => {
  const classes = Object.values(THEME_CLASS);
  // every theme has a CSS class that appears verbatim in the selector
  for (const c of classes) assert.ok(THEME_SELECTOR.includes('.' + c), `selector missing .${c}`);
  // and it is anchored to full class tokens, never a loose '.theme-' prefix that could
  // match unrelated classes like "theme-footer"
  const tokens = THEME_SELECTOR.split(',').map((s) => s.trim());
  assert.ok(tokens.every((t) => t.startsWith('.') && /^\.[\w-]+$/.test(t)), `bad token in ${THEME_SELECTOR}`);
  // the selector matches exactly the theme classes and nothing extra
  assert.equal(tokens.length, classes.length);
});