import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import {
  clearContribution,
  loadContribution,
  saveContribution,
} from '../lib/drafts';

interface Props {
  path: string;
  onClose: () => void;
}

export default function ContributionDialog({ path, onClose }: Props) {
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
  const [manualBranch, setManualBranch] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await save();
      const content = useStore.getState().content;
      const updateBranch = (existing?.branch ?? manualBranch.trim()) || undefined;
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
      });
      setExisting({
        branch: result.branch,
        pullNumber: result.pullNumber,
        pullUrl: result.pullUrl,
        title,
      });
      setPullUrl(result.pullUrl);
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
          <h2>{existing ? `更新 PR #${existing.pullNumber}` : manualBranch ? '更新已有 PR' : '提交审核'}</h2>
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
              <span>已有投稿分支</span>
              <input
                className="text-input"
                value={manualBranch}
                placeholder="contrib/20260819-3e98d0f0"
                pattern="contrib/\d{8}-[a-f0-9]{8}"
                required
                onChange={(event) => setManualBranch(event.target.value.trim())}
              />
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
              onClick={() => {
                setLinkExisting((value) => !value);
                setManualBranch('');
              }}
            >
              {linkExisting ? '取消关联' : '关联已有 PR'}
            </button>
          )}
          {!pullUrl && (
            <button className="btn" type="submit" disabled={busy}>
              {busy ? '正在提交…' : existing || manualBranch ? '更新 PR' : '创建 PR'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
