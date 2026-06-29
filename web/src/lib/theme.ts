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
