/** Note filename without its Markdown extension; preserve the author's spelling. */
export function humanizeTitle(nameOrPath: string): string {
  return (nameOrPath.split('/').pop() ?? nameOrPath).replace(/\.(md|markdown)$/i, '');
}

/** Frontmatter `title` value, if the note defines one. */
export function frontmatterTitle(content: string): string | null {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!fm) return null;
  const m = fm[1].match(/^title[ \t]*:[ \t]*(.*?)[ \t]*$/m);
  if (!m) return null;
  let v = m[1];
  const q = v.match(/^(["'])(.*)\1(?:[ \t]+#.*)?$/);
  v = q ? q[2] : v.replace(/[ \t]+#.*$/, '');
  v = v.trim();
  return v || null;
}

/** Title shown for a note: frontmatter `title`, else the original filename. */
export function displayTitle(path: string, content: string): string {
  return frontmatterTitle(content) ?? humanizeTitle(path);
}
