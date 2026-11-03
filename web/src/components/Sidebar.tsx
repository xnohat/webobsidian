import {translateLabel as uiLabel} from "../lib/i18n/runtime";
import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect } from 'react';
import { useStore } from '../lib/store';
import FileTree, { collectFolderPaths } from './FileTree';
import SearchPanel from './SearchPanel';
import TagsPanel from './TagsPanel';
import BookmarksPanel from './BookmarksPanel';
import Icon from './Icon';

const TITLES: Record<string, string> = {
  get files() {return uiText("plugins.file-explorer.name");},
  get search() {return uiText("webobsidian.search-bce064");},
  get tags() {return uiText("webobsidian.tags-848eed");},
  get bookmarks() {return uiText("webobsidian.bookmarks-ca3cdd");},
};

export default function Sidebar() {
  const languageRevision = useLanguage().revision;

  const leftPanel = useStore((s) => s.leftPanel);
  const newNote = useStore((s) => s.newNote);
  const newCanvas = useStore((s) => s.newCanvas);
  const newFolder = useStore((s) => s.newFolder);
  const setTrash = useStore((s) => s.setTrash);
  const tree = useStore((s) => s.tree);
  const expanded = useStore((s) => s.expanded);
  const setExpanded = useStore((s) => s.setExpanded);
  const treeSort = useStore((s) => s.treeSort);
  const setTreeSort = useStore((s) => s.setTreeSort);
  const autoReveal = useStore((s) => s.autoReveal);
  const toggleAutoReveal = useStore((s) => s.toggleAutoReveal);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const vaultName = tree?.name || 'Vault';

  const allCollapsed = expanded.length === 0;
  const toggleCollapseAll = () => setExpanded(allCollapsed ? collectFolderPaths(tree) : []);

  // Restore the user's saved sidebar width (device-local) on mount.
  useEffect(() => {
    try {
      const w = localStorage.getItem('wo-sidebar-width');
      if (w) document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
    } catch { /* ignore */ }
  }, []);

  // Drag the inner-edge splitter to resize the sidebar (clamped 180–560px). Updates
  // the --sidebar-width CSS var live (the .app grid track follows it) and persists.
  const onResizeDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    const startW = handle.parentElement?.getBoundingClientRect().width ?? 252;
    handle.classList.add('active');
    document.body.classList.add('wo-col-resizing');
    const move = (ev: PointerEvent) => {
      const w = Math.min(560, Math.max(180, Math.round(startW + (ev.clientX - startX))));
      document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
    };
    const up = () => {
      handle.classList.remove('active');
      document.body.classList.remove('wo-col-resizing');
      const w = parseInt(document.documentElement.style.getPropertyValue('--sidebar-width'), 10);
      if (w) try { localStorage.setItem('wo-sidebar-width', String(w)); } catch { /* ignore */ }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const openSortMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openContextMenu({
      x: r.left,
      y: r.bottom + 4,
      items: [
        { get label() {return uiText("plugins.file-explorer.label-sort-a-to-z");}, icon: treeSort === 'name-asc' ? 'check' : undefined, onClick: () => setTreeSort('name-asc') },
        { get label() {return uiText("plugins.file-explorer.label-sort-z-to-a");}, icon: treeSort === 'name-desc' ? 'check' : undefined, onClick: () => setTreeSort('name-desc') },
        { label: '', separator: true },
        { get label() {return uiText("plugins.file-explorer.label-sort-new-to-old");}, icon: treeSort === 'mtime-desc' ? 'check' : undefined, onClick: () => setTreeSort('mtime-desc') },
        { get label() {return uiText("plugins.file-explorer.label-sort-old-to-new");}, icon: treeSort === 'mtime-asc' ? 'check' : undefined, onClick: () => setTreeSort('mtime-asc') },
        { label: '', separator: true },
        { get label() {return uiText("plugins.file-explorer.label-sort-created-new-to-old");}, icon: treeSort === 'ctime-desc' ? 'check' : undefined, onClick: () => setTreeSort('ctime-desc') },
        { get label() {return uiText("plugins.file-explorer.label-sort-created-old-to-new");}, icon: treeSort === 'ctime-asc' ? 'check' : undefined, onClick: () => setTreeSort('ctime-asc') },
        { label: '', separator: true },
        { get label() {return uiText("plugins.bases.label-sort-manual");}, icon: treeSort === 'manual' ? 'check' : undefined, onClick: () => setTreeSort('manual') },
      ],
    });
  };

  return (
    <div className="sidebar">
      <div className="nav-header">
        <span className="nav-title">{uiLabel(TITLES[leftPanel])}</span>
        {leftPanel === "files" && (
          <>
            <button className="nav-action" title={uiText("plugins.file-explorer.action-new-note")} onClick={() => newNote()}>
              <Icon name="square-pen" size={16} />
            </button>
            <button className="nav-action" title={uiText("plugins.canvas.action-new-canvas")} onClick={() => newCanvas()}>
              <Icon name="layout-dashboard" size={16} />
            </button>
            <button className="nav-action" title={uiText("plugins.file-explorer.action-new-folder")} onClick={() => newFolder()}>
              <Icon name="folder-plus" size={16} />
            </button>
            <button className="nav-action" title={uiText("plugins.file-explorer.action-change-sort")} onClick={openSortMenu}>
              <Icon name="arrow-up-narrow-wide" size={16} />
            </button>
            <button
              className={`nav-action ${autoReveal ? 'active' : ''}`}
              title={uiText("webobsidian.reveal-active-file-in-explorer-d789fe")}
              onClick={() => toggleAutoReveal()}
            >
              <Icon name="crosshair" size={16} />
            </button>
            <button
              className="nav-action"
              title={allCollapsed ? uiText("plugins.file-explorer.action-expand-all") : uiText("plugins.file-explorer.action-collapse-all")}
              onClick={toggleCollapseAll}
            >
              <Icon name={allCollapsed ? 'chevrons-up-down' : 'chevrons-down-up'} size={16} />
            </button>
            <button className="nav-action" title={uiText("setting.file.option-trash")} onClick={() => setTrash(true)}>
              <Icon name="trash" size={16} />
            </button>
          </>
        )}
      </div>
      <div className="sidebar-body">
        {leftPanel === "files" && <FileTree />}
        {leftPanel === "search" && <SearchPanel />}
        {leftPanel === "tags" && <TagsPanel />}
        {leftPanel === "bookmarks" && <BookmarksPanel />}
      </div>
      <div className="vault-footer">
        <span className="vault-name">
          <Icon name="gem" size={15} /> {vaultName}
        </span>
        <span className="grow" />
      </div>
      <div className="sidebar-resizer" title={uiText("plugins.bases.table.tooltip-drag-to-resize")} onPointerDown={onResizeDown} />
    </div>
  );
}
