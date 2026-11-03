import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import Icon from './Icon';

export default function StatusBar() {
  const languageRevision = useLanguage().revision;

  const content = useStore((s) => s.content);
  const activePath = useStore((s) => s.activePath);
  const dirty = useStore((s) => s.dirty);
  const loadTree = useStore((s) => s.loadTree);
  const notify = useStore((s) => s.notify);
  const [git, setGit] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = () => api.gitStatus().then(setGit).catch(() => setGit(null));
  useEffect(() => {
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
      await refresh();
    } catch (e: any) {
      notify(uiText("webobsidian.sync-failed-value0-914bf4", {value0: e.message}));
    } finally {
      setSyncing(false);
    }
  };

  const isText = activePath && /\.(md|markdown|txt)$/i.test(activePath);
  const words = isText ? content.trim().split(/\s+/).filter(Boolean).length : 0;

  const gitLabel = !git?.isRepo
    ? uiText("webobsidian.no-vault-sync-6fb8d9")
    : git.clean
      ? `git ${git.branch}${git.ahead ? ` ↑${git.ahead}` : ''}${git.behind ? ` ↓${git.behind}` : ''}`
      : `${git.modified + git.notAdded} unsaved changes`;

  return (
    <div className="status-bar">
      {isText && <span>{words} {uiText("webobsidian.words-efb893")}</span>}
      {isText && <span>{content.length} {uiText("webobsidian.characters-aa908a")}</span>}
      <span className="clickable" title={uiText("webobsidian.git-sync-08b886")} onClick={sync}>
        <Icon name="refresh-cw" size={13} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
        {gitLabel}
      </span>
    </div>
  );
}
