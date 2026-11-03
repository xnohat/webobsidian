import { themedRoot } from './theme';

/**
 * Theme-aware colour lookup for canvas/WebGL surfaces (the Graph view), where widget
 * colours are painted imperatively and the app's normal CSS cascade does not apply.
 *
 * Why this exists — three traps a canvas component hits that DOM components never do:
 *
 *  1. Palette variables are aliases: `--text-normal: var(--color-base-100)`. Reading
 *     `getComputedStyle(...).getPropertyValue('--text-normal')` on some engines returns
 *     the literal "var(--color-base-100)" string, which a colour parser then throws on.
 *  2. Even a "resolved" value can be unparsable by a strict parser: every theme defines
 *     its accent in HSL, and Catppuccin uses `hsl(calc(258 - 5), calc(...))` — PIXI's
 *     colour parser rejects both. So we round-trip the value through a real element and
 *     let the browser normalise it to `rgb(…)`.
 *  3. The themed root must be found by *all* theme classes, not just
 *     `.theme-light, .theme-dark` — the four Catppuccin themes used to be missed, and the
 *     lookup fell through to `body`, which cannot see the palette vars, so every stated
 *     colour silently became the hardcoded fallback.
 *
 * `resolveColorValue` is pure (string in → string|null out) and unit-tested without a DOM;
 * `resolveThemeColor` is the DOM glue that plugs in real computed-style and validation.
 */

const VAR_PATTERN = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]*?)\s*)?\)$/;

/** Follow a `var(--name, fallback)` / alias chain until a concrete value is reached. */
export function resolveVarChain(
  value: string | null | undefined,
  read: (name: string) => string,
  depth = 0,
): string {
  if (depth > 8) return '';
  const raw = (value ?? '').trim();
  const m = VAR_PATTERN.exec(raw);
  if (!m) return raw;
  const ref = m[1];
  const fallback = m[2];
  const resolved = resolveVarChain(read(ref), read, depth + 1);
  if (resolved) return resolved;
  return fallback !== undefined ? resolveVarChain(fallback, read, depth + 1) : '';
}

export type ColorReader = (name: string) => string;
export type ColorValidator = (value: string) => boolean;

/**
 * Pure: given a way to read custom properties and a validator, return the paintable
 * colour for `name` or null. (The validator is what keeps a bogus "colour" like `12px`
 * from reaching the canvas.)
 */
export function resolveColorValue(name: string, read: ColorReader, isColor: ColorValidator): string | null {
  const value = resolveVarChain(read(name), read);
  if (!value || !isColor(value)) return null;
  return value;
}

/**
 * Resolve a CSS palette variable to a colour string the canvas renderer can always parse,
 * by asking the browser to paint it: the probe is a real element in the themed subtree, so
 * aliases, HSL and calc() all come back as `rgb(…)`/`rgba(…)`. Returns null when the
 * variable cannot be resolved to a colour (the caller keeps its numeric fallback).
 */
export function resolveThemeColor(name: string, root?: HTMLElement | null): string | null {
  const el = root ?? themedRoot();
  if (!el || typeof getComputedStyle !== 'function') return null;
  const cs = getComputedStyle(el);
  const read: ColorReader = (n) => cs.getPropertyValue(n);
  const isColor: ColorValidator = (v) =>
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function' ? CSS.supports('color', v) : true;
  const value = resolveColorValue(name, read, isColor);
  if (!value) return null;

  const probe = document.createElement('span');
  probe.style.color = value;
  el.appendChild(probe);
  const painted = getComputedStyle(probe).color;
  probe.remove();
  return painted || null;
}