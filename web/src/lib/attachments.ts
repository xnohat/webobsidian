import {defaultCodeFileViewer,type CodeFileViewerSettings} from './codeFiles';
import type { TreeNode } from './api';
import { isSupportedVaultFile } from './media';

/** Existing attachment folders remain hideable after changing Obsidian's setting. */
export const ATTACHMENT_DIR_NAME = 'attachments';

const NOTE_RE = /\.(md|markdown|canvas)$/i;

/** True if the folder holds a note or canvas anywhere beneath it. */
function containsNotes(node: TreeNode): boolean {
  for (const c of node.children ?? []) {
    if (c.type === 'file' ? NOTE_RE.test(c.name) : containsNotes(c)) return true;
  }
  return false;
}

/**
 * The server marks folders according to the active vault's Obsidian setting.
 * Never hide a folder containing notes or canvases, including in nested folders.
 */
export function isHiddenAttachmentFolder(node: TreeNode): boolean {
  return (
    node.type === 'folder' &&
    (node.attachmentFolder || node.name.trim().toLowerCase() === ATTACHMENT_DIR_NAME) &&
    !containsNotes(node)
  );
}

/** Children to display: attachment folders are dropped unless the user chose to show them. */
export function displayChildren(children: TreeNode[], showAttachmentFolders: boolean, showUnsupportedFiles = true, codeSettings:CodeFileViewerSettings=defaultCodeFileViewer): TreeNode[] {
  return children.filter(c => (showAttachmentFolders || !isHiddenAttachmentFolder(c))
    && (showUnsupportedFiles || c.type === 'folder' || isSupportedVaultFile(c.path,codeSettings)));
}

/** True if `path` lies inside a folder that is currently hidden by the option. */
export function isInsideHiddenAttachmentFolder(root: TreeNode | null, path: string): boolean {
  if (!root) return false;
  let node: TreeNode | undefined = root;
  const segs = path.split('/');
  segs.pop(); // ancestors only
  for (const seg of segs) {
    node = node?.children?.find((c) => c.type === 'folder' && c.name === seg);
    if (!node) return false;
    if (isHiddenAttachmentFolder(node)) return true;
  }
  return false;
}
