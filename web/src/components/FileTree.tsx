import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useRef, useState } from 'react';
import { useStore, type TreeSort } from '../lib/store';
import { api, type TreeNode } from '../lib/api';
import { findNode, pruneDescendants } from '../lib/tree';
import { pathToUrl } from '../lib/urlsync';
import Icon from './Icon';
import { confirmDialog } from '../lib/confirm';
import { displayChildren } from '../lib/attachments';
import { useVaultPreferences } from '../lib/vaultPreferences';

/** Inline rename box shown in place of a tree row's name (Obsidian-style). */
function RenameInput({ node, onDone }: { node: TreeNode; onDone: () => void }) {
  const languageRevision = useLanguage().revision;

  const loadTree = useStore((s) => s.loadTree);
  const renamePath = useStore((s) => s.renamePath);
  const notify = useStore((s) => s.notify);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Select the name but not the extension, like Obsidian.
    const dot = node.type === 'file' ? node.name.lastIndexOf('.') : -1;
    el.setSelectionRange(0, dot > 0 ? dot : node.name.length);
  }, [node.name, node.type]);

  const finish = (commit: boolean) => async () => {
    if (done.current) return;
    done.current = true;
    const name = (ref.current?.value ?? '').trim();
    onDone();
    const st = useStore.getState();
    const isNew = st.newNotePath === node.path;
    if (isNew) st.setNewNotePath(null);
    let finalPath = node.path;
    const dir = parentDir(node.path);
    const to = dir ? `${dir}/${name}` : name;
    if (commit && name && name !== node.name && to !== node.path) {
      try {
        await renamePath(node.path, to);
        finalPath = to;
      } catch (e: any) {
        notify(e?.message ?? uiText("webobsidian.rename-failed-85aa47"));
      }
    }
    await loadTree();
    if (isNew) {
      // Keep the freshly named note selected, open and scrolled into view after re-sorting.
      const s2 = useStore.getState();
      await s2.openCreatedFile(finalPath);
    }
  };

  return (
    <input
      ref={ref}
      className="tree-rename"
      defaultValue={node.name}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); void finish(true)(); }
        else if (e.key === 'Escape') { e.preventDefault(); void finish(false)(); }
      }}
      onBlur={finish(true)}
    />
  );
}

/** Number of files and folders nested anywhere under a folder node. */
function countDescendants(node: TreeNode): number {
  let n = 0;
  for (const c of node.children ?? []) n += 1 + countDescendants(c);
  return n;
}

function parentDir(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

/** Parse the dragged path list from a drag event (multi-select aware). */
/**
 * Paths being dragged. Browsers hide dataTransfer contents during `dragover` (only `drop` can read
 * them), but the drop-zone indicator has to know what is being dragged while hovering, so the
 * drag source records it here too.
 */
let activeDrag: string[] = [];

/** Where a drop will land relative to the row under the pointer. */
type DropZone = 'before' | 'inside' | 'after';
const dropClass = (z: DropZone | null) =>
  z === 'inside' ? 'drop-target' : z === 'before' ? 'drop-before' : z === 'after' ? 'drop-after' : '';

function readDragPaths(e: React.DragEvent): string[] {
  const multi = e.dataTransfer.getData('text/wo-paths');
  if (multi) {
    try {
      const arr = JSON.parse(multi);
      if (Array.isArray(arr)) return arr.filter((p): p is string => typeof p === 'string');
    } catch { /* fall through to legacy single */ }
  }
  const single = e.dataTransfer.getData('text/wo-path');
  return single ? [single] : [];
}

/** Move every path into targetDir ('' = vault root). Skips no-ops and self/descendant moves. */
async function moveItemsTo(paths: string[], targetDir: string): Promise<void> {
  const { renamePath, loadTree, setSelected, notify } = useStore.getState();
  let moved = 0;
  for (const from of pruneDescendants(paths)) {
    if (!from) continue;
    const base = from.split('/').pop()!;
    const to = targetDir ? `${targetDir}/${base}` : base;
    if (to === from) continue; // already there
    if (targetDir === from || targetDir.startsWith(`${from}/`)) continue; // into self/descendant
    try {
      await renamePath(from, to);
      moved++;
    } catch (err: any) {
      notify(err?.message ?? uiText("webobsidian.move-failed-795434"));
    }
  }
  setSelected([]);
  await loadTree();
  if (moved > 1) notify(uiText("webobsidian.moved-value0-items-576aa1", {value0: moved}));
}

/** Visible tree rows in display order — used to resolve a Shift-click range. */
function visibleOrder(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.tree-row[data-path]')]
    .map((el) => el.dataset.path!)
    .filter(Boolean);
}

/**
 * Pick a name for `base` inside `targetDir` that doesn't collide with an
 * existing child — appends " copy" / " copy N" before the extension, like Obsidian.
 */
function uniqueChildName(tree: TreeNode | null, targetDir: string, base: string): string {
  const folder = targetDir ? findNode(tree, targetDir) : tree;
  const taken = new Set((folder?.children ?? []).map((c) => c.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  let name = `${stem} copy${ext}`;
  for (let i = 1; taken.has(name.toLowerCase()); i++) name = `${stem} copy ${i}${ext}`;
  return name;
}

function Node({ node, depth }: { node: TreeNode; depth: number }) {
  const languageRevision = useLanguage().revision;

  const expanded = useStore((s) => s.expanded);
  const toggleFolder = useStore((s) => s.toggleFolder);
  const open = expanded.includes(node.path); // persisted across reloads
  const [dropZone, setDropZone] = useState<DropZone | null>(null);
  const activePath = useStore((s) => s.activePath);
  const openFile = useStore((s) => s.openFile);
  const openToSide = useStore((s) => s.openToSide);
  const loadTree = useStore((s) => s.loadTree);
  const renamePath = useStore((s) => s.renamePath);
  const deletePath = useStore((s) => s.deletePath);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const setMovePath = useStore((s) => s.setMovePath);
  const clipboard = useStore((s) => s.clipboard);
  const setClipboard = useStore((s) => s.setClipboard);
  const newNote = useStore((s) => s.newNote);
  const newCanvas = useStore((s) => s.newCanvas);
  const newFolder = useStore((s) => s.newFolder);
  const renamingPath = useStore((s) => s.renamingPath);
  const setRenamingPath = useStore((s) => s.setRenamingPath);
  const toggleBookmark = useStore((s) => s.toggleBookmark);
  const bookmarks = useStore((s) => s.bookmarks);
  const notify = useStore((s) => s.notify);
  const setShareDialog = useStore((s) => s.setShareDialog);
  const shares = useStore((s) => s.shares);
  const treeSort = useStore((s) => s.treeSort);
  const manualOrder = useStore((s) => s.manualOrder);
  const setManualOrderForParent = useStore((s) => s.setManualOrderForParent);
  const tree = useStore((s) => s.tree);
  const isSelected = useStore((s) => s.selected.includes(node.path));
  const setSelected = useStore((s) => s.setSelected);
  const setSelectAnchor = useStore((s) => s.setSelectAnchor);

  const isFolder = node.type === 'folder';
  const editing = renamingPath === node.path;
  const isCut = clipboard?.mode === 'cut' && clipboard.path === node.path;

  // Click selection: plain = single (+open/toggle), Cmd/Ctrl = toggle one,
  // Shift = range from the anchor across the visible rows (like Obsidian/Finder).
  const onRowClick = (e: React.MouseEvent) => {
    if (e.detail > 1) return;
    if (e.metaKey || e.ctrlKey) {
      const cur = useStore.getState().selected;
      setSelected(cur.includes(node.path) ? cur.filter((p) => p !== node.path) : [...cur, node.path]);
      setSelectAnchor(node.path);
      return;
    }
    if (e.shiftKey) {
      e.preventDefault(); // don't text-select across rows
      const order = visibleOrder();
      const anchor = useStore.getState().selectAnchor ?? node.path;
      const a = order.indexOf(anchor);
      const b = order.indexOf(node.path);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        setSelected(order.slice(lo, hi + 1));
      } else {
        setSelected([node.path]);
      }
      return;
    }
    setSelected([node.path]);
    setSelectAnchor(node.path);
    if (isFolder) toggleFolder(node.path);
    else openFile(node.path);
  };

  const doDeleteMany = async () => {
    const paths = pruneDescendants(useStore.getState().selected);
    if (!paths.length) return;
    const {values:deletePreferences}=await api.vaultPreferences();
    const rootNode = useStore.getState().tree;
    const hasFolder = paths.some((p) => findNode(rootNode, p)?.type === 'folder');
    const detail = hasFolder ? uiText('webobsidian.delete-folders') : undefined;
    if (!(await confirmDialog(uiText('webobsidian.confirm-delete-items',{count:paths.length}), { confirmLabel: uiText('dialogue.button-delete'), danger: true, detail }))) return;
    let n = 0;
    for (const p of paths) {
      const r = await deletePath(p,false,deletePreferences.deleteMode).catch(() => null);
      if (r) n++;
    }
    setSelected([]);
    await loadTree();
    notify(uiText("webobsidian.deleted-items", {count: n}));
  };
  const doMoveMany = () => setMovePath(useStore.getState().selected);

  const doRename = () => setRenamingPath(node.path);
  const doDelete = async () => {
    let detail: string | undefined;
    if (node.type === 'folder') {
      // count from the raw tree: the rendered node omits hidden attachment folders
      const n = countDescendants(findNode(useStore.getState().tree, node.path) ?? node);
      detail = n
        ? uiText('webobsidian.delete-folder-contents',{count:n})
        : uiText('webobsidian.delete-empty-folder');
    }
    const {values:preferences}=await api.vaultPreferences();
    if ((!preferences.promptDelete&&preferences.deleteMode!=='permanent'&&node.type==='file')||await confirmDialog(uiText('webobsidian.confirm-delete-file',{name:node.name}), { confirmLabel: uiText('dialogue.button-delete'), danger: true, detail })) {
      const r = await deletePath(node.path,false,preferences.deleteMode);
      await loadTree();
      notify(r.deleted ? uiText("webobsidian.deleted-permanently-ca75d5") : uiText("webobsidian.moved-to-trash-0987dd"));
    }
  };

  const doCopy = async () => {
    const r = await api.read(node.path).catch(() => null);
    if (!r) return;
    const content = typeof r === 'string' ? r : r.content;
    const dot = node.path.lastIndexOf('.');
    const copyPath = dot > 0 ? `${node.path.slice(0, dot)} copy${node.path.slice(dot)}` : `${node.path} copy`;
    await api.write(copyPath, content);
    await loadTree();
    notify(uiText("webobsidian.made-a-copy-7728ff"));
  };
  const doMove = () => setMovePath(node.path);

  const doClipboard = (mode: 'copy' | 'cut') => () => {
    setClipboard({ path: node.path, mode });
    notify(mode === "cut" ? uiText("interface.menu.cut") : uiText("webobsidian.copied-8e3df4"));
  };
  const doPaste = async () => {
    const clip = useStore.getState().clipboard;
    if (!clip) return;
    const targetDir = isFolder ? node.path : parentDir(node.path);
    // Never paste a folder into itself or one of its own descendants.
    if (clip.path === targetDir || targetDir === clip.path || targetDir.startsWith(`${clip.path}/`)) {
      notify(uiText("webobsidian.cannot-paste-into-itself-c7da78"));
      return;
    }
    const base = clip.path.split('/').pop()!;
    const srcDir = parentDir(clip.path);
    if (clip.mode === 'cut') {
      if (targetDir === srcDir) { setClipboard(null); return; } // already here — no-op
      const to = targetDir ? `${targetDir}/${base}` : base;
      try {
        await renamePath(clip.path, to);
        setClipboard(null);
        await loadTree();
        notify(uiText("webobsidian.moved-0fc28d"));
      } catch (e: any) {
        notify(e?.message ?? uiText("webobsidian.paste-failed-18bdc4"));
      }
      return;
    }
    // copy — recursive server-side copy (works for both files and folders).
    const name = uniqueChildName(useStore.getState().tree, targetDir, base);
    const to = targetDir ? `${targetDir}/${name}` : name;
    try {
      await api.copy(clip.path, to);
      await loadTree();
      notify(uiText("webobsidian.pasted-a3a089"));
    } catch (e: any) {
      notify(e?.message ?? uiText("webobsidian.paste-failed-18bdc4"));
    }
  };

  const copyPath = () => {
    navigator.clipboard?.writeText(node.path).catch(() => {});
    notify(uiText("webobsidian.path-copied-12ec0d"));
  };
  const copyUrl = () => {
    navigator.clipboard?.writeText(`${location.origin}${pathToUrl(node.path)}`).catch(() => {});
    notify(uiText("webobsidian.url-copied-73a9be"));
  };

  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sel = useStore.getState().selected;
    // Right-clicking a row that's part of a multi-selection → bulk actions.
    if (sel.length > 1 && sel.includes(node.path)) {
      openContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { get label() {return uiText("webobsidian.move-value0-items-to-72feb2", {value0: sel.length});}, onClick: doMoveMany },
          { label: '', separator: true },
          { get label() {return uiText("webobsidian.delete-value0-items-f93b00", {value0: sel.length});}, danger: true, onClick: doDeleteMany },
        ],
      });
      return;
    }
    // Right-clicking outside the selection collapses it onto this single row.
    if (!sel.includes(node.path)) { setSelected([node.path]); setSelectAnchor(node.path); }
    const items = isFolder
      ? [
          { get label() {return uiText("plugins.file-explorer.menu-opt-new-note");}, onClick: () => newNote(node.path) },
          { get label() {return uiText("plugins.canvas.action-new-canvas");}, onClick: () => newCanvas(node.path) },
          { get label() {return uiText("plugins.file-explorer.menu-opt-new-folder");}, onClick: () => newFolder(node.path) },
          { label: '', separator: true },
          { get label() {return uiText("interface.menu.copy");}, onClick: doClipboard('copy') },
          { get label() {return uiText("interface.menu.cut");}, onClick: doClipboard('cut') },
          ...(clipboard ? [{ get label() {return uiText("interface.menu.paste");}, onClick: doPaste }] : []),
          { label: '', separator: true },
          { get label() {return uiText("webobsidian.rename-94ac9a");}, onClick: doRename },
          { get label() {return uiText("webobsidian.move-folder-to-84c68b");}, onClick: doMove },
          { get label() {return uiText("interface.menu.copy-path");}, onClick: copyPath },
          { get label() {return uiText("webobsidian.copy-url-path-1d4a42");}, onClick: copyUrl },
          { label: '', separator: true },
          { get label() {return uiText("dialogue.button-delete");}, danger: true, onClick: doDelete },
        ]
      : [
          { get label() {return uiText("webobsidian.open-cf9b77");}, onClick: () => openFile(node.path) },
          { get label() {return uiText("interface.menu.open-to-the-right");}, onClick: () => openToSide(node.path) },
          { label: '', separator: true },
          { label: bookmarks.includes(node.path) ? uiText("webobsidian.remove-bookmark-7da720") : uiText("plugins.bookmarks.label-bookmark"), onClick: () => toggleBookmark(node.path) },
          ...(/\.(md|markdown|canvas)$/i.test(node.path)
            ? [{ get label() {return uiText("webobsidian.share-24897b");}, icon: 'globe', onClick: () => setShareDialog(node.path) }]
            : []),
          { get label() {return uiText("plugins.file-explorer.menu-opt-make-copy");}, onClick: doCopy },
          { label: '', separator: true },
          { get label() {return uiText("interface.menu.copy");}, onClick: doClipboard('copy') },
          { get label() {return uiText("interface.menu.cut");}, onClick: doClipboard('cut') },
          ...(clipboard ? [{ get label() {return uiText("interface.menu.paste");}, onClick: doPaste }] : []),
          { label: '', separator: true },
          { get label() {return uiText("webobsidian.rename-94ac9a");}, onClick: doRename },
          { get label() {return uiText("webobsidian.move-file-to-ffc312");}, onClick: doMove },
          { get label() {return uiText("webobsidian.copy-url-path-1d4a42");}, onClick: copyUrl },
          { label: '', separator: true },
          { get label() {return uiText("dialogue.button-delete");}, danger: true, onClick: doDelete },
        ];
    openContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const onDragStart = (e: React.DragEvent) => {
    // Drag the whole selection if this row is part of it; otherwise drag just it
    // (and make it the selection, so the highlight matches what's being dragged).
    const sel = useStore.getState().selected;
    const paths = sel.includes(node.path) && sel.length > 1 ? sel : [node.path];
    if (!sel.includes(node.path)) { setSelected([node.path]); setSelectAnchor(node.path); }
    activeDrag = paths;
    e.dataTransfer.setData('text/wo-paths', JSON.stringify(paths));
    e.dataTransfer.setData('text/wo-path', node.path); // legacy single-path readers
    e.dataTransfer.effectAllowed = 'move';
  };
  /**
   * Decide where a drop lands. Outside Manual mode (or when the dragged items are not siblings of
   * this row) it is the classic behaviour: onto a folder = move inside it, onto a file = move into
   * its folder. In Manual mode, for siblings: the top/bottom edge of a row reorders (insertion line
   * before/after it) and the middle of a FOLDER row still moves the item into that folder, so both
   * reordering and moving work, and the last position is reachable via a row's bottom edge.
   */
  const computeZone = (e: React.DragEvent): DropZone => {
    if (treeSort !== 'manual') return 'inside';
    const dragged = pruneDescendants(activeDrag.length ? activeDrag : readDragPaths(e));
    const parent = parentDir(node.path);
    const siblings = dragged.length > 0 && !dragged.includes(node.path) && dragged.every((p) => parentDir(p) === parent);
    if (!siblings) return 'inside';
    const r = e.currentTarget.getBoundingClientRect();
    const y = r.height > 0 ? (e.clientY - r.top) / r.height : 0.5;
    if (isFolder) {
      if (y < 0.25) return 'before';
      // an expanded folder's bottom edge sits right above its first child → treat as "inside"
      if (y > 0.75 && !open) return 'after';
      return 'inside';
    }
    return y < 0.5 ? 'before' : 'after';
  };
  const onDragOverRow = (e: React.DragEvent) => {
    e.preventDefault();
    setDropZone(computeZone(e));
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const zone = computeZone(e);
    setDropZone(null);
    const dragged = pruneDescendants(readDragPaths(e));
    activeDrag = [];
    if (zone === 'before' || zone === 'after') {
      const targetParent = parentDir(node.path);
      const parentNode = targetParent ? findNode(tree, targetParent) : tree;
      const fallback = (parentNode?.children ?? []).map((c) => c.path);
      const current = manualOrder[targetParent] ?? fallback;
      const movingSet = new Set(dragged);
      const insert = current.filter((p) => movingSet.has(p));
      const rest = current.filter((p) => !movingSet.has(p));
      const at = rest.indexOf(node.path);
      const idx = at < 0 ? rest.length : zone === 'before' ? at : at + 1;
      setManualOrderForParent(targetParent, [...rest.slice(0, idx), ...insert, ...rest.slice(idx)]);
      return;
    }
    const targetDir = isFolder ? node.path : parentDir(node.path);
    await moveItemsTo(dragged, targetDir);
  };

  if (isFolder) {
    return (
      <div className="tree-item">
        <div
          className={`tree-row folder ${isSelected ? 'selected' : ''} ${dropClass(dropZone)}`}
          style={isCut ? { opacity: 0.5 } : undefined}
          data-path={node.path}
          draggable
          onDragStart={onDragStart}
          onClick={onRowClick}
          onContextMenu={onContext}
          onDragOver={onDragOverRow}
          onDragLeave={() => setDropZone(null)}
          onDragEnd={() => { activeDrag = []; setDropZone(null); }}
          onDrop={onDrop}
        >
          <span className="twisty">
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
          </span>
          {editing ? (
            <RenameInput node={node} onDone={() => setRenamingPath(null)} />
          ) : (
            <span className="name" onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); doRename(); }}>
              {node.name}
            </span>
          )}
          {!editing && (
            <button
              className="tree-del tree-add"
              title={uiText("plugins.file-explorer.menu-opt-new-note")}
              aria-label={uiText("webobsidian.new-note-in-value0-bb6245", {value0: node.name})}
              draggable={false}
              onClick={(e) => { e.stopPropagation(); void newNote(node.path); }}
              onDoubleClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
            >
              <Icon name="file-plus" size={13} />
            </button>
          )}
          {!editing && (
            <button
              className="tree-del tree-add"
              title={uiText("plugins.canvas.action-new-canvas")}
              aria-label={uiText("webobsidian.new-canvas-in-value0-ef9429", {value0: node.name})}
              draggable={false}
              onClick={(e) => { e.stopPropagation(); void newCanvas(node.path); }}
              onDoubleClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
            >
              <Icon name="layout-dashboard" size={13} />
            </button>
          )}
          {!editing && (
            <button
              className="tree-del"
              title={uiText("dialogue.button-delete")}
              aria-label={uiText("webobsidian.delete-value0-ea5388", {value0: node.name})}
              draggable={false}
              onClick={(e) => { e.stopPropagation(); void doDelete().catch((error: unknown) => notify(error instanceof Error ? error.message : uiText("webobsidian.delete-failed-64513b"))); }}
              onDoubleClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
            >
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
        {open && (
          <div className="tree-children">
            {(node.children ?? []).map((c) => (
              <Node key={c.path} node={c} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const filename = node.name.match(/^(.+)\.([^.]+)$/);
  const extension = filename?.[2].toLowerCase();
  return (
    <div className="tree-item">
      <div
        className={`tree-row ${activePath === node.path ? 'active' : ''} ${isSelected ? 'selected' : ''} ${dropClass(dropZone)}`}
        style={isCut ? { opacity: 0.5 } : undefined}
        data-path={node.path}
        draggable
        onDragStart={onDragStart}
        onClick={onRowClick}
        onContextMenu={onContext}
        // A file is a valid drop target too: dropping onto it moves the dragged
        // item into the file's parent folder (Obsidian behaviour). Without this,
        // drops on a file — or anywhere inside an expanded folder's contents —
        // bubble up to the root handler and either no-op or move to the vault root.
        onDragOver={onDragOverRow}
        onDragLeave={() => setDropZone(null)}
        onDragEnd={() => { activeDrag = []; setDropZone(null); }}
        onDrop={onDrop}
        title={node.path}
      >
        <span className="twisty leaf" />
        {editing ? (
          <RenameInput node={node} onDone={() => setRenamingPath(null)} />
        ) : (
          <span className="name" onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); doRename(); }}>
            {filename ? filename[1] : node.name}
          </span>
        )}
        {!editing && extension && !/^(md|markdown)$/.test(extension) && <span className="nav-file-tag">{extension}</span>}
        {shares.some((s) => s.path === node.path && s.enabled) && (
          <Icon name="globe" size={12} className="share-globe" />
        )}
        {bookmarks.includes(node.path) && <Icon name="bookmark" size={12} className="bm-star" />}
        {node.locked && (
          <span className="lock-badge" title={node.lockReason ?? uiText("webobsidian.read-only-maintained-by-the-agent-b93b79")}>
            <Icon name="lock" size={11} />
          </span>
        )}
        {!editing && (
          <button
          className="tree-del"
          title={uiText("dialogue.button-delete")}
          aria-label={uiText("webobsidian.delete-value0-ea5388", {value0: node.name})}
          draggable={false}
          onClick={(e) => { e.stopPropagation(); void doDelete().catch((error: unknown) => notify(error instanceof Error ? error.message : uiText("webobsidian.delete-failed-64513b"))); }}
          onDoubleClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          >
          <Icon name="trash" size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/** All folder paths in the tree (used by the header's Expand-all button). */
export function collectFolderPaths(root: TreeNode | null): string[] {
  if (!root) return [];
  const out: string[] = [];
  const walk = (n: TreeNode) => {
    for (const c of n.children ?? []) {
      if (c.type === 'folder') { out.push(c.path); walk(c); }
    }
  };
  walk(root);
  return out;
}

/**
 * Recursively sort a tree's children by the chosen order. Folders are always
 * grouped first and ordered by name (like Obsidian); the time/name criterion
 * applies to files. Only rendered (expanded) folders' children are shown, so
 * this naturally sorts just what's visible in the panel.
 */
const compareExplorerNames = new Intl.Collator(undefined, { usage: 'sort', sensitivity: 'base', numeric: true }).compare;

function sortTree(
  node: TreeNode,
  order: TreeSort,
  showAttachments: boolean,
  manualOrder: Record<string, string[]>,
  showUnsupportedFiles: boolean,
  codeSettings:import('../lib/codeFiles').CodeFileViewerSettings,
): TreeNode {
  if (!node.children) return node;
  const folderKey = node.path || '';
  const manual = manualOrder[folderKey] ?? [];
  const pos = new Map(manual.map((p, i) => [p, i]));
  const cmp = (a: TreeNode, b: TreeNode): number => {
    if (order === 'manual') {
      const ai = pos.get(a.path);
      const bi = pos.get(b.path);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return compareExplorerNames(a.name, b.name);
    }
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    if (a.type === 'folder') return compareExplorerNames(a.name, b.name);
    switch (order) {
      case 'name-desc': return -compareExplorerNames(a.name, b.name);
      case 'mtime-desc': return (b.mtime ?? 0) - (a.mtime ?? 0);
      case 'mtime-asc': return (a.mtime ?? 0) - (b.mtime ?? 0);
      case 'ctime-desc': return (b.ctime ?? 0) - (a.ctime ?? 0);
      case 'ctime-asc': return (a.ctime ?? 0) - (b.ctime ?? 0);
      default: return compareExplorerNames(a.name, b.name); // name-asc
    }
  };
  // Hidden attachment folders are dropped from this render copy only; the raw store tree
  // (used for name collisions, delete counts, etc.) still contains them.
  const children = displayChildren(node.children, showAttachments, showUnsupportedFiles, codeSettings)
    .map((c) => (c.type === 'folder' ? sortTree(c, order, showAttachments, manualOrder, showUnsupportedFiles, codeSettings) : c))
    .sort(cmp);
  return { ...node, children };
}

export default function FileTree() {
  const languageRevision = useLanguage().revision;

  const { values: preferences } = useVaultPreferences();
  const rawTree = useStore((s) => s.tree);
  const treeSort = useStore((s) => s.treeSort);
  const manualOrder = useStore((s) => s.manualOrder);
  const setManualOrderForParent = useStore((s) => s.setManualOrderForParent);
  const showAttachmentFolders = useStore((s) => s.showAttachmentFolders);
  const codeSettings=useStore(s=>s.codeFileViewer);
  const tree = rawTree ? sortTree(rawTree, treeSort, showAttachmentFolders, manualOrder, preferences.showUnsupportedFiles, codeSettings) : rawTree;
  const loadTree = useStore((s) => s.loadTree);
  const notify = useStore((s) => s.notify);
  const renamePath = useStore((s) => s.renamePath);
  const clipboard = useStore((s) => s.clipboard);
  const setClipboard = useStore((s) => s.setClipboard);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const newNote = useStore((s) => s.newNote);
  const newCanvas = useStore((s) => s.newCanvas);
  const newFolder = useStore((s) => s.newFolder);
  const activePath = useStore((s) => s.activePath);
  const autoReveal = useStore((s) => s.autoReveal);
  const setExpanded = useStore((s) => s.setExpanded);

  // Auto-reveal: when enabled, expand ancestors of the active file + scroll to it.
  useEffect(() => {
    if (!autoReveal || !activePath || !activePath.includes('.')) return;
    const segs = activePath.split('/');
    segs.pop();
    const ancestors: string[] = [];
    let acc = '';
    for (const s of segs) { acc = acc ? `${acc}/${s}` : s; ancestors.push(acc); }
    const cur = useStore.getState().expanded;
    const missing = ancestors.filter((a) => !cur.includes(a));
    if (missing.length) setExpanded([...cur, ...missing]);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('wo-reveal-file', { detail: { path: activePath } }));
    }, 60);
  }, [activePath, autoReveal, setExpanded]);

  // "Reveal file in navigation": scroll + flash the row once its folders expand.
  useEffect(() => {
    const onReveal = (e: Event) => {
      const path = (e as CustomEvent<{ path: string }>).detail?.path;
      if (!path) return;
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`.tree-row[data-path="${CSS.escape(path)}"]`);
        if (!el) return;
        el.scrollIntoView({ block: 'center' });
        el.classList.add('reveal-flash');
        window.setTimeout(() => el.classList.remove('reveal-flash'), 1200);
      });
    };
    window.addEventListener('wo-reveal-file', onReveal);
    return () => window.removeEventListener('wo-reveal-file', onReveal);
  }, []);

  const setSelected = useStore((s) => s.setSelected);

  const onRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const dragged = pruneDescendants(readDragPaths(e));
    activeDrag = [];
    // Manual mode: root-level items dropped on the empty area go to the end of the root order.
    if (treeSort === 'manual' && dragged.length > 0 && dragged.every((p) => !p.includes('/'))) {
      const current = manualOrder[''] ?? (rawTree?.children ?? []).map((c) => c.path);
      const moving = new Set(dragged);
      setManualOrderForParent('', [...current.filter((p) => !moving.has(p)), ...current.filter((p) => moving.has(p))]);
      return;
    }
    // Drop on the empty area = move to the vault root. Only nested items move.
    const paths = dragged.filter((p) => p.includes('/'));
    if (paths.length) await moveItemsTo(paths, '');
  };

  // Paste into the vault root (right-click on the empty area of the file tree).
  const pasteToRoot = async () => {
    const clip = useStore.getState().clipboard;
    if (!clip) return;
    const base = clip.path.split('/').pop()!;
    if (clip.mode === 'cut') {
      if (!clip.path.includes('/')) { setClipboard(null); return; } // already at root — no-op
      try {
        await renamePath(clip.path, base);
        setClipboard(null);
        await loadTree();
        notify(uiText("webobsidian.moved-0fc28d"));
      } catch (e: any) {
        notify(e?.message ?? uiText("webobsidian.paste-failed-18bdc4"));
      }
      return;
    }
    const name = uniqueChildName(useStore.getState().tree, '', base);
    try {
      await api.copy(clip.path, name);
      await loadTree();
      notify(uiText("webobsidian.pasted-a3a089"));
    } catch (e: any) {
      notify(e?.message ?? uiText("webobsidian.paste-failed-18bdc4"));
    }
  };

  const onRootContext = (e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { get label() {return uiText("plugins.file-explorer.menu-opt-new-note");}, onClick: () => newNote('') },
        { get label() {return uiText("plugins.canvas.action-new-canvas");}, onClick: () => newCanvas('') },
        { get label() {return uiText("plugins.file-explorer.menu-opt-new-folder");}, onClick: () => newFolder('') },
        ...(clipboard
          ? [{ label: '', separator: true }, { get label() {return uiText("interface.menu.paste");}, onClick: pasteToRoot }]
          : []),
      ],
    });
  };

  if (!tree) return <div style={{ padding: 12, color: 'var(--text-faint)' }}>{uiText("webobsidian.loading-33ce41")}</div>;
  if (!tree.children?.length)
    return (
      <div
        onContextMenu={onRootContext}
        style={{ padding: 12, color: 'var(--text-faint)', minHeight: '100%' }}
      >
        {uiText("webobsidian.vault-is-empty-85d4ac")} </div>
    );
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onRootDrop}
      onContextMenu={onRootContext}
      // Click on the empty area below the rows clears the selection.
      onClick={(e) => { if (e.target === e.currentTarget) setSelected([]); }}
      style={{ minHeight: '100%' }}
    >
      {tree.children.map((c) => (
        <Node key={c.path} node={c} depth={0} />
      ))}
    </div>
  );
}
