import { useStore } from '../lib/store';
import { findNode } from '../lib/tree';
import { api, type TreeNode } from '../lib/api';
import Icon from './Icon';

function entryIcon(n: TreeNode): string {
  if (n.type === 'folder') return 'folder';
  const ext = n.ext ?? '';
  if (/\.(md|markdown)$/i.test(ext)) return 'file-text';
  if (/\.(png|jpe?g|gif|svg|webp)$/i.test(ext)) return 'image';
  if (ext === '.pdf') return 'file-pdf';
  return 'paperclip';
}

/**
 * Folder content view — shown when the active path is a folder (e.g. deep-link
 * /note/<folder>). Lists the notes/sub-folders inside instead of opening the
 * folder as an empty note.
 */
export default function FolderView({ path }: { path: string }) {
  const tree = useStore((s) => s.tree);
  const openFile = useStore((s) => s.openFile);
  const newNote = useStore((s) => s.newNote);

  const node = findNode(tree, path);
  const children = node?.children ?? [];
  const folders = children.filter((c) => c.type === 'folder');
  const files = children.filter((c) => c.type === 'file');
  const ordered = [...folders, ...files].sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1,
  );
  const label = (n: TreeNode) => (n.type === 'file' ? n.name.replace(/\.(md|markdown)$/, '') : n.name);

  return (
    <div className="markdown-preview">
      <div className="preview-inner folder-view">
        <div className="folder-view-head">
          <h1><Icon name="folder" size={26} /> {node?.name ?? path}</h1>
          <button className="tool-btn" title="New note in this folder" onClick={() => newNote(path)}>
            <Icon name="plus" size={18} />
          </button>
        </div>
        <div className="folder-view-meta">
          {folders.length} folder{folders.length === 1 ? '' : 's'} · {files.length} file{files.length === 1 ? '' : 's'}
        </div>
        {ordered.length === 0 ? (
          <p className="folder-empty">This folder is empty.</p>
        ) : (
          <div className="folder-list">
            {ordered.map((c) => (
              <div
                key={c.path}
                className="folder-entry"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/wo-path', c.path);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => openFile(c.path)}
                title={c.path}
              >
                {c.type === 'file' && /\.(png|jpe?g|gif|svg|webp)$/i.test(c.ext ?? '') ? (
                  <img className="folder-thumb" src={api.rawUrl(c.path)} alt="" loading="lazy" />
                ) : (
                  <Icon name={entryIcon(c)} size={16} />
                )}
                <span className="folder-entry-name">{label(c)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
