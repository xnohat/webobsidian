import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useStore, GRAPH_PATH, TASKS_PATH, isViewPath, type ContextMenuItem } from '../lib/store';
import { api } from '../lib/api';
import Editor from './Editor';
import CodeFileView from './CodeFileView';
import PdfFileView from './PdfFileView';
import {resolveCodeLanguage} from '../lib/codeFiles';
import Preview from './Preview';
import GraphView from './GraphView';
import CanvasView from './CanvasView';
import FolderView from './FolderView';
import TasksView from './TasksView';
import { isFolderPath, treeFilePaths } from '../lib/tree';
import { formatInternalLink } from '../lib/vaultLinks';
import { getVaultPreferences } from '../lib/vaultPreferences';
import Icon from './Icon';
import StatusBar from './StatusBar';
import FormatToolbar from './FormatToolbar';
import ExternalNoteNotice from './ExternalNoteNotice';
import { useIsMobile } from '../lib/useIsMobile';
import { editorFind, getActiveEditor } from '../lib/activeEditor';
import { triggerAddProperty } from '../lib/livePreview';
import { pathToUrl } from '../lib/urlsync';
import { fileViewKind, extLabel } from '../lib/media';

function EditorPane() {
  const languageRevision = useLanguage().revision;

  const activePath = useStore((s) => s.activePath);
  const pdfFragment=useStore(s=>s.tabs.find(t=>t.path===s.activePath)?.pdfFragment??'');
  const viewMode = useStore((s) => s.viewMode);
  const codeSettings=useStore(s=>s.codeFileViewer);
  const codeResult=useStore(s=>s.codeFileResult);
  const override=useStore(s=>s.codeEditorOverride);
  const language=activePath?resolveCodeLanguage(activePath,codeSettings):null;
  if(activePath&&language&&override!==activePath&&codeResult?.path!==activePath)return <div className="attachment-card">{uiText("webobsidian.loading-code-664a3b")}</div>;
  if(activePath&&language&&override!==activePath&&codeResult?.path===activePath)return <CodeFileView path={activePath} result={codeResult} language={language} lineNumbers={codeSettings.lineNumbers}/>;
  if(activePath&&!language&&!/\.(md|markdown|txt|json|csv|canvas|css|js|ya?ml)$/i.test(activePath)&&fileViewKind(activePath)==='text')return <div className="attachment-card"><a href={api.downloadUrl(activePath)}>{uiText("dialogue.button-download")}</a></div>;
  const kind = activePath ? fileViewKind(activePath) : 'text';

  if (activePath && kind === 'canvas') {
    return <CanvasView />;
  }
  if (activePath && kind === 'image') {
    return (
      <div className="markdown-preview">
        <div className="preview-inner">
          <img src={api.rawUrl(activePath)} alt={activePath} />
        </div>
      </div>
    );
  }
  if (activePath && (kind === 'video' || kind === 'audio')) {
    return (
      <div className="markdown-preview">
        <div className="preview-inner">
          {kind === "video" ? (
            <video className="media-embed media-fileview" src={api.rawUrl(activePath)} controls preload="metadata" />
          ) : (
            <audio className="media-embed media-fileview" src={api.rawUrl(activePath)} controls preload="metadata" />
          )}
        </div>
      </div>
    );
  }
  if (activePath && kind === 'pdf') {
    return <PdfFileView path={activePath} fragment={pdfFragment}/>;
  }
  if (activePath && kind === 'attachment') {
    // FR-22: no viewer exists for this type, and the editor would render its
    // bytes as noise. Offer the file itself — the server sends it with a real
    // Content-Disposition, so it saves under its own name, extension included.
    const name = activePath.split('/').pop() ?? activePath;
    return (
      <div className="attachment-view">
        <div className="attachment-card">
          <Icon name="download" size={26} />
          <div className="attachment-name">{name}</div>
          <p className="attachment-hint">
            {extLabel(name)} {uiText("webobsidian.files-open-outside-the-vault-download-it-and-ope-fc4182")} </p>
          <a className="attachment-download" href={api.downloadUrl(activePath)}>
            <Icon name="download" size={15} />
            {uiText("dialogue.button-download")} </a>
        </div>
      </div>
    );
  }
  // Reading mode = the same Live Preview editor in read-only (identical render).
  void viewMode;
  return <Editor />;
}

export default function Workspace() {
  const languageRevision = useLanguage().revision;

  const locked = useStore((s) => s.locked);
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const openFile = useStore((s) => s.openFile);
  const closeTab = useStore((s) => s.closeTab);
  const renamePath = useStore((s) => s.renamePath);
  const deletePath = useStore((s) => s.deletePath);
  const keepTab = useStore((s) => s.keepTab);
  const dirty = useStore((s) => s.dirty);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const bookmarks = useStore((s) => s.bookmarks);
  const toggleBookmark = useStore((s) => s.toggleBookmark);
  const openToSide = useStore((s) => s.openToSide);
  const splitPath = useStore((s) => s.splitPath);
  const splitPdfFragment=useStore(s=>s.splitPdfFragment);
  const splitContent = useStore((s) => s.splitContent);
  const codeSettings=useStore(s=>s.codeFileViewer);
  const splitCodeResult=useStore(s=>s.splitCodeFileResult);
  const splitLanguage=splitPath?resolveCodeLanguage(splitPath,codeSettings):null;
  const closeSplit = useStore((s) => s.closeSplit);
  const content = useStore((s) => s.content);
  const setContent = useStore((s) => s.setContent);
  const notify = useStore((s) => s.notify);
  const toggleLeft = useStore((s) => s.toggleLeft);
  const toggleRight = useStore((s) => s.toggleRight);
  const setMobileDrawer = useStore((s) => s.setMobileDrawer);
  const isMobile = useIsMobile();
  const newNote = useStore((s) => s.newNote);
  const goBack = useStore((s) => s.goBack);
  const goForward = useStore((s) => s.goForward);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const setMovePath = useStore((s) => s.setMovePath);
  const setRightPanel = useStore((s) => s.setRightPanel);
  const setShareDialog = useStore((s) => s.setShareDialog);
  const setVersionHistory = useStore((s) => s.setVersionHistory);
  const revealInTree = useStore((s) => s.revealInTree);
  const loadTree = useStore((s) => s.loadTree);
  const splitDirection = useStore((s) => s.splitDirection);
  const tree = useStore((s) => s.tree);
  const activeIsFolder = isFolderPath(tree, activePath);
  const histIndex = useStore((s) => s.histIndex);
  const historyLen = useStore((s) => s.history.length);
  const canGoBack = histIndex > 0;
  const canGoForward = histIndex < historyLen - 1;

  const isMd = activePath ? /\.(md|markdown)$/i.test(activePath) : false;
  const isShareable = activePath ? /\.(md|markdown|canvas)$/i.test(activePath) : false;
  const canSplit = activePath ? resolveCodeLanguage(activePath,codeSettings)!==null || /\.(md|markdown|txt|json|csv|canvas|css|js|ya?ml)$/i.test(activePath) : false;

  // Obsidian's "Add file property": focus a new property-key field in the
  // Properties widget with the key suggester open (NOT a text prompt). The
  // widget only renders in Live Preview, so switch out of source/reading first.
  const addFileProperty = () => {
    if (useStore.getState().viewMode !== 'live') setViewMode('live');
    // Let the editor swap modes / mount the Properties widget, then start the add.
    window.setTimeout(() => {
      const v = getActiveEditor();
      if (v) triggerAddProperty(v);
      else notify(uiText("webobsidian.open-the-note-to-add-a-property-b43666"));
    }, 80);
  };

  // Export the rendered note via the browser's print dialog (→ Save as PDF).
  // Switch to Reading view first so the full rendered document is laid out,
  // then restore the previous mode after the dialog closes.
  const exportToPdf = () => {
    const prev = useStore.getState().viewMode;
    setViewMode('reading');
    window.setTimeout(() => {
      window.print();
      setViewMode(prev);
    }, 200);
  };

  // Per-pane "More options" (⋯) menu, like Obsidian's pane menu.
  const openMoreMenu = (e: React.MouseEvent) => {
    if (!activePath) return;
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const path = activePath;
    const baseName = path.split('/').pop() ?? path;
    const closeOthers = async () => {
      for (const tab of tabs.filter((t) => t.path !== path)) {
        if (!(await closeTab(tab.path))) break;
      }
    };
    const tabItems: ContextMenuItem[] = [
      { get label() {return uiText("webobsidian.close-tab-296b59");}, icon: 'x', onClick: () => closeTab(path) },
      { get label() {return uiText("webobsidian.close-other-tabs-1a6d5b");}, onClick: closeOthers },
    ];
    let items: ContextMenuItem[];
    if (path === GRAPH_PATH) {
      items = [
        // GraphView owns the Pixi renderer — it listens for this event and
        // extracts the stage to a PNG (a plain canvas read would be blank).
        { get label() {return uiText("plugins.graph-view.action-copy-screenshot");}, icon: 'camera', onClick: () => window.dispatchEvent(new CustomEvent('wo-graph-screenshot')) },
        { label: '', separator: true },
        ...tabItems,
      ];
    } else if (path === TASKS_PATH) {
      // Virtual view, not a file — no rename/move/copy/delete/share.
      items = [...tabItems];
    } else {
      const sep: ContextMenuItem = { label: '', separator: true };
      const renameItem: ContextMenuItem = {
        get label() {return uiText("webobsidian.rename-94ac9a");},
        icon: 'pencil',
        onClick: async () => {
          const to = prompt(uiText("webobsidian.rename-move-to-vault-relative-path-9c85cf"), path);
          if (to && to !== path) {
            await renamePath(path, to);
            await loadTree();
          }
        },
      };
      const moveItem: ContextMenuItem = {
        get label() {return uiText("webobsidian.move-file-to-ffc312");},
        icon: 'folder',
        onClick: () => setMovePath(path),
      };
      const copyItem: ContextMenuItem = {
        get label() {return uiText("plugins.file-explorer.menu-opt-make-copy");},
        icon: 'file-plus',
        onClick: async () => {
          const r = await api.read(path).catch(() => null);
          if (!r) return;
          const body = typeof r === 'string' ? r : r.content;
          const dot = path.lastIndexOf('.');
          const copyPath = dot > 0 ? `${path.slice(0, dot)} copy${path.slice(dot)}` : `${path} copy`;
          await api.write(copyPath, body);
          await loadTree();
          notify(uiText("webobsidian.made-a-copy-7728ff"));
        },
      };
      items = [
        ...(isMd ? [{ get label() {return uiText("plugins.backlinks.menu-opt-backlinks-in-document");}, icon: 'link', onClick: () => setRightPanel('backlinks') }, sep] : []),
        ...(canSplit
          ? [
              { get label() {return uiText("commands.split-right");}, icon: 'columns', onClick: () => openToSide(path, 'right') },
              { get label() {return uiText("commands.split-down");}, icon: 'rows', onClick: () => openToSide(path, 'down') },
            ]
          : []),
        { get label() {return uiText("interface.menu.open-in-new-window");}, icon: 'arrow-up-right', onClick: () => window.open(pathToUrl(path), '_blank', 'noopener') },
        sep,
        renameItem,
        moveItem,
        copyItem,
        { label: bookmarks.includes(path) ? uiText("webobsidian.remove-bookmark-7da720") : uiText("plugins.bookmarks.label-bookmark"), icon: 'bookmark', onClick: () => toggleBookmark(path) },
        ...(isMd ? [{ get label() {return uiText("webobsidian.add-file-property-94c385");}, icon: 'plus', onClick: addFileProperty }] : []),
        ...(isMd ? [{ get label() {return uiText("webobsidian.export-to-pdf-860da2");}, icon: 'file-pdf', onClick: exportToPdf }] : []),
        ...(canSplit
          ? [
              sep,
              {
                get label() {return uiText("webobsidian.find-6383e5");},
                icon: 'search',
                onClick: () => {
                  if (!editorFind()) notify(uiText("webobsidian.open-the-note-to-search-inside-it-1d417f"));
                },
              },
            ]
          : []),
        sep,
        {
          get label() {return uiText("webobsidian.copy-url-path-1d4a42");},
          onClick: () => {
            navigator.clipboard?.writeText(`${location.origin}${pathToUrl(path)}`).catch(() => {});
            notify(uiText("webobsidian.url-copied-73a9be"));
          },
        },
        { get label() {return uiText("plugins.sync.menu-opt-view-version-history");}, icon: 'clock', onClick: () => setVersionHistory(path) },
        ...(isMd
          ? [
              {
                get label() {return uiText("interface.menu.open-linked-view");},
                icon: 'arrow-up-right',
                submenu: [
                  { get label() {return uiText("plugins.backlinks.name");}, icon: 'link', onClick: () => setRightPanel('backlinks') },
                  { get label() {return uiText("webobsidian.outgoing-links-f4ba79");}, icon: 'arrow-up-right', onClick: () => setRightPanel('outgoing') },
                  { get label() {return uiText("plugins.outline.name");}, icon: 'list', onClick: () => setRightPanel('outline') },
                ],
              },
            ]
          : []),
        sep,
        {
          get label() {return uiText("plugins.file-explorer.action-reveal-file");},
          icon: 'folder',
          onClick: () => {
            revealInTree(path);
            if (isMobile) setMobileDrawer('left');
          },
        },
        ...(isShareable ? [{ get label() {return uiText("webobsidian.share-24897b");}, icon: 'globe', onClick: () => setShareDialog(path) }] : []),
        sep,
        ...tabItems,
        sep,
        {
          get label() {return uiText("dialogue.button-delete");},
          danger: true,
          icon: 'trash',
          onClick: async () => {
            if (confirm(uiText("webobsidian.delete-value0-7b7c88", {value0: baseName}))) {
              const r = await deletePath(path);
              await loadTree();
              notify(r.deleted ? uiText("webobsidian.deleted-permanently-ca75d5") : uiText("webobsidian.moved-to-trash-0987dd"));
            }
          },
        },
      ];
    }
    openContextMenu({ x: Math.round(rect.right) - 220, y: Math.round(rect.bottom) + 6, items });
  };

  // The server selects the Obsidian attachment folder and returns a relative URL.
  const handleFiles = async (files: FileList | File[]) => {
    const isNote = !!activePath && /\.(md|markdown)$/i.test(activePath);
    const uploadView = getActiveEditor();
    let uploadDoc = uploadView?.state.doc;
    let uploadSelection = uploadView?.state.selection;
    const uploadPath = activePath;
    let text = content;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const { values: preferences } = await getVaultPreferences();
        if (useStore.getState().activePath !== uploadPath || uploadView?.state.readOnly) continue;
        const { path } = await api.upload(file, undefined, uploadPath ?? '');
        const md = formatInternalLink({ sourcePath: uploadPath, targetPath: path, embed: true, preferences, knownPaths: treeFilePaths(useStore.getState().tree) });
        if(useStore.getState().activePath!==uploadPath || (uploadView && (uploadView!==getActiveEditor() || uploadView.state.readOnly || uploadView.state.doc!==uploadDoc))) {notify(uiText("webobsidian.uploaded-07ff78")+path+uiText("webobsidian.-document-changed-insert-the-link-manually-0eb16a"));continue;}
        const ed = isNote ? uploadView : null;
        if (ed) {
          const { from, to } = (uploadSelection ?? ed.state.selection).main;
          ed.dispatch({ changes: { from, to, insert: `${md}\n` }, selection: { anchor: from + md.length + 1 }, userEvent: 'input.paste' });
          uploadDoc=ed.state.doc; uploadSelection=ed.state.selection;
        } else {
          text += `\n${md}\n`;
          setContent(text);
        }
        notify(uiText("webobsidian.inserted-value0-dac12f", {value0: path}));
      } catch (e: any) {
        notify(e.message);
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (imgs.length) {
      e.preventDefault();
      handleFiles(imgs);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.files.length) {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="workspace" onPaste={onPaste} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <div className="tab-bar">
        <span
          className="tab-new tab-ctl"
          title={isMobile ? uiText("webobsidian.open-menu-197101") : uiText("webobsidian.toggle-left-sidebar-e0b102")}
          onClick={() => (isMobile ? setMobileDrawer('left') : toggleLeft())}
        >
          <Icon name={isMobile ? 'menu' : 'panel-left'} size={isMobile ? 20 : 16} />
        </span>
        <div className="tab-scroll">
          {tabs.map((t) => (
            <div
              key={t.path}
              className={`tab ${activePath === t.path ? 'active' : ''} ${t.preview ? 'preview' : ''}`}
              onClick={() => openFile(t.path)}
              onDoubleClick={() => keepTab(t.path)}
              onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); void closeTab(t.path); } }}
              title={t.preview ? uiText("webobsidian.-value0-preview-double-click-to-keep-open-c07eae", {value0: t.path}) : t.path}
            >
              {t.path === GRAPH_PATH && (
                <Icon name="graph" size={13} style={{ marginRight: 4, flexShrink: 0 }} />
              )}
              {t.path === TASKS_PATH && (
                <Icon name="check-square" size={13} style={{ marginRight: 4, flexShrink: 0 }} />
              )}
              <span className="title">{t.title.replace(/\.(md|markdown)$/, '')}</span>
              {dirty && activePath === t.path ? (
                <span className="dot">●</span>
              ) : (
                <span
                  className="close"
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeTab(t.path);
                  }}
                >
                  <Icon name="x" size={14} />
                </span>
              )}
            </div>
          ))}
        </div>
        <span
          className="tab-new tab-ctl"
          title={uiText("webobsidian.new-note-n-5f4099")}
          onClick={() => newNote()}
        >
          <Icon name="plus" size={16} />
        </span>
        <span className="grow" style={{ flex: 1 }} />
        <span
          className="tab-new tab-ctl"
          title={uiText("commands.toggle-right-sidebar")}
          onClick={() => (isMobile ? setMobileDrawer('right') : toggleRight())}
        >
          <Icon name="panel-right" size={isMobile ? 20 : 16} />
        </span>
      </div>

      {activePath && (
        <div className="view-header">
          <button className="tool-btn" title={uiText("webobsidian.back-b52b36")} disabled={!canGoBack} onClick={goBack}>
            <Icon name="arrow-left" size={18} />
          </button>
          <button className="tool-btn" title={uiText("plugins.web-viewer.action-forward")} disabled={!canGoForward} onClick={goForward}>
            <Icon name="arrow-right" size={18} />
          </button>
          <span className="grow" />
          <span className="crumbs">
            {activePath === GRAPH_PATH
              ? uiText("plugins.graph-view.name")
              : activePath === TASKS_PATH
              ? uiText("webobsidian.tasks-090ec5")
              : activePath.split('/').map((seg, i) => (
                  <span key={i}>
                    {i > 0 && <span className="sep">/</span>}
                    {seg.replace(/\.(md|markdown)$/, '')}
                  </span>
                ))}
          </span>
          <span className="grow" />
          {isMd && (
            <>
              <button className={`tool-btn ${bookmarks.includes(activePath) ? 'active' : ''}`} title={uiText("plugins.bookmarks.label-bookmark")} onClick={() => toggleBookmark(activePath)}>
                <Icon name="bookmark" size={16} />
              </button>
              {!isMobile && (
                <button className="tool-btn" title={uiText("interface.menu.open-to-the-right")} onClick={() => openToSide(activePath)}>
                  <Icon name="columns" size={16} />
                </button>
              )}
              <div className="seg">
                <button className={viewMode === 'source' ? 'active' : ''} onClick={() => setViewMode('source')} title={uiText("setting.editor.option-properties-source")}>
                  {uiText("setting.editor.option-properties-source")} </button>
                <button className={viewMode === 'live' ? 'active' : ''} onClick={() => setViewMode('live')} title={uiText("webobsidian.live-preview-131a90")}>
                  {uiText("webobsidian.live-65c821")} </button>
                <button className={viewMode === 'reading' ? 'active' : ''} onClick={() => setViewMode('reading')} title={uiText("plugins.editor-status.read")}>
                  {uiText("plugins.editor-status.read")} </button>
              </div>
            </>
          )}
          {!activeIsFolder && (
            <button className="tool-btn" title={uiText("interface.menu.more-options")} onClick={openMoreMenu}>
              <Icon name="more-horizontal" size={18} />
            </button>
          )}
        </div>
      )}

      {!isMobile && activePath && !isViewPath(activePath) && isMd && viewMode !== "reading" && (
        <FormatToolbar key={activePath} disabled={locked} />
      )}

      {isMd && <ExternalNoteNotice key={`external-note:${activePath}`} />}

      <div className={`editor-area ${splitDirection === 'down' ? 'split-down' : ''}`}>
        {!activePath && (
          <div className="empty-state">
            <div>
              <div className="big">
                <Icon name="file-text" size={48} />
              </div>
              <p>{uiText("webobsidian.no-file-is-open-pick-a-note-or-press-o-40acb8")}</p>
            </div>
          </div>
        )}
        {activePath === GRAPH_PATH && (
          <div className="pane main-pane">
            <GraphView />
          </div>
        )}
        {activePath === TASKS_PATH && (
          <div className="pane main-pane">
            <TasksView />
          </div>
        )}
        {activePath && !isViewPath(activePath) && activeIsFolder && (
          <div className="pane main-pane">
            <FolderView path={activePath} />
          </div>
        )}
        {activePath && !isViewPath(activePath) && !activeIsFolder && (
          <div className="pane main-pane">
            <EditorPane />
          </div>
        )}
        {splitPath && (
          <div className="pane split-pane">
            <div className="split-head">
              <span className="crumbs">{splitPath}</span>
              <span className="grow" />
              <button className="tool-btn" onClick={closeSplit} title={uiText("webobsidian.close-split-1024a7")}>
                <Icon name="x" size={16} />
              </button>
            </div>
            {/\.pdf$/i.test(splitPath)?<PdfFileView path={splitPath} fragment={splitPdfFragment}/>:splitLanguage?(splitCodeResult?.path===splitPath?<CodeFileView pane="split" path={splitPath} result={splitCodeResult} language={splitLanguage} lineNumbers={codeSettings.lineNumbers}/>:<div className="attachment-card">{uiText("webobsidian.loading-code-664a3b")}</div>):/\.(md|markdown|txt|json|csv|canvas|css|js|ya?ml)$/i.test(splitPath)?<Preview source={splitContent} sourcePath={splitPath}/>:<div className="attachment-card"><a href={api.downloadUrl(splitPath)}>{uiText("dialogue.button-download")}</a></div>}
          </div>
        )}
      </div>
      {isMobile && activePath && !isViewPath(activePath) && isMd && viewMode !== "reading" && (
        <FormatToolbar key={activePath} mobile disabled={locked} />
      )}
      <StatusBar />
    </div>
  );
}
