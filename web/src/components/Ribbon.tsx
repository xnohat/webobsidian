import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import Icon from './Icon';

export default function Ribbon({ onTheme }: { onTheme: () => void }) {
  const setLeftPanel = useStore((s) => s.setLeftPanel);
  const leftPanel = useStore((s) => s.leftPanel);
  const setGraph = useStore((s) => s.setGraph);
  const setSettings = useStore((s) => s.setSettings);
  const setPalette = useStore((s) => s.setPalette);
  const openDailyNote = useStore((s) => s.openDailyNote);
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
    notify('Syncing…');
    try {
      const r = await api.gitSync();
      notify(r.ok ? 'Synced ✓' : `Sync: ${r.log.at(-1)}`);
      await loadTree();
    } catch (e: any) {
      notify(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="ribbon">
      <button className={leftPanel === 'files' ? 'active' : ''} title="Files" onClick={() => setLeftPanel('files')}>
        <Icon name="file-text" size={18} />
      </button>
      <button className={leftPanel === 'search' ? 'active' : ''} title="Search (⌘⇧F)" onClick={() => setLeftPanel('search')}>
        <Icon name="search" size={18} />
      </button>
      <button title="Graph view" onClick={() => setGraph(true)}>
        <Icon name="graph" size={18} />
      </button>
      <button className={leftPanel === 'bookmarks' ? 'active' : ''} title="Bookmarks & recent" onClick={() => setLeftPanel('bookmarks')}>
        <Icon name="bookmark" size={18} />
      </button>
      <button title="Daily note" onClick={() => openDailyNote()}>
        <Icon name="calendar" size={18} />
      </button>
      <button className={leftPanel === 'tags' ? 'active' : ''} title="Tags" onClick={() => setLeftPanel('tags')}>
        <Icon name="hash" size={18} />
      </button>
      <button title="Command palette (⌘P)" onClick={() => setPalette(true, 'commands')}>
        <Icon name="command" size={18} />
      </button>
      <div className="spacer" />
      {gitEnabled && (
        <button title={syncing ? 'Syncing…' : 'Sync now'} onClick={sync} disabled={syncing}>
          <Icon name="refresh-cw" size={18} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      )}
      <button title="Toggle theme" onClick={onTheme}>
        <Icon name="moon" size={18} />
      </button>
      <button title="Settings" onClick={() => setSettings(true)}>
        <Icon name="settings" size={18} />
      </button>
    </div>
  );
}
