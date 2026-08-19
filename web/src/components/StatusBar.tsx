import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import Icon from './Icon';
import ContributionDialog from './ContributionDialog';
import { contributionMode } from '../lib/mode';

export default function StatusBar() {
  const content = useStore((s) => s.content);
  const activePath = useStore((s) => s.activePath);
  const dirty = useStore((s) => s.dirty);
  const loadTree = useStore((s) => s.loadTree);
  const notify = useStore((s) => s.notify);
  const [git, setGit] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [contributionOpen, setContributionOpen] = useState(false);

  const refresh = () => api.gitStatus().then(setGit).catch(() => setGit(null));
  useEffect(() => {
    if (contributionMode) return;
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
      await refresh();
    } catch (e: any) {
      notify(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const isText = activePath && /\.(md|markdown|txt)$/i.test(activePath);
  const words = isText ? content.trim().split(/\s+/).filter(Boolean).length : 0;

  const gitLabel = !git?.isRepo
    ? 'No vault sync'
    : git.clean
      ? `git ${git.branch}${git.ahead ? ` ↑${git.ahead}` : ''}${git.behind ? ` ↓${git.behind}` : ''}`
      : `${git.modified + git.notAdded} unsaved changes`;

  return (
    <div className="status-bar">
      {dirty && <span>{contributionMode ? 'Unsaved draft' : 'Saving…'}</span>}
      {isText && <span>{words} words</span>}
      {isText && <span>{content.length} characters</span>}
      {contributionMode ? (
        isText && activePath && (
          <span className="clickable contribution-submit" title="Create a review pull request" onClick={() => setContributionOpen(true)}>
            <Icon name="git-pull-request" size={13} />
            提交审核
          </span>
        )
      ) : (
        <span className="clickable" title="Git sync" onClick={sync}>
          <Icon name="refresh-cw" size={13} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
          {gitLabel}
        </span>
      )}
      {contributionOpen && activePath && (
        <ContributionDialog path={activePath} onClose={() => setContributionOpen(false)} />
      )}
    </div>
  );
}
