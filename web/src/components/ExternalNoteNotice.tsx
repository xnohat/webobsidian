import {t as uiText,useLanguage} from '../lib/i18n/runtime';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { acceptResolvedDocument, documentSessions, draftScopeEpoch, isDraftScopeCurrent, useStore } from '../lib/store';
import { loadConflict, type ConflictSession } from '../lib/conflicts';
import ConflictResolver from './ConflictResolver';

/** Notify about a new server version without replacing the reader's open text. */
export default function ExternalNoteNotice() {
  useLanguage();
  const path = useStore(s => s.activePath);
  const dirty = useStore(s => s.dirty);
  const [changedPath, setChangedPath] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<ConflictSession | null>(null);
  const busyRef = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setChangedPath(null); setError(''); setConflict(null);
    const check = async () => {
      if (!path || !/\.(md|markdown)$/i.test(path) || busyRef.current) return;
      const session = documentSessions.get(path);
      if (!session) return;
      const epoch = draftScopeEpoch(), version = session.baseVersion;
      const request = ++generation.current;
      try {
        const remote = await api.read(path, session.key.scopeId);
        if (disposed || request !== generation.current || useStore.getState().activePath !== path ||
            documentSessions.get(path) !== session || session.baseVersion !== version ||
            !isDraftScopeCurrent(session.key.scopeId, epoch)) return;
        // A save in this tab can publish the fs event before its HTTP reply.
        const different = remote.version !== session.baseVersion && remote.content !== session.baseContent &&
          remote.content !== useStore.getState().content;
        setChangedPath(different ? path : null);
      } catch { /* A failed background check is not evidence of a changed file. */ }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { void check(); }, 200);
    };
    const filesystem = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      if (!detail?.path || detail.path === path) schedule();
    };
    const visible = () => { if (document.visibilityState === 'visible') schedule(); };
    const saved = () => { if (path && documentSessions.get(path)?.state === 'saved') schedule(); };
    const invalidated = () => { generation.current++; setChangedPath(null); setConflict(null); setError(''); };
    window.addEventListener('wo-fs', filesystem);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('draft-status', saved);
    window.addEventListener('draft-scope-change', invalidated);
    const interval = setInterval(visible, 30_000);
    schedule();
    return () => {
      disposed = true; generation.current++; clearTimeout(timer); clearInterval(interval);
      window.removeEventListener('wo-fs', filesystem);
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('draft-status', saved);
      window.removeEventListener('draft-scope-change', invalidated);
    };
  }, [path]);

  const session = path ? documentSessions.get(path) : undefined;
  const localChanges = dirty || !!session && session.state !== 'saved';
  const refresh = async () => {
    if (!path || !session || busyRef.current) return;
    const epoch = draftScopeEpoch(), revision = session.revision, version = session.baseVersion;
    const request = ++generation.current;
    const current = () => request === generation.current && useStore.getState().activePath === path &&
      documentSessions.get(path) === session && isDraftScopeCurrent(session.key.scopeId, epoch);
    busyRef.current = true; setBusy(true); setError('');
    try {
      if (localChanges) {
        await session.flush();
        const comparison = await loadConflict(session.record());
        if (!current()) return;
        if (session.revision !== revision || session.baseVersion !== version) {
          setError(uiText("webobsidian.external-text-changed"));
          return;
        }
        setConflict(comparison);
      } else {
        // Read again on click: the version that triggered the indicator may
        // already have been superseded by another external edit.
        const remote = await api.read(path, session.key.scopeId);
        if (!current()) return;
        if (session.revision !== revision || session.baseVersion !== version || useStore.getState().dirty ||
            session.state !== 'saved') {
          setError(uiText("webobsidian.external-local-edits"));
          return;
        }
        if (!remote.version) throw new Error('Missing content version');
        acceptResolvedDocument(path, remote.content, remote.version);
        setChangedPath(null);
      }
    } catch {
      if (current()) setError(uiText("webobsidian.external-reload-failed"));
    } finally {
      busyRef.current = false; setBusy(false);
    }
  };

  if (!path || changedPath !== path) return null;
  return <>
    <div className="external-note-notice" role="status">
      <span>{uiText("webobsidian.external-file-changed")}{localChanges ? uiText("webobsidian.external-compare-versions") : uiText("webobsidian.external-reload-hint")}</span>
      <button className="btn secondary" disabled={busy} onClick={() => void refresh()}>
        {busy ? uiText("webobsidian.external-checking") : localChanges ? uiText("webobsidian.external-compare") : uiText("webobsidian.external-reload")}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
    {conflict && <ConflictResolver session={conflict} onClose={() => { setConflict(null); window.dispatchEvent(new Event('focus')); }} />}
  </>;
}
