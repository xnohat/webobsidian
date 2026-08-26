import type { TreeNode } from './api';

/** Find a node by its vault-relative path anywhere in the tree (null if absent). */
export function findNode(root: TreeNode | null, path: string): TreeNode | null {
  if (!root || !path) return null;
  const stack: TreeNode[] = [...(root.children ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.path === path) return n;
    if (n.children) stack.push(...n.children);
  }
  return null;
}

/** Resolve an Obsidian attachment target relative to the active note. */
export function resolveAssetPath(
  root: TreeNode | null,
  target: string,
  activePath: string | null,
): string | null {
  if (!root || !target) return null;
  const cleanTarget = target.split('#')[0].replaceAll('\\', '/').replace(/^\.\//, '');
  const noteDir = activePath?.includes('/') ? activePath.slice(0, activePath.lastIndexOf('/')) : '';
  const basename = cleanTarget.slice(cleanTarget.lastIndexOf('/') + 1);
  const candidates = [
    cleanTarget,
    noteDir && `${noteDir}/${cleanTarget}`,
    noteDir && `${noteDir}/attachments/${basename}`,
  ].filter((path): path is string => Boolean(path));

  for (const path of candidates) {
    const node = findNode(root, path);
    if (node?.type === 'file') return node.path;
  }

  const matches: string[] = [];
  const stack = [...(root.children ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === 'file' && node.name === basename) matches.push(node.path);
    if (node.children) stack.push(...node.children);
  }
  return matches.length === 1 ? matches[0] : null;
}

/** True if the path resolves to a folder node in the tree. */
export function isFolderPath(root: TreeNode | null, path: string | null): boolean {
  return !!path && findNode(root, path)?.type === 'folder';
}

/**
 * Drop any path that is nested under another path in the set. Used before bulk
 * move/delete so a folder and one of its own children aren't both operated on
 * (the child would already be gone with the parent → a spurious error).
 */
export function pruneDescendants(paths: string[]): string[] {
  const sorted = [...new Set(paths)].sort((a, b) => a.length - b.length);
  const keep: string[] = [];
  for (const p of sorted) if (!keep.some((k) => p === k || p.startsWith(`${k}/`))) keep.push(p);
  return keep;
}

/** Add a browser-local Markdown draft beneath an existing folder. */
export function addDraftNoteToTree(root: TreeNode, path: string): TreeNode {
  if (findNode(root, path)) return root;
  const slash = path.lastIndexOf('/');
  if (slash < 0) return root;
  const parentPath = path.slice(0, slash);
  const name = path.slice(slash + 1);
  if (!name || !/\.(md|markdown)$/i.test(name)) return root;

  let added = false;
  const visit = (node: TreeNode): TreeNode => {
    if (node.path === parentPath && node.type === 'folder') {
      added = true;
      return {
        ...node,
        children: [
          ...(node.children ?? []),
          { name, path, type: 'file', ext: name.slice(name.lastIndexOf('.') + 1) },
        ],
      };
    }
    if (!node.children) return node;
    const children = node.children.map(visit);
    return children.some((child, index) => child !== node.children?.[index])
      ? { ...node, children }
      : node;
  };

  const next = visit(root);
  return added ? next : root;
}

/**
 * Resolve an Obsidian wikilink target (e.g. "入学准备" or "Guide/Start") to a
 * vault-relative file path using only the in-memory tree.  Used in contribution
 * mode where the /api/resolve endpoint is not available.
 *
 * Resolution order mirrors Obsidian's shortest-path algorithm:
 *  1. Exact path match (target contains '/')
 *  2. Basename match anywhere in the tree — unambiguous only when exactly one
 *     file has that name (with or without .md extension).
 */
export function resolveWikilinkPath(
  root: TreeNode | null,
  target: string,
): string | null {
  if (!root || !target) return null;

  // Strip heading/block anchor and normalise separators.
  const clean = target.split('#')[0].replaceAll('\\', '/').trim();
  if (!clean) return null;

  // 1. Exact path match (already includes directory components).
  if (clean.includes('/')) {
    const rooted = root.path && !clean.startsWith(`${root.path}/`)
      ? `${root.path}/${clean}`
      : clean;
    const exactCandidates = [clean, `${clean}.md`, rooted, `${rooted}.md`];
    for (const path of new Set(exactCandidates)) {
      const exact = findNode(root, path);
      if (exact?.type === 'file') return exact.path;
    }
  }

  // 2. Basename search — walk the whole tree.
  const basename = clean.slice(clean.lastIndexOf('/') + 1);
  const candidates: string[] = [];
  const stack: TreeNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === 'file') {
      const nameNoExt = node.name.replace(/\.(md|markdown)$/i, '');
      if (node.name === basename || nameNoExt === basename) {
        candidates.push(node.path);
      }
    }
    if (node.children) stack.push(...node.children);
  }
  // Return unambiguous match; if multiple files share the same basename,
  // we cannot auto-resolve (mirrors Obsidian behaviour).
  return candidates.length === 1 ? candidates[0] : null;
}
