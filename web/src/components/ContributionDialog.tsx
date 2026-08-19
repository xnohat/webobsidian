import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

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
  const [title, setTitle] = useState(defaultTitle);
  const [contributorName, setContributorName] = useState(
    () => localStorage.getItem('uscwiki-editor:contributor-name') ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pullUrl, setPullUrl] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await save();
      const content = useStore.getState().content;
      const result = await api.submitContribution({
        title,
        contributor: { name: contributorName },
        files: [{ path, content }],
      });
      localStorage.setItem('uscwiki-editor:contributor-name', contributorName);
      setPullUrl(result.pullUrl);
      notify(`PR #${result.pullNumber} 已创建，等待审核`, 5000);
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
          <h2>提交审核</h2>
          <p className="contribution-help">
            系统会使用统一贡献账号创建分支，并向主仓库的 <code>contributions</code> 分支发起 PR；不会直接修改 <code>main</code>。
          </p>
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
              PR 已创建：<a href={pullUrl} target="_blank" rel="noreferrer">打开 GitHub 审核页面</a>
            </div>
          )}
        </div>
        <div className="contribution-actions">
          <button className="btn secondary" type="button" onClick={onClose}>关闭</button>
          {!pullUrl && <button className="btn" type="submit" disabled={busy}>{busy ? '正在提交…' : '创建 PR'}</button>}
        </div>
      </form>
    </div>
  );
}
