import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import Icon from './Icon';

export default function Ribbon({ onTheme }: { onTheme: () => void }) {
  const languageRevision = useLanguage().revision;

  const setLeftPanel = useStore((s) => s.setLeftPanel);
  const leftPanel = useStore((s) => s.leftPanel);
  const setGraph = useStore((s) => s.setGraph);
  const openTasks = useStore((s) => s.openTasks);
  const setSettings = useStore((s) => s.setSettings);
  const setPalette = useStore((s) => s.setPalette);
  const openDailyNote = useStore((s) => s.openDailyNote);
  const setTemplatePicker = useStore((s) => s.setTemplatePicker);
  const notify = useStore((s) => s.notify);
  const loadTree = useStore((s) => s.loadTree);

  // Show the Sync-now button only when git sync is enabled in settings.
  const [gitEnabled, setGitEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    const refresh = () => api.gitStatus().then((g) => setGitEnabled(!!g?.enabled)).catch(() => setGitEnabled(false));
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    notify(uiText("webobsidian.syncing-221ca6"));
    try {
      const r = await api.gitSync();
      notify(r.ok ? uiText("webobsidian.synced-d21218") : uiText("webobsidian.sync-value0-9b1512", {value0: r.log.at(-1)}));
      await loadTree();
    } catch (e: any) {
      notify(uiText("webobsidian.sync-failed-value0-914bf4", {value0: e.message}));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="ribbon">
      <button className={leftPanel === 'files' ? 'active' : ''} title={uiText("plugins.file-explorer.name")} onClick={() => setLeftPanel('files')}>
        <Icon name="file-text" size={18} />
      </button>
      <button className={leftPanel === 'search' ? 'active' : ''} title={uiText("webobsidian.search-f-cb85d0")} onClick={() => setLeftPanel('search')}>
        <Icon name="search" size={18} />
      </button>
      <button title={uiText("plugins.graph-view.name")} onClick={() => setGraph(true)}>
        <Icon name="graph" size={18} />
      </button>
      <button title={uiText("webobsidian.tasks-090ec5")} onClick={() => openTasks()}>
        <Icon name="check-square" size={18} />
      </button>
      <button className={leftPanel === 'bookmarks' ? 'active' : ''} title={uiText("webobsidian.bookmarks-recent-16210f")} onClick={() => setLeftPanel('bookmarks')}>
        <Icon name="bookmark" size={18} />
      </button>
      <button title={uiText("setting.file.option-choice-daily-note")} onClick={() => openDailyNote()}>
        <Icon name="calendar" size={18} />
      </button>
      <button title={uiText("webobsidian.new-note-from-template-8a05d2")} onClick={() => setTemplatePicker(true)}>
        <Icon name="file-plus" size={18} />
      </button>
      <button className={leftPanel === 'tags' ? 'active' : ''} title={uiText("webobsidian.tags-848eed")} onClick={() => setLeftPanel('tags')}>
        <Icon name="hash" size={18} />
      </button>
      <button title={uiText("webobsidian.command-palette-p-1c8f74")} onClick={() => setPalette(true, 'commands')}>
        <Icon name="command" size={18} />
      </button>
      <div className="spacer" />
      {gitEnabled && (
        <button title={syncing ? uiText("webobsidian.syncing-221ca6") : uiText("webobsidian.sync-now-2b7d93")} onClick={sync} disabled={syncing}>
          <Icon name="refresh-cw" size={18} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      )}
      <button title={uiText("webobsidian.toggle-theme-9b0eaf")} onClick={onTheme}>
        <Icon name="moon" size={18} />
      </button>
      <button title={uiText("interface.settings")} onClick={() => setSettings(true)}>
        <Icon name="settings" size={18} />
      </button>
    </div>
  );
}
