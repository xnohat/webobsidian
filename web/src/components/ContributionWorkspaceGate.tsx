import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, type ContributionReview } from '../lib/api';
import {
  clearContributionWorkspace,
  getContributionWorkspace,
  selectExistingContribution,
  selectNewContribution,
  subscribeContributionWorkspace,
  type ContributionWorkspace,
} from '../lib/contributionWorkspace';
import { contributionMode } from '../lib/mode';
import { useStore } from '../lib/store';

function useContributionWorkspace(): ContributionWorkspace | null {
  return useSyncExternalStore(
    subscribeContributionWorkspace,
    getContributionWorkspace,
    () => null,
  );
}

export default function ContributionWorkspaceGate() {
  const activePath = useStore((state) => state.activePath);
  const dirty = useStore((state) => state.dirty);
  const save = useStore((state) => state.save);
  const loadTree = useStore((state) => state.loadTree);
  const openFile = useStore((state) => state.openFile);
  const workspace = useContributionWorkspace();
  const [reviews, setReviews] = useState<ContributionReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [checkedPath, setCheckedPath] = useState<string | null>(null);
  const markdownPath = activePath && /\.(md|markdown)$/i.test(activePath) ? activePath : null;

  useEffect(() => {
    if (!contributionMode || !markdownPath || workspace) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setReviews([]);
    setCheckedPath(null);
    api.listContributions(markdownPath)
      .then(({ items }) => {
        if (cancelled) return;
        const open = items.filter((item) => item.status === 'open');
        if (open.length === 0) {
          selectNewContribution();
          return;
        }
        setReviews(open);
        setCheckedPath(markdownPath);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : '无法读取开放投稿');
          setCheckedPath(markdownPath);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, markdownPath, workspace]);

  if (!contributionMode || !markdownPath || (workspace && !switching)) return null;
  const checking = loading || checkedPath !== markdownPath;

  const activate = async (next: ContributionWorkspace) => {
    setSwitching(true);
    setError('');
    try {
      if (dirty) await save();
      if (next.kind === 'existing') selectExistingContribution(next.review);
      else selectNewContribution();
      await loadTree();
      await openFile(markdownPath);
    } catch (cause) {
      clearContributionWorkspace();
      setError(cause instanceof Error ? cause.message : '无法进入投稿工作区');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="modal-bg contribution-workspace-gate">
      <div className="modal contribution-dialog">
        <div className="contribution-dialog-body">
          <h2>选择投稿工作区</h2>
          <p className="contribution-help">
            在开始修改前选择内容来源。继续已有 PR 会先加载该投稿分支的最新文件，提交目标随后保持锁定。
          </p>
          <div className="contribution-current-file">
            <span>准备编辑</span>
            <code>{markdownPath}</code>
          </div>
          {(checking || switching) && (
            <div className="contribution-workspace-loading">
              {switching ? '正在加载投稿分支…' : '正在检查开放投稿…'}
            </div>
          )}
          {!checking && !switching && reviews.map((review) => (
            <button
              className="contribution-workspace-option"
              type="button"
              key={review.branch}
              onClick={() => void activate({ kind: 'existing', review })}
            >
              <strong>继续修改 PR #{review.pullNumber}</strong>
              <span>{review.title}</span>
              <code>{review.branch}</code>
            </button>
          ))}
          {error && <div className="err">{error}</div>}
        </div>
        {!checking && !switching && (
          <div className="contribution-actions">
            {error && (
              <button className="btn secondary" type="button" onClick={() => setAttempt((value) => value + 1)}>
                重试
              </button>
            )}
            <button className="btn secondary" type="button" onClick={() => void activate({ kind: 'new' })}>
              基于 contributions 创建新投稿
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
