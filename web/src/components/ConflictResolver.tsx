import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import {useVisualViewport} from '../lib/useVisualViewport';
import { useEffect, useRef, useState } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, historyKeymap } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { unifiedMergeView } from '@codemirror/merge';
import { canDiff, persistConflictResult, saveConflictResult, loadConflict, type ConflictSession } from '../lib/conflicts';
import { ApiError } from '../lib/api';
import {acceptResolvedDocument,isDraftScopeCurrent, useStore } from '../lib/store';
export default function ConflictResolver({ session, onClose }: {
    session: ConflictSession;
    onClose: () => void;
}) {
  const languageRevision = useLanguage().revision;

    const viewport=useVisualViewport();
    const dialog=useRef<HTMLElement>(null);
    const busyRef=useRef(false);
    const closeRef=useRef(onClose);closeRef.current=onClose;
    const editable = useRef(new Compartment());
    const host = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const [copyPath, setCopyPath] = useState(session.source.path.replace(/(\.[^.]+)$/, '-recovered$1'));
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [remote, setRemote] = useState(session.remoteContent), [generation, setGeneration] = useState(0);
    useEffect(() => {
        if (!host.current)
            return;
        const diff = !/\.canvas$/i.test(session.source.path) && remote !== null && canDiff(remote) && canDiff(session.result);
        const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: session.result, extensions: [editable.current.of(EditorState.readOnly.of(false)), history(), keymap.of(historyKeymap), EditorView.lineWrapping, ...(diff ? unifiedMergeView({ original: remote!, diffConfig: { scanLimit: 500 }, mergeControls: true }) : []), EditorView.updateListener.of(update => { if (update.docChanged) {
                        session.result = update.state.doc.toString();
                        void persistConflictResult(session).catch(e => setError(uiText("webobsidian.local-save-failed-dbf50c") + String(e)));
                    } })] }) });
        viewRef.current = view;
        view.focus();
        return () => { viewRef.current = null; view.destroy(); };
    }, [generation]);
    useEffect(()=>{busyRef.current=busy;},[busy]);
    useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const focus=(event:FocusEvent)=>{if(dialog.current&&!dialog.current.contains(event.target as Node))viewRef.current?.focus();};const keys=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(!busyRef.current)void persistConflictResult(session).then(()=>closeRef.current()).catch(e=>setError(String(e)));}else if(event.key==='Tab'&&dialog.current){const elements=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[contenteditable="true"]'));const first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};document.addEventListener('focusin',focus);document.addEventListener('keydown',keys,true);return()=>{document.removeEventListener('focusin',focus);document.removeEventListener('keydown',keys,true);if(previous?.isConnected)previous.focus();};},[session]);
    useEffect(() => { viewRef.current?.dispatch({ effects: editable.current.reconfigure(EditorState.readOnly.of(busy)) }); }, [busy, generation]);
    const save = async (copy: boolean) => {
        if (busy)
            return;
        setBusy(true);
        setError('');
        try {
            const path = copy ? copyPath : session.source.path;
            if (!path.trim())
                throw new Error(uiText("webobsidian.enter-a-path-for-the-copy-0fcdc5"));
            const receipt=await saveConflictResult(session, path, copy);
            if(!isDraftScopeCurrent(session.source.scopeId,session.scopeEpoch))return;
            const current = useStore.getState();
            // The original editor may contain further edits: acknowledge only the captured content.
            if (!copy && current.activePath === path && (!current.dirty || current.content === session.source.content)) {
                acceptResolvedDocument(path,receipt.content,receipt.version!);
            }
            else if (copy)
                current.notify(uiText("webobsidian.recovered-copy-saved-d17f7e") + path);
            if(receipt.cleanupWarning)current.notify(receipt.cleanupWarning,7000);
            onClose();
        }
        catch (e) {
            if (e instanceof ApiError && e.status === 409) {
                try {
                    const newer = await loadConflict(session.source);
                    session.remoteContent = newer.remoteContent;
                    session.remoteVersion = newer.remoteVersion;
                    setRemote(newer.remoteContent);
                    setGeneration(v => v + 1);
                    setError(uiText("webobsidian.server-changed-again-review-the-new-comparison-b-1bbca3"));
                }
                catch (refreshError) {
                    setError(uiText("webobsidian.could-not-refresh-comparison-701c9f") + String(refreshError));
                }
            }
            else
                setError(String(e));
        }
        finally {
            setBusy(false);
        }
    };
    return <div className="draft-dialog-bg" style={{inset:'auto',left:viewport.left,top:viewport.top,width:viewport.width,height:viewport.height}}><section ref={dialog} style={{maxHeight:Math.max(0,viewport.height-16),maxWidth:Math.max(0,viewport.width-16)}} className="draft-dialog" role="dialog" aria-modal="true" aria-label={uiText("webobsidian.resolve-conflict-8b7233")}><h2>{uiText("webobsidian.review-recovered-text-962d8a")} {session.source.path}</h2>
 {remote===null?<p className="draft-deleted-notice" role="status">{uiText("webobsidian.original-file-was-deleted-this-browser-copy-has-a31f2e")}</p>:<p>{uiText("webobsidian.compare-this-browser-copy-with-the-file-in-your-8f378e")}</p>}
 <details><summary>{uiText("webobsidian.base-version-0faebd")}</summary><pre>{session.source.baseContent}</pre></details><details><summary>{uiText("webobsidian.local-version-da5268")}</summary><pre>{session.source.content}</pre></details><details><summary>{uiText("webobsidian.server-version-254631")}{remote === null ? uiText("webobsidian.-deleted-cfcf98") : ''}</summary><pre>{remote}</pre></details>
 {(!canDiff(session.result) || /\.canvas$/i.test(session.source.path)) && <p>{uiText("webobsidian.whole-document-editor-for-canvas-choose-a-comple-e4b816")}</p>}
 <fieldset disabled={busy}><button disabled={remote===null} onClick={() => { session.result = remote ?? ''; setGeneration(v => v + 1); void persistConflictResult(session).catch(e => setError(String(e))); }}>{uiText("webobsidian.use-server-text-ad99fc")}</button><div ref={host} className="conflict-editor"/></fieldset>
 {error && <p role="alert">{error}</p>}<label>{uiText("interface.menu.copy-path")} <input aria-label={uiText("webobsidian.recovered-copy-path-6717b7")} value={copyPath} onChange={e => setCopyPath(e.target.value)} disabled={busy}/></label><footer><button disabled={busy||remote===null} onClick={() => void save(false)}>{uiText("webobsidian.save-result-20d5d6")}</button><button disabled={busy} onClick={() => void save(true)}>{uiText("webobsidian.save-a-copy-9056f9")}</button><button disabled={busy} onClick={() => { void persistConflictResult(session).then(onClose).catch(e => setError(String(e))); }}>{uiText("webobsidian.later-56e2f5")}</button></footer></section></div>;
}
