/** Maps a persisted ui.theme value to its wrapper CSS class (see styles/obsidian.css). */
export const THEME_CLASS: Record<string, string> = {
  'obsidian-dark': 'theme-dark',
  'obsidian-light': 'theme-light',
  'catppuccin-mocha': 'theme-ctp-mocha',
  'catppuccin-macchiato': 'theme-ctp-macchiato',
  'catppuccin-frappe': 'theme-ctp-frappe',
  'catppuccin-latte': 'theme-ctp-latte',
};

export const themeClass = (t?: string): string => THEME_CLASS[t ?? ''] ?? 'theme-light';

/**
 * CSS selector for the element carrying the active theme class. Built from THEME_CLASS
 * (the single source of truth), so a new theme added there is picked up here automatically.
 * The canvas graph uses this to resolve its colours — see lib/cssColor.ts.
 */
export const THEME_SELECTOR = Object.values(THEME_CLASS)
  .map((c) => '.' + c)
  .join(', ');

/**
 * The element carrying the active theme class (`theme-light`/`theme-dark`/`theme-ctp-*`),
 * or null before the app has rendered. This is the only element the palette variables are
 * declared on, so it is the only subtree where `var(--text-normal)` & co. resolve.
 */
export function themedRoot(doc: Document = document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(THEME_SELECTOR);
}

/**
 * Where to mount a floating popup (suggester, dropdown, menu) that a user can open over the
 * editor. It must be *inside* the themed root: a popup appended to `<body>` sits outside the
 * element the palette variables are declared on, so every `var()` in its CSS is invalid at
 * computed-value time and the popup renders unthemed — black text on the dark themes.
 *
 * Match on all of THEME_CLASS, never on `.theme-light, .theme-dark` alone: the four
 * Catppuccin themes used to be missed by exactly that shortcut, and the lookup fell through
 * to `<body>`. Falls back to `<body>` only when the app has not rendered yet.
 */
export function themedPopupHost(doc: Document = document): HTMLElement {
  return themedRoot(doc) ?? doc.body;
}
