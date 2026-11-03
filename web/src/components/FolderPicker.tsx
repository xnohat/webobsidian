import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { type TreeNode } from '../lib/api';
import { pruneDescendants } from '../lib/tree';
import { displayChildren } from '../lib/attachments';

/** Collect every folder path in the vault, in tree order. */
function collectFolders(node: TreeNode | null, showAttachments: boolean): string[] {
  if (!node) return [];
  const out: string[] = [];
  const walk = (n: TreeNode) => {
    for (const c of displayChildren(n.children ?? [], showAttachments)) {
      if (c.type === 'folder') {
        out.push(c.path);
        walk(c);
      }
    }
  };
  walk(node);
  return out;
}

/**
 * Obsidian's "Move file to…" folder suggester: type to filter folders, ↑↓ to
 * navigate, ↵ to move into the highlighted folder, shift+↵ to create the typed
 * folder and move there, esc to dismiss. Driven by store.movePath.
 */
export default function FolderPicker() {
  const languageRevision = useLanguage().revision;

  const movePath = useStore((s) => s.movePath);
  const setMovePath = useStore((s) => s.setMovePath);
  const tree = useStore((s) => s.tree);
  const showAttachmentFolders = useStore((s) => s.showAttachmentFolders);
  const loadTree = useStore((s) => s.loadTree);
  const renamePath = useStore((s) => s.renamePath);
  const notify = useStore((s) => s.notify);

  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // movePath is a single path (string) or several (array, bulk move).
  const froms = useMemo(
    () => (movePath == null ? [] : pruneDescendants(Array.isArray(movePath) ? movePath : [movePath])),
    [movePath, languageRevision],
  );
  const single = froms.length === 1 ? froms[0] : null;
  const currentDir = single && single.includes('/') ? single.slice(0, single.lastIndexOf('/')) : '';

  // Root + every folder, minus targets that would move a folder into itself or a
  // descendant of any source (and, for a single item, its own folder — a no-op).
  const folders = useMemo(() => {
    const all = ['', ...collectFolders(tree, showAttachmentFolders)];
    return all.filter((f) => {
      if (single !== null && f === currentDir) return false;
      if (froms.some((src) => f === src || f.startsWith(`${src}/`))) return false;
      return true;
    });
  }, [tree, showAttachmentFolders, froms, single, currentDir, languageRevision]);

  const lc = q.trim().toLowerCase();
  const matches = useMemo(
    () => folders.filter((f) => !lc || (f || '/').toLowerCase().includes(lc)),
    [folders, lc, languageRevision],
  );

  // shift+↵ creates a new folder — offer it when the typed name isn't an exact match.
  const typed = q.trim().replace(/^\/+|\/+$/g, '');
  const canCreate = typed.length > 0 && !folders.some((f) => f.toLowerCase() === typed.toLowerCase());

  useEffect(() => {
    setQ('');
    setSel(0);
  }, [movePath]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!movePath || !froms.length) return null;

  const move = async (folder: string) => {
    const targetDir = folder.replace(/\/+$/, '');
    setMovePath(null);
    let moved = 0;
    for (const src of froms) {
      const b = src.split('/').pop()!;
      const to = targetDir ? `${targetDir}/${b}` : b;
      if (to === src) continue; // already in the chosen folder
      if (targetDir === src || targetDir.startsWith(`${src}/`)) continue; // into self/descendant
      try {
        await renamePath(src, to);
        moved++;
      } catch (e: any) {
        notify(e?.message ?? uiText("webobsidian.move-failed-795434"));
      }
    }
    await loadTree();
    useStore.getState().setSelected([]);
    if (moved) {
      const dest = folder || 'vault root';
      notify(moved > 1 ? uiText("webobsidian.moved-value0-items-to-value1-08976d", {value0: moved, value1: dest}) : uiText("webobsidian.moved-to-value0-e22c9c", {value0: dest}));
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setMovePath(null);
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey && canCreate) move(typed);
      else if (matches[sel] !== undefined) move(matches[sel]);
      else if (canCreate) move(typed);
    }
  };

  return (
    <div className="modal-bg" onClick={() => setMovePath(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <input
          className="palette-input"
          placeholder={froms.length > 1 ? uiText("webobsidian.move-value0-items-to-which-folder-2cf3f0", {value0: froms.length}) : uiText("plugins.file-explorer.prompt-type-folder")}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="palette-list" ref={listRef}>
          {matches.map((f, i) => (
            <div
              key={f || '/'}
              className={`palette-item ${i === sel ? 'sel' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => move(f)}
            >
              <span>{f || '/'}</span>
            </div>
          ))}
          {canCreate && (
            <div
              className="palette-item"
              onMouseEnter={() => setSel(-1)}
              onClick={() => move(typed)}
            >
              <span>{uiText("webobsidian.create-15f8f8")}{typed}”</span>
              <span className="kbd">⇧↵</span>
            </div>
          )}
          {matches.length === 0 && !canCreate && <div className="palette-item">{uiText("webobsidian.no-folders-9415d8")}</div>}
        </div>
        <div className="palette-footer">
          <span><span className="kbd">↑↓</span> {uiText("webobsidian.to-navigate-130c10")}</span>
          <span><span className="kbd">↵</span> {uiText("plugins.file-explorer.instruction-move")}</span>
          <span><span className="kbd">⇧↵</span> {uiText("webobsidian.to-create-1c4810")}</span>
          <span><span className="kbd">{uiText("webobsidian.esc-abb761")}</span> {uiText("webobsidian.to-dismiss-df901e")}</span>
        </div>
      </div>
    </div>
  );
}
