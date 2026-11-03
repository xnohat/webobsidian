import {catalog} from './catalog';

export function parseLanguagePack(text: string) {
  const translations: Record<string, string> = Object.create(null);
  const warnings: string[] = [];
  let unknown = 0;
  let key = '';
  const seen = new Set<string>();
  for (const [index, line] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!line.trim() || /^\s*[#;]/.test(line)) continue;
    const header = /^\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      key = header[1];
      if (Object.hasOwn(catalog, key) && seen.has(key)) throw Error('Duplicate key at line ' + (index + 1));
      seen.add(key);
      if (!Object.hasOwn(catalog, key)) unknown++;
      continue;
    }
    const field = /^(original|translation)=(.*)$/.exec(line);
    if (!key || !field) throw Error('Invalid language file at line ' + (index + 1));
    if (field[1] !== 'translation' || !Object.hasOwn(catalog, key) || !field[2].trim()) continue;
    const value = field[2].replace(/\\n/g, '\n');
    const parameters = (s: string) => [...s.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(m => m[1]).sort().join(',');
    if (parameters(value) !== parameters(catalog[key])) {
      warnings.push('Incompatible parameters at line ' + (index + 1));
      continue;
    }
    translations[key] = value;
  }
  return {translations, warnings, unknown};
}

export function exportLanguageTemplate(): string {
  return Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) =>
    '[' + key + ']\noriginal=' + value.replace(/\n/g, '\\n') + '\ntranslation=\n'
  ).join('\n');
}
