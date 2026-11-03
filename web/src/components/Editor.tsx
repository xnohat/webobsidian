import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import {captureContext,executeCommand,commands as toolbarCommands} from '../lib/toolbar/registry';
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import DocOutline from './DocOutline';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine, drawSelection, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { defaultKeymap, simplifySelection, history, historyKeymap } from '@codemirror/commands';
import { editorStructure, outlineMarkdown, persistentFolding } from '../lib/editorStructure';
import { search, searchKeymap } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import {nativeFencedCodeLanguages,nativeFencedCodeHighlightStyle} from '../lib/nativeCodeLanguages';
import { syntaxHighlighting } from '@codemirror/language';
import { obsidianHighlightStyle, literalAngleColors } from '../lib/highlight';
import { useStore, documentSessions } from '../lib/store';
import {useVaultPreferences} from '../lib/vaultPreferences';
import type { TreeNode } from '../lib/api';
import { obsidianKeymap } from '../lib/editorCommands';
import Icon from './Icon';
import { suggesterPlugin, setLinkSuggestFiles, setTagSuggestTags } from '../lib/suggest';
import {
  livePreviewPlugin,
  livePreviewState,
  livePreviewTheme,
  frontmatterField,
  tableField,
  htmlBlockField,
  markdownEmbedField,
  mermaidField,
  displayMathField,
  htmlRenderedState,
  htmlPreviewField,
  calloutFoldState,
  calloutFoldDeco,
  noteTitleField,
  inlineTitleField,
  editorClickFix,
  mediaLoadRemeasure,
  livePreviewGeometryGuard,
  livePreviewReadonly,
  setLivePreviewReadonly,
  setLivePreviewEnabled,
  setLivePreviewLinkHandler,
  setLivePreviewMenuHandler,
  setLivePreviewImageDeleteHandler,
  setLivePreviewNotePath,
  setLivePreviewNoteEmbedProvider,
  setLivePreviewPropertyProvider,
  setLivePreviewPropertyTypes,
  setLivePreviewPropertyTypeSetter,
  setLivePreviewTagProvider,
  setNoteTitle,
} from '../lib/livePreview';
import { renderNoteEmbed } from '../lib/markdown';
import { getActiveEditor, setActiveEditor } from '../lib/activeEditor';
import { selectionToolbar } from '../lib/selectionToolbar';
import { api } from '../lib/api';
import { humanizeTitle } from '../lib/title';
import { deleteEmbeddedImage } from '../lib/imageDelete';
import {noteFragmentRange} from '../lib/noteFragments';

const titleOf = (path: string | null) => (path ? humanizeTitle(path) : '');
const subscribeDocumentScope = (listener:()=>void) => {
  window.addEventListener('draft-status',listener);
  window.addEventListener('draft-scope-change',listener);
  return ()=>{window.removeEventListener('draft-status',listener);window.removeEventListener('draft-scope-change',listener);};
};

// Reading mode = the same Live Preview editor, made read-only via this compartment.
const readonlyExt = (reading: boolean) =>
  reading ? [EditorView.editable.of(false), EditorState.readOnly.of(true)] : [];

/** A locked note is read-only for the same reason a reading pane is: no keystrokes land in it. */
const isReadonly = (viewMode: string, locked: boolean) => viewMode === 'reading' || locked;

export default function Editor() {
  const languageRevision = useLanguage().revision;

  const preferences=useVaultPreferences();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  useEffect(()=>{view.current?.requestMeasure()},[preferences.values.baseFontSize]);
  const readonlyComp = useRef(new Compartment()).current;
  const applyingExternal = useRef(false);
  const activePath = useStore((s) => s.activePath);
  const documentScope=useSyncExternalStore(subscribeDocumentScope,()=>activePath?documentSessions.get(activePath)?.key.scopeId??'':'',()=> '');
  const content = useStore((s) => s.content);
  const setContent = useStore((s) => s.setContent);
  const save = useStore((s) => s.save);
  const viewMode = useStore((s) => s.viewMode);
  const locked = useStore((s) => s.locked);
  const lockReason = useStore((s) => s.lockReason);
  const unlockMode = useStore((s) => s.unlockMode);
  const unlockLocked = useStore((s) => s.unlockLocked);
  const showInlineTitle = useStore((s) => s.showInlineTitle);
  const openWikilink = useStore((s) => s.openWikilink);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const setLeftPanel = useStore((s) => s.setLeftPanel);
  const tree = useStore((s) => s.tree);
  const noteNavigation=useStore(s=>s.noteNavigation);

  useEffect(() => {
    setLivePreviewLinkHandler(openWikilink);
  }, [openWikilink]);

  // Trash icon on a rendered image: drop the reference from the note and delete
  // the attachment file too — unless another note (or another spot in this one)
  // still uses it, in which case the user may remove just this reference.
  useEffect(() => {
    setLivePreviewImageDeleteHandler(deleteEmbeddedImage);
  }, []);

  useEffect(() => {
    setLivePreviewMenuHandler(openContextMenu);
    setLivePreviewPropertyProvider(() => api.properties().then((r) => r.properties).catch(() => []));
    setLivePreviewTagProvider(() => api.tags().then((r) => r.tags.map((t) => t.tag)).catch(() => []));
    // ![[note]] transclusion: resolve + render with the same pipeline as Reading.
    const resolveEmbed = async (target: string, from?: string,kind:'wiki'|'markdown'='wiki') => {
      try {
        const { path } = await api.resolve(target, from,kind);
        if (!path) return null;
        if(!/\.(md|markdown)$/i.test(path))return null;
        const r = await api.read(path);
        return { path, content: typeof r === 'string' ? r : r.content };
      } catch {
        return null;
      }
    };
    setLivePreviewNoteEmbedProvider((target,kind) => renderNoteEmbed(target, {
      rawUrl: (p, from) => api.rawUrl(p, from), resolveEmbed,
      sourcePath: useStore.getState().activePath ?? undefined,
    },0,kind));
  }, [openContextMenu]);

  // Feed the `[[` link suggester (vault file paths) and the `#` tag suggester.
  useEffect(() => {
    const files: string[] = [];
    const walk = (n: TreeNode) => {
      if (n.type === 'file') files.push(n.path);
      n.children?.forEach(walk);
    };
    if (tree) walk(tree);
    setLinkSuggestFiles(() => files);
  }, [tree]);
  useEffect(() => {
    let tags: string[] = [];
    api
      .tags()
      .then((r) => {
        tags = r.tags.map((t) => t.tag.replace(/^#/, ''));
      })
      .catch(() => {});
    setTagSuggestTags(() => tags);
  }, [activePath]);

  // Load the vault's property type registry (.obsidian/types.json) once.
  useEffect(() => {
    setLivePreviewPropertyTypeSetter((key, type) => api.setPropertyType(key, type).then((r) => r.types));
    api
      .propertyTypes()
      .then((r) => {
        setLivePreviewPropertyTypes(r.types);
        const v = view.current;
        if (v) v.dispatch({ effects: setLivePreviewEnabled.of(v.state.field(livePreviewState)) });
      })
      .catch(() => {});
  }, []);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const v=view.current;if(!v)return;
    const ctx=captureContext(v);
    const group=(label:string,ids:string[])=>({label,submenu:ids.map(id=>{
      const c=toolbarCommands.find(x=>x.id==='editing-toolbar:'+id)!;
      return {label:c.label,disabled:!c.getState(ctx).enabled,onClick:()=>{void executeCommand(c.id,ctx);}};
    })});
    openContextMenu({x:e.clientX,y:e.clientY,items:[
      group('Format',['toggle-bold','toggle-italics','toggle-strikethrough','toggle-highlight','underline','editor:toggle-code','format-eraser']),
      group('Paragraph',['header1-text','header2-text','header3-text','header4-text','header5-text','header6-text','header0-text','toggle-bullet-list','toggle-numbered-list','editor:toggle-checklist-status','editor:toggle-blockquote']),
      group('Insert',['editor:insert-wikilink','insert-link','editor:insert-embed','insert-callout','editor:insert-table','codeblock','hrline','editor:insert-tag','editor:attach-file']),
      ...['editor-cut','editor-copy','editor-paste'].map(id=>{const c=toolbarCommands.find(x=>x.id==='editing-toolbar:'+id)!;return {label:c.label,disabled:!c.getState(ctx).enabled,onClick:()=>{void executeCommand(c.id,ctx);}};}),
      {get label() {return uiText("webobsidian.select-all-913aff");},onClick:()=>v.dispatch({selection:{anchor:0,head:v.state.doc.length}})},
    ]});
  };

  // (Re)create the view when the active file changes.
  useEffect(() => {
    if (!host.current) return;
    view.current?.destroy();
    setLivePreviewNotePath(activePath);

    const isMd = activePath ? /\.(md|markdown)$/i.test(activePath) : false;
    // Place the caret after the frontmatter so Properties render immediately.
    const fmMatch = isMd ? content.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/) : null;
    const initPos = Math.min(fmMatch ? fmMatch[0].length : 0, content.length);
    const state = EditorState.create({
      doc: content,
      selection: { anchor: initPos },
      extensions: [
        history(),
        drawSelection(),
        // VS Code-style multi-cursor: Alt+Click adds a cursor, Shift+Alt+Drag = column selection.
        EditorState.allowMultipleSelections.of(true),
        EditorView.clickAddsSelectionRange.of((e) => e.altKey && !e.shiftKey),
        rectangularSelection({ eventFilter: (e) => e.altKey && e.shiftKey && e.button === 0 }),
        crosshairCursor({ key: 'Alt' }),
        highlightActiveLine(),
        // Obsidian default hotkeys (§4) win over CodeMirror's defaults.
        Prec.high(
          keymap.of(
            obsidianKeymap({
              openLink: (t) => void openWikilink(t),
              togglePreview: () =>
                useStore.getState().setViewMode(useStore.getState().viewMode === 'reading' ? 'live' : 'reading'),
              save: () => { void useStore.getState().save().catch(() => {}); },
            }),
          ),
        ),
        // In-document Find/Replace (⌘F / ⌘⇧F open the panel; ⌘G next).
        search({ top: true }),
        keymap.of([{ key: 'Escape', run: simplifySelection }, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        editorStructure,
        persistentFolding(documentScope,activePath??''),
        // GFM base so Strikethrough/Table/TaskList nodes exist (Obsidian dialect);
        // Fence grammars follow the native editor's tokenization and palette.
        // YAML front matter (--- … ---) is parsed as YAML; the rest stays Markdown.
        yamlFrontmatter({ content: markdown({ base: markdownLanguage, codeLanguages: nativeFencedCodeLanguages,extensions:[outlineMarkdown] }) }),
        suggesterPlugin,
        // Obsidian token palette via CSS vars (works in both themes); markdown
        // structure styling is owned by the Live Preview decorations.
        syntaxHighlighting(obsidianHighlightStyle),
        syntaxHighlighting(nativeFencedCodeHighlightStyle),
        literalAngleColors,
        EditorView.lineWrapping,
        ...(isMd ? selectionToolbar : []),
        // Live Preview drives BOTH live and reading; reading is just read-only.
        livePreviewState.init(() => isMd && viewMode !== 'source'),
        livePreviewReadonly.init(() => viewMode === 'reading'),
        readonlyComp.of(readonlyExt(isReadonly(viewMode, locked))),
        noteTitleField.init(() => titleOf(activePath)),
        inlineTitleField,
        frontmatterField,
        tableField,
        htmlBlockField,
        markdownEmbedField,
        mermaidField,
        displayMathField,
        htmlRenderedState,
        htmlPreviewField,
        calloutFoldState,
        calloutFoldDeco,
        livePreviewPlugin,
        livePreviewTheme,
        editorClickFix,
        mediaLoadRemeasure,
        livePreviewGeometryGuard,
        EditorView.domEventHandlers({focus:(_event,v)=>{setActiveEditor(v);}}),
        EditorView.updateListener.of((u) => {
          // Ignore doc changes we applied programmatically (external content sync)
          if (u.docChanged && !applyingExternal.current) setContent(u.state.doc.toString());
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    setEditorView(v);
    setActiveEditor(v);
    // Don't steal focus from the file tree's inline rename box (double-click on a
    // note that isn't open yet opens it, then enters rename).
    if (!useStore.getState().renamingPath) v.focus();
    return () => {
      if(getActiveEditor()===v)setActiveEditor(null);
      v.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath,documentScope]);

  // Sync the editor doc when `content` changes from OUTSIDE the editor — e.g. the
  // active note's content arrives asynchronously after reload/hydrate, or is
  // pushed by cross-tab sync. (User typing changes content too, but then the doc
  // already equals content, so this is a no-op.)
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current === content) return;
    applyingExternal.current = true;
    const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/);
    const initPos = Math.min(fmMatch ? fmMatch[0].length : 0, content.length);
    v.dispatch({
      changes: { from: 0, to: current.length, insert: content },
      selection: { anchor: initPos },
    });
    applyingExternal.current = false;
  }, [content]);

  // Toggle live preview / readonly when the view mode changes (no recreate).
  useEffect(() => {
    const isMd = activePath ? /\.(md|markdown)$/i.test(activePath) : false;
    view.current?.dispatch({
      effects: [
        setLivePreviewEnabled.of(isMd && viewMode !== 'source'),
        setLivePreviewReadonly.of(isReadonly(viewMode, locked)),
        readonlyComp.reconfigure(readonlyExt(isReadonly(viewMode, locked))),
        setNoteTitle.of(showInlineTitle ? titleOf(activePath) : ''),
      ],
    });
  }, [viewMode, activePath, showInlineTitle, locked]);

  // A request belongs to the file-opening transaction, not to a later document.
  // CodeMirror reveals the real measured position and unfolds a containing fold.
  useEffect(()=>{
    const v=view.current,request=noteNavigation;
    if(!v||!request||request.path!==activePath)return;
    const frame=requestAnimationFrame(()=>{
      if(view.current!==v||useStore.getState().noteNavigation!==request)return;
      const range=noteFragmentRange(v.state.doc.toString(),request.fragment);if(!range)return;
      if(!request.fragment){v.dispatch({selection:{anchor:0}});v.scrollDOM.scrollTop=0;return}
      v.dispatch({selection:{anchor:range.from},effects:EditorView.scrollIntoView(range.from,{y:'start',yMargin:12})});
    });
    return ()=>cancelAnimationFrame(frame);
  },[noteNavigation,activePath,editorView]);

  // Debounced autosave.
  useEffect(() => {
    const id = window.setTimeout(() => { void save().catch(() => {}); }, 900);
    return () => window.clearTimeout(id);
  }, [content, save]);

  // Obsidian DOM contract (§20): markdown-source-view.cm-s-obsidian.mod-cm6
  // + .is-live-preview when Live Preview is on; readable line length caps width.
  const cls = [
    'cm-host',
    'markdown-source-view',
    'cm-s-obsidian',
    'mod-cm6',
    preferences.values.readableLineLength?'is-readable-line-width':'',
    viewMode !== 'source' ? 'is-live-preview live-preview' : '',
    viewMode === 'reading' ? 'is-reading-mode' : '',
    locked ? 'is-locked-note' : '',
  ].join(' ');
  return (
    <>
      {locked && activePath && (
        <LockBanner reason={lockReason} mode={unlockMode} onUnlock={unlockLocked} />
      )}
      <div className="cm-outline-wrap">
        <div className={cls} style={{'--font-text-size':`${preferences.values.baseFontSize??16}px`} as CSSProperties} ref={host} onContextMenu={onContextMenu} />
        {viewMode !== "source" && activePath && /\.(md|markdown)$/i.test(activePath) && (
          <DocOutline view={editorView} content={content} />
        )}
      </div>
    </>
  );
}

/**
 * The read-only banner: a locked note says who owns it, why, and how to get a change made.
 * The unlock affordance appears only when `_system/locks.json` allows one at all.
 */
function LockBanner({
  reason,
  mode,
  onUnlock,
}: {
  reason: string | null;
  mode: 'off' | 'confirm' | 'password';
  onUnlock: (password?: string) => void;
}) {
  const languageRevision = useLanguage().revision;

  const [pw, setPw] = useState('');
  return (
    <div className="lock-banner" role="status">
      <Icon name="lock" size={13} />
      <span className="lock-msg">
        <strong>{uiText("webobsidian.read-only-65834d")}</strong> {reason ?? uiText("webobsidian.this-note-is-maintained-by-the-agent-edf7ea")}
      </span>
      {mode !== "off" && (
        <span className="lock-actions">
          {mode === "password" ? (
            <>
              <input
                type="password"
                value={pw}
                placeholder={uiText("webobsidian.password-5baa61")}
                aria-label={uiText("webobsidian.unlock-password-b418b3")}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onUnlock(pw); }}
              />
              <button type="button" onClick={() => onUnlock(pw)}>{uiText("webobsidian.unlock-1526a1")}</button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    uiText("webobsidian.edit-this-note-anyway-the-agent-maintains-it-and-bc8e4e"),
                  )
                ) {
                  onUnlock();
                }
              }}
            >
              {uiText("webobsidian.edit-anyway-68f5f5")} </button>
          )}
        </span>
      )}
    </div>
  );
}
