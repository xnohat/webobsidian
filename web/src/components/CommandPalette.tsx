import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import {pluginCommands,usePluginRevision} from '../lib/plugins/registry';
import {commands as editorToolbarCommands,captureContext,executeCommand} from '../lib/toolbar/registry';
import {getActiveEditor} from '../lib/activeEditor';
import {foldAll,unfoldAll,foldCode,unfoldCode} from '@codemirror/language';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api, type TreeNode } from '../lib/api';
import { useVaultPreferences } from '../lib/vaultPreferences';
import { isUserIgnored } from '../lib/vaultLinks';
import { isSupportedVaultFile } from '../lib/media';

interface Cmd {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
}

function flatten(node: TreeNode | null): { path: string; title: string }[] {
  if (!node) return [];
  const out: { path: string; title: string }[] = [];
  const walk = (n: TreeNode) => {
    if (n.type === 'file') {
      out.push({ path: n.path, title: n.name.replace(/\.(md|markdown)$/, '') });
    }
    n.children?.forEach(walk);
  };
  node.children?.forEach(walk);
  return out;
}

export default function CommandPalette() {
  const languageRevision = useLanguage().revision;

  const { values: preferences } = useVaultPreferences();
  const pluginRevision=usePluginRevision();
  const codeSettings=useStore(s=>s.codeFileViewer);
  const open = useStore((s) => s.paletteOpen);
  const mode = useStore((s) => s.paletteMode);
  const setOpen = useStore((s) => s.setPalette);
  const tree = useStore((s) => s.tree);
  const activePath = useStore((s) => s.activePath);
  const openFile = useStore((s) => s.openFile);
  const openToSide = useStore((s) => s.openToSide);
  const setSettings = useStore((s) => s.setSettings);
  const setTrash = useStore((s) => s.setTrash);
  const setGraph = useStore((s) => s.setGraph);
  const openTasks = useStore((s) => s.openTasks);
  const setTasksMode = useStore((s) => s.setTasksMode);
  const setLeftPanel = useStore((s) => s.setLeftPanel);
  const setViewMode = useStore((s) => s.setViewMode);
  const save = useStore((s) => s.save);
  const toggleBookmark = useStore((s) => s.toggleBookmark);
  const openDailyNote = useStore((s) => s.openDailyNote);
  const setTemplatePicker = useStore((s) => s.setTemplatePicker);
  const newNote = useStore((s) => s.newNote);
  const newCanvas = useStore((s) => s.newCanvas);
  const notify = useStore((s) => s.notify);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const files = useMemo(() => flatten(tree), [tree, languageRevision]);

  const commands: Cmd[] = useMemo(
    () => [
      ...pluginCommands(),
      ...editorToolbarCommands.map(c=>({id:c.id,title:c.label,run:()=>{const v=getActiveEditor();if(v)void executeCommand(c.id,captureContext(v));}})),
      { id: 'new', get title() {return uiText("plugins.file-explorer.action-new-note");}, hint: '⌘N', run: () => newNote() },
      { id: 'new-from-template', get title() {return uiText("webobsidian.new-note-from-template-8a05d2");}, run: () => setTemplatePicker(true) },
      { id: 'new-canvas', get title() {return uiText("plugins.canvas.action-new-canvas");}, run: () => newCanvas() },
      { id: 'daily', get title() {return uiText("webobsidian.open-today-s-daily-note-0d484c");}, run: () => openDailyNote() },
      { id: 'save', get title() {return uiText("commands.save-file");}, hint: '⌘S', run: () => save() },
      { id: 'bookmark', get title() {return uiText("webobsidian.bookmark-current-file-dfc9f6");}, run: () => activePath && toggleBookmark(activePath) },
      { id: 'split', get title() {return uiText("webobsidian.open-current-file-to-the-right-c26047");}, run: () => activePath && openToSide(activePath) },
      { id: 'search', get title() {return uiText("webobsidian.open-search-5b003a");}, run: () => setLeftPanel('search') },
      { id: 'bookmarks', get title() {return uiText("webobsidian.open-bookmarks-recent-b8a389");}, run: () => setLeftPanel('bookmarks') },
      { id: 'graph', get title() {return uiText("plugins.graph-view.action-open");}, run: () => setGraph(true) },
      { id: 'tasks', get title() {return uiText("webobsidian.open-tasks-board-726f82");}, run: () => openTasks() },
      {
        id: 'tasks-timeline',
        get title() {return uiText("webobsidian.open-tasks-timeline-2e8281");},
        run: () => {
          // State first (the view may already be mounted and reading it), then
          // the deep link, then open/focus the tab.
          setTasksMode('timeline');
          window.history.replaceState(null, '', '/tasks?mode=timeline');
          return openTasks();
        },
      },
      { id: 'settings', get title() {return uiText("commands.open-settings");}, run: () => setSettings(true) },
      { id: 'trash', get title() {return uiText("webobsidian.open-trash-3131d6");}, run: () => setTrash(true) },
      { id: 'reading', get title() {return uiText("webobsidian.view-reading-mode-379465");}, run: () => setViewMode('reading') },
      { id: 'live', get title() {return uiText("webobsidian.view-live-edit-cd7b9e");}, run: () => setViewMode('live') },
      { id: 'source', get title() {return uiText("webobsidian.view-source-044962");}, run: () => setViewMode('source') },
      ...([
        ['fold-more',uiText("webobsidian.fold-more-7be5b1"),foldCode],['fold-less',uiText("webobsidian.fold-less-c812b7"),unfoldCode],
        ['fold-all',uiText("webobsidian.fold-all-headings-and-lists-fe51fa"),foldAll],['unfold-all',uiText("webobsidian.unfold-all-headings-and-lists-c0322c"),unfoldAll],
      ] as const).map(([id,title,command])=>({id,title,run:()=>{
        const view=getActiveEditor();if(view){command(view);view.focus();}
      }})),
      { id: 'reindex', get title() {return uiText("webobsidian.rebuild-search-index-2f4e96");}, run: async () => {
          notify(uiText("webobsidian.rebuilding-search-index-7c9e99"), 0);
          try {
            await api.reindex();
            notify(uiText("webobsidian.search-index-rebuilt-7c37e8"));
          } catch {
            notify(uiText("webobsidian.failed-to-rebuild-search-index-bc018d"));
          }
        } },
    ],
    [pluginRevision, save, setLeftPanel, setGraph, openTasks, setSettings, setTrash, setViewMode, activePath, toggleBookmark, openToSide, openDailyNote, newNote, newCanvas, notify, languageRevision],
  );

  const items = useMemo(() => {
    const isCmd = mode === 'commands' || q.startsWith('>');
    const lc = q.replace(/^>/, '').trim().toLowerCase();
    const fileItems: Cmd[] = files
      .filter(f => preferences.showUnsupportedFiles || isSupportedVaultFile(f.path,codeSettings))
      .filter((f) => !lc || f.title.toLowerCase().includes(lc) || f.path.toLowerCase().includes(lc))
      .sort((a,b) => Number(isUserIgnored(a.path,preferences.userIgnoreFilters)) - Number(isUserIgnored(b.path,preferences.userIgnoreFilters)))
      .slice(0, 40)
      .map((f) => ({ id: `f:${f.path}`, title: f.title, hint: f.path, run: () => openFile(f.path) }));
    const cmdItems = commands.filter((c) => !lc || c.title.toLowerCase().includes(lc));
    if (isCmd) return cmdItems;
    if (mode === 'files') return fileItems;
    return [...cmdItems.slice(0, 3), ...fileItems];
  }, [q, mode, files, commands, openFile, preferences, codeSettings, languageRevision]);

  useEffect(() => setSel(0), [q, open]);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      items[sel]?.run();
      setOpen(false);
    }
  };

  return (
    <div className="modal-bg" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <input
          className="palette-input"
          placeholder={mode === "commands" ? uiText("webobsidian.run-a-command-6000fe") : uiText("webobsidian.search-files-prefix-for-commands-23d578")}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="palette-list">
          {items.map((it, i) => (
            <div
              key={it.id}
              className={`palette-item ${i === sel ? 'sel' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => {
                it.run();
                setOpen(false);
              }}
            >
              <span>{it.title}</span>
              {it.hint && <span className="kbd">{it.hint}</span>}
            </div>
          ))}
          {items.length === 0 && <div className="palette-item">{uiText("webobsidian.no-matches-cd0af6")}</div>}
        </div>
      </div>
    </div>
  );
}
