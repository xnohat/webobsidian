import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api, type GitCommit } from '../lib/api';
import Icon from './Icon';

/** Git-backed version history for a single note (PRD FR-4 / FR-7). Lists the
 *  commits that touched the file and lets you preview/restore an older version. */
export default function VersionHistory() {
  const languageRevision = useLanguage().revision;

  const path = useStore((s) => s.versionHistoryPath);
  const close = useStore((s) => s.setVersionHistory);
  const notify = useStore((s) => s.notify);
  const openFile = useStore((s) => s.openFile);
  const activePath = useStore((s) => s.activePath);

  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!path) return;
    setLoading(true);
    setError('');
    setSelected(null);
    setPreview('');
    api
      .gitLog(path)
      .then((r) => {
        setCommits(r.commits);
        if (r.commits[0]) setSelected(r.commits[0].hash);
      })
      .catch((e) => setError(e.message || uiText("webobsidian.failed-to-load-history-47b413")))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    if (!path || !selected) return;
    api
      .gitShow(selected, path)
      .then((r) => setPreview(r.content))
      .catch(() => setPreview('(could not load this version)'));
  }, [path, selected]);

  if (!path) return null;

  const restore = async () => {
    if (!selected) return;
    if (!confirm(uiText("webobsidian.restore-this-version-the-current-content-will-be-62a1d6"))) return;
    try {
      await api.write(path, preview);
      if (path === activePath) await openFile(path);
      notify(uiText("webobsidian.restored-earlier-version-fea4c2"));
      close(null);
    } catch (e: any) {
      notify(e.message || uiText("webobsidian.restore-failed-c848a6"));
    }
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  return (
    <div className="modal-bg" onClick={() => close(null)}>
      <div className="modal version-history" onClick={(e) => e.stopPropagation()}>
        <div className="vh-head">
          <Icon name="clock" size={16} />
          <div className="vh-title">{uiText("plugins.sync.label-version-history")}</div>
          <div className="vh-path">{path}</div>
          <button className="tool-btn" title={uiText("interface.menu.close")} onClick={() => close(null)}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="vh-body">
          <div className="vh-list">
            {loading && <div className="vh-empty">{uiText("webobsidian.loading-33ce41")}</div>}
            {error && <div className="vh-empty">{error}</div>}
            {!loading && !error && commits.length === 0 && (
              <div className="vh-empty">{uiText("webobsidian.no-history-enable-git-sync-to-track-versions-d2dff9")}</div>
            )}
            {commits.map((c, i) => (
              <div
                key={c.hash}
                className={`vh-item ${selected === c.hash ? 'active' : ''}`}
                onClick={() => setSelected(c.hash)}
              >
                <div className="vh-item-msg">
                  {i === 0 ? uiText("webobsidian.latest-decd7c") : c.message || '(no message)'}
                </div>
                <div className="vh-item-meta">
                  {fmtDate(c.date)} · {c.author}
                </div>
              </div>
            ))}
          </div>
          <div className="vh-preview">
            <pre>{preview}</pre>
          </div>
        </div>
        <div className="vh-foot">
          <button className="btn secondary" onClick={() => close(null)}>
            {uiText("interface.menu.close")} </button>
          <button className="btn" onClick={restore} disabled={!selected || commits.length === 0}>
            {uiText("webobsidian.restore-this-version-86a899")} </button>
        </div>
      </div>
    </div>
  );
}
