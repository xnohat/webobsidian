const READABLE_ROOTS = ['docs/'] as const;
const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const;

export function normalizeRepoPath(input: string): string {
  const path = input.trim().replaceAll('\\', '/');
  if (!path || path.startsWith('/') || path.includes('\0')) {
    throw new Error('Invalid repository path');
  }

  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Invalid repository path');
  }

  return segments.join('/');
}

export function assertReadableMarkdownPath(input: string): string {
  const path = normalizeRepoPath(input);
  const lower = path.toLowerCase();
  if (!READABLE_ROOTS.some((root) => lower.startsWith(root))) {
    throw new Error('Path is outside the readable document roots');
  }
  if (!MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    throw new Error('Only Markdown documents are readable in contribution mode');
  }
  return path;
}

export const assertWritableMarkdownPath = assertReadableMarkdownPath;

export function isReadableTreePath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === 'docs' || READABLE_ROOTS.some((root) => lower.startsWith(root));
}

export function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension));
}
