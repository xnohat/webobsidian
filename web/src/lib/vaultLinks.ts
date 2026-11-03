/** Portable subset of effective vault preferences used when creating content. */
export interface LinkPreferences {
  newFileLocation: 'root' | 'current' | 'folder';
  newFileFolderPath: string;
  useMarkdownLinks: boolean;
  newLinkFormat: 'shortest' | 'relative' | 'absolute';
}

function safePath(value: string, directory = false): string {
  if (/[\\\x00-\x1f]/.test(value) || /^[a-z]:/i.test(value) || value.startsWith('//')) throw new Error('Invalid vault path');
  const parts = value.replace(/^\//, '').split('/').filter(p => p && p !== '.');
  if (parts.includes('..')) throw new Error('Path must stay inside the vault');
  const result = parts.join('/');
  if (!directory && !result) throw new Error('A target path is required');
  return result;
}
const parent = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

export function resolveNewNoteDirectory({ sourcePath, explicitDirectory, preferences }: {
  sourcePath?: string | null; explicitDirectory?: string; preferences: LinkPreferences;
}): string {
  if (explicitDirectory !== undefined) return safePath(explicitDirectory, true);
  if (preferences.newFileLocation === 'folder') return safePath(preferences.newFileFolderPath, true);
  return preferences.newFileLocation === 'current' && sourcePath && !sourcePath.startsWith('__') ? parent(safePath(sourcePath)) : '';
}

function relativePath(source: string, target: string): string {
  const a = parent(source).split('/').filter(Boolean), b = target.split('/');
  while (a.length && b.length && a[0] === b[0]) { a.shift(); b.shift(); }
  return [...a.map(() => '..'), ...b].join('/');
}
function resolveRelative(source: string, target: string): string {
  const parts = parent(source).split('/').filter(Boolean);
  for (const p of target.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
  return parts.join('/');
}
const encodePath = (path: string) => path.split('/').map(p => encodeURIComponent(p).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');

export function formatInternalLink({ sourcePath = '', targetPath, label, embed = false, preferences, knownPaths = [] }: {
  sourcePath?: string | null; targetPath: string; label?: string; embed?: boolean; preferences: LinkPreferences; knownPaths?: string[];
}): string {
  const target = safePath(targetPath), source = sourcePath ? safePath(sourcePath) : '';
  // Wiki paths preserve percent sequences literally. Delimiter characters need
  // a Markdown URL so literal names cannot collide with encoded wiki spelling.
  const markdown = preferences.useMarkdownLinks || /[#|\[\]]/.test(target);
  let linkPath: string;
  if (preferences.newLinkFormat === 'relative') linkPath = relativePath(source, target);
  else if (preferences.newLinkFormat === 'absolute') linkPath = '/' + target;
  else {
    const all = [...new Set([...knownPaths, target])];
    const key = (value: string) => (markdown ? value : value.replace(/\.(md|markdown)$/i, '')).toLowerCase();
    const parts = target.split('/');
    linkPath = target;
    let found = false;
    for (let n = 1; n <= parts.length; n++) {
      const candidate = parts.slice(-n).join('/');
      const nearby = resolveRelative(source, candidate);
      const local = all.find(path => key(path) === key(nearby));
      if (local) {
        if (local === target) { linkPath = candidate; found = true; break; }
        continue;
      }
      const matches = all.filter(p => key(p) === key(candidate) || key(p).endsWith('/' + key(candidate)));
      if (matches.length === 1 && matches[0] === target) { linkPath = candidate; found = true; break; }
    }
    if (!found) linkPath = relativePath(source, target);
  }
  if (!markdown) {
    linkPath = linkPath.replace(/\.(md|markdown)$/i, '');
    return `${embed ? '!' : ''}[[${linkPath}${label ? '|' + label.replace(/[\[\]|\r\n]/g, ' ') : ''}]]`;
  }
  const text = label ?? (embed ? '' : target.split('/').pop()!.replace(/\.(md|markdown)$/i, ''));
  return `${embed ? '!' : ''}[${text.replace(/\\/g, '\\\\').replace(/([\[\]])/g, '\\$1')}](${encodePath(linkPath)})`;
}

/** Obsidian 1.14.5 metadataCache: literal case-insensitive prefix or /regex/. */
export function isUserIgnored(path: string, filters: readonly string[] | null | undefined): boolean {
  return (filters ?? []).some(raw => {
    const filter = raw.trim();
    if (!filter) return false;
    if (filter.length > 2 && filter.startsWith('/') && filter.endsWith('/')) {
      try { return new RegExp(filter.slice(1, -1), 'i').test(path); } catch { return false; }
    }
    return path.toLowerCase().startsWith(filter.toLowerCase());
  });
}
