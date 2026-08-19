import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import type { ContributionReview } from '../lib/api';
import Icon from './Icon';
import ContributionDialog from './ContributionDialog';
import { contributionMode } from '../lib/mode';
import {
  clearContribution,
  clearDraft,
  loadDraft,
  loadContribution,
  saveContribution,
} from '../lib/drafts';

export default function StatusBar() {
  const content = useStore((s) => s.content);
  const activePath = useStore((s) => s.activePath);
  const dirty = useStore((s) => s.dirty);
  const loadTree = useStore((s) => s.loadTree);
  const notify = useStore((s) => s.notify);
  const [git, setGit] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [contributionOpen, setContributionOpen] = useState(false);
  const [review, setReview] = useState<ContributionReview | null>(null);
  const [reviewVersion, setReviewVersion] = useState(0);

  const refresh = () => api.gitStatus().then(setGit).catch(() => setGit(null));
  useEffect(() => {
    if (contributionMode) return;
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!contributionMode || !activePath || !/\.(md|markdown)$/i.test(activePath)) {
      setReview(null);
      return;
    }
    let cancelled = false;
    const syncReview = async () => {
      try {
        const { items } = await api.listContributions(activePath);
        if (cancelled) return;
        const local = loadContribution(activePath);
        const open = items.find((item) => item.status === 'open' && item.branch === local?.branch)
          ?? items.find((item) => item.status === 'open');
        if (open) {
          saveContribution(activePath, {
            branch: open.branch,
            pullNumber: open.pullNumber,
            pullUrl: open.pullUrl,
            title: open.title,
            submittedContent: local?.branch === open.branch ? local.submittedContent : undefined,
          });
          setReview(open);
          return;
        }

        const completed = local
          ? items.find((item) => item.branch === local.branch && item.status !== 'open')
          : undefined;
        if (completed?.status === 'merged') {
          const state = useStore.getState();
          const draft = loadDraft(activePath);
          const submittedContent = local?.submittedContent;
          const draftIsSubmittedVersion = submittedContent !== undefined
            && draft === submittedContent
            && (!state.dirty || state.content === submittedContent);
          clearContribution(activePath);
          setReview(completed);
          if (draftIsSubmittedVersion) {
            clearDraft(activePath);
            useStore.setState({ dirty: false });
            notify(`PR #${completed.pullNumber} 已合并，本地旧草稿已清理`, 5000);
            await state.openFile(activePath);
          } else {
            notify(`PR #${completed.pullNumber} 已合并；检测到较新的本地草稿，已保留`, 5000);
          }
          return;
        }
        if (completed?.status === 'closed') {
          clearContribution(activePath);
          notify(`PR #${completed.pullNumber} 已关闭，本地草稿已保留`, 5000);
        }
        setReview(completed ?? items[0] ?? null);
      } catch {
        if (!cancelled) setReview(null);
      }
    };
    const onFocus = () => void syncReview();
    void syncReview();
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(syncReview, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [activePath, notify, reviewVersion]);

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
          <>
            {review && (
              <a
                className="clickable contribution-submit"
                href={review.pullUrl}
                target="_blank"
                rel="noreferrer"
                title="在 GitHub 打开投稿 PR"
              >
                <Icon name="git-pull-request" size={13} />
                PR #{review.pullNumber} {review.status === 'open' ? '待审核' : review.status === 'merged' ? '已合并' : '已关闭'}
              </a>
            )}
            <span className="clickable contribution-submit" title="Create or update a review pull request" onClick={() => setContributionOpen(true)}>
              <Icon name="git-pull-request" size={13} />
              {review?.status === 'open' ? '更新审核' : '提交审核'}
            </span>
          </>
        )
      ) : (
        <span className="clickable" title="Git sync" onClick={sync}>
          <Icon name="refresh-cw" size={13} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
          {gitLabel}
        </span>
      )}
      {contributionOpen && activePath && (
        <ContributionDialog
          path={activePath}
          onClose={() => setContributionOpen(false)}
          onSubmitted={() => setReviewVersion((version) => version + 1)}
        />
      )}
    </div>
  );
}
