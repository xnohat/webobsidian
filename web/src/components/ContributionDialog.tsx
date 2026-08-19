import { useMemo, useState } from 'react';
import { api, type ContributionReview } from '../lib/api';
import { useStore } from '../lib/store';
import {
  clearContribution,
  loadContribution,
  saveContribution,
} from '../lib/drafts';

interface Props {
  path: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

export default function ContributionDialog({ path, onClose, onSubmitted }: Props) {
  const save = useStore((state) => state.save);
  const notify = useStore((state) => state.notify);
  const defaultTitle = useMemo(
    () => `更新 ${path.split('/').pop()?.replace(/\.(md|markdown)$/i, '') ?? '文档'}`,
    [path],
  );
  const [existing, setExisting] = useState(() => loadContribution(path));
  const [title, setTitle] = useState(() => existing?.title ?? defaultTitle);
  const [contributorName, setContributorName] = useState(
    () => localStorage.getItem('uscwiki-editor:contributor-name') ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pullUrl, setPullUrl] = useState('');
  const [linkExisting, setLinkExisting] = useState(false);
  const [openContributions, setOpenContributions] = useState<ContributionReview[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [loadingContributions, setLoadingContributions] = useState(false);

  const toggleExisting = async () => {
    if (linkExisting) {
      setLinkExisting(false);
      setSelectedBranch('');
      return;
    }
    setLinkExisting(true);
    setLoadingContributions(true);
    setError('');
    try {
      const result = await api.listContributions();
      setOpenContributions(result.items);
      setSelectedBranch(result.items[0]?.branch ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取开放 PR');
    } finally {
      setLoadingContributions(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await save();
      const content = useStore.getState().content;
      const updateBranch = (existing?.branch ?? selectedBranch) || undefined;
      const result = await api.submitContribution({
        title,
        contributor: { name: contributorName },
        files: [{ path, content }],
        ...(updateBranch ? { branch: updateBranch } : {}),
      });
      localStorage.setItem('uscwiki-editor:contributor-name', contributorName);
      saveContribution(path, {
        branch: result.branch,
        pullNumber: result.pullNumber,
        pullUrl: result.pullUrl,
        title,
        submittedContent: content,
      });
      setExisting({
        branch: result.branch,
        pullNumber: result.pullNumber,
        pullUrl: result.pullUrl,
        title,
        submittedContent: content,
      });
      setPullUrl(result.pullUrl);
      onSubmitted?.();
      notify(
        result.action === 'created'
          ? `PR #${result.pullNumber} 已创建，等待审核`
          : `PR #${result.pullNumber} 已更新`,
        5000,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '提交失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal contribution-dialog" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <div className="contribution-dialog-body">
          <h2>{existing ? `更新 PR #${existing.pullNumber}` : selectedBranch ? '更新已有 PR' : '提交审核'}</h2>
          <p className="contribution-help">
            系统会使用统一贡献账号创建分支，并向主仓库的 <code>contributions</code> 分支发起 PR；不会直接修改 <code>main</code>。
          </p>
          {existing && (
            <p className="contribution-help">
              这次提交会追加到现有投稿分支 <code>{existing.branch}</code>。
            </p>
          )}
          {!existing && linkExisting && (
            <label>
              <span>选择开放的投稿 PR</span>
              <select
                className="text-input"
                value={selectedBranch}
                required
                disabled={loadingContributions || openContributions.length === 0}
                onChange={(event) => setSelectedBranch(event.target.value)}
              >
                {loadingContributions && <option value="">正在读取 GitHub…</option>}
                {!loadingContributions && openContributions.length === 0 && (
                  <option value="">没有可关联的开放 PR</option>
                )}
                {openContributions.map((contribution) => (
                  <option key={contribution.branch} value={contribution.branch}>
                    #{contribution.pullNumber} · {contribution.title} · {contribution.branch}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>文件</span>
            <input className="text-input" value={path} disabled />
          </label>
          <label>
            <span>PR 标题</span>
            <input
              className="text-input"
              value={title}
              maxLength={120}
              required
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            <span>投稿人署名</span>
            <input
              className="text-input"
              value={contributorName}
              maxLength={80}
              required
              autoFocus
              onChange={(event) => setContributorName(event.target.value)}
            />
          </label>
          {error && <div className="err">{error}</div>}
          {pullUrl && (
            <div className="contribution-success">
              PR 已提交：<a href={pullUrl} target="_blank" rel="noreferrer">打开 GitHub 审核页面</a>
            </div>
          )}
        </div>
        <div className="contribution-actions">
          <button className="btn secondary" type="button" onClick={onClose}>关闭</button>
          {existing && !pullUrl && (
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                clearContribution(path);
                setExisting(null);
                setTitle(defaultTitle);
              }}
            >
              新建投稿
            </button>
          )}
          {!existing && !pullUrl && (
            <button
              className="btn secondary"
              type="button"
              onClick={toggleExisting}
            >
              {linkExisting ? '取消关联' : '关联已有 PR'}
            </button>
          )}
          {!pullUrl && (
            <button className="btn" type="submit" disabled={busy}>
              {busy ? '正在提交…' : existing || selectedBranch ? '更新 PR' : '创建 PR'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
