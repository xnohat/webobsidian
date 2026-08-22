import { useStore, GRAPH_PATH, type ContextMenuItem } from '../lib/store';
import { api } from '../lib/api';
import Editor from './Editor';
import Preview from './Preview';
import GraphView from './GraphView';
import CanvasView from './CanvasView';
import FolderView from './FolderView';
import { isFolderPath } from '../lib/tree';
import Icon from './Icon';
import StatusBar from './StatusBar';
import FormatToolbar from './FormatToolbar';
import { useIsMobile } from '../lib/useIsMobile';
import { editorFind, getActiveEditor } from '../lib/activeEditor';
import { triggerAddProperty } from '../lib/livePreview';
import { pathToUrl } from '../lib/urlsync';
import { VIDEO_EXT_RE, AUDIO_EXT_RE } from '../lib/media';

function EditorPane() {
  const activePath = useStore((s) => s.activePath);
  const viewMode = useStore((s) => s.viewMode);
  const isMd = activePath ? /\.(md|markdown)$/i.test(activePath) : false;
  const isImage = activePath ? /\.(png|jpe?g|gif|svg|webp)$/i.test(activePath) : false;
  const isCanvas = activePath ? /\.canvas$/i.test(activePath) : false;
  const isVideo = activePath ? VIDEO_EXT_RE.test(activePath) : false;
  const isAudio = activePath ? AUDIO_EXT_RE.test(activePath) : false;

  if (activePath && isCanvas) {
    return <CanvasView />;
  }
  if (activePath && isImage) {
    return (
      <div className="markdown-preview">
        <div className="preview-inner">
          <img src={api.rawUrl(activePath)} alt={activePath} />
        </div>
      </div>
    );
  }
  if (activePath && (isVideo || isAudio)) {
    return (
      <div className="markdown-preview">
        <div className="preview-inner">
          {isVideo ? (
            <video className="media-embed media-fileview" src={api.rawUrl(activePath)} controls preload="metadata" />
          ) : (
            <audio className="media-embed media-fileview" src={api.rawUrl(activePath)} controls preload="metadata" />
          )}
        </div>
      </div>
    );
  }
  // Reading mode = the same Live Preview editor in read-only (identical render).
  void isMd;
  void viewMode;
  return <Editor />;
}

export default function Workspace() {
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const openFile = useStore((s) => s.openFile);
  const closeTab = useStore((s) => s.closeTab);
  const dirty = useStore((s) => s.dirty);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const bookmarks = useStore((s) => s.bookmarks);
  const toggleBookmark = useStore((s) => s.toggleBookmark);
  const openToSide = useStore((s) => s.openToSide);
  const splitPath = useStore((s) => s.splitPath);
  const splitContent = useStore((s) => s.splitContent);
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
  const canSplit = activePath ? /\.(md|markdown|txt|json|csv|canvas|css|js|ya?ml)$/i.test(activePath) : false;

  // Obsidian's "Add file property": focus a new property-key field in the
  // Properties widget with the key suggester open (NOT a text prompt). The
  // widget only renders in Live Preview, so switch out of source/reading first.
  const addFileProperty = () => {
    if (useStore.getState().viewMode !== 'live') setViewMode('live');
    // Let the editor swap modes / mount the Properties widget, then start the add.
    window.setTimeout(() => {
      const v = getActiveEditor();
      if (v) triggerAddProperty(v);
      else notify('Open the note to add a property');
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
    const closeOthers = () => tabs.filter((t) => t.path !== path).forEach((t) => closeTab(t.path));
    const tabItems: ContextMenuItem[] = [
      { label: 'Close tab', icon: 'x', onClick: () => closeTab(path) },
      { label: 'Close other tabs', onClick: closeOthers },
    ];
    let items: ContextMenuItem[];
    if (path === GRAPH_PATH) {
      items = [
        // GraphView owns the Pixi renderer — it listens for this event and
        // extracts the stage to a PNG (a plain canvas read would be blank).
        { label: 'Copy screenshot', icon: 'camera', onClick: () => window.dispatchEvent(new CustomEvent('wo-graph-screenshot')) },
        { label: '', separator: true },
        ...tabItems,
      ];
    } else {
      const sep: ContextMenuItem = { label: '', separator: true };
      const renameItem: ContextMenuItem = {
        label: 'Rename…',
        icon: 'pencil',
        onClick: async () => {
          const to = prompt('Rename / move to (vault-relative path):', path);
          if (to && to !== path) {
            await api.rename(path, to);
            closeTab(path);
            await loadTree();
            await openFile(to);
          }
        },
      };
      const moveItem: ContextMenuItem = {
        label: 'Move file to…',
        icon: 'folder',
        onClick: () => setMovePath(path),
      };
      const copyItem: ContextMenuItem = {
        label: 'Make a copy',
        icon: 'file-plus',
        onClick: async () => {
          const r = await api.read(path).catch(() => null);
          if (!r) return;
          const body = typeof r === 'string' ? r : r.content;
          const dot = path.lastIndexOf('.');
          const copyPath = dot > 0 ? `${path.slice(0, dot)} copy${path.slice(dot)}` : `${path} copy`;
          await api.write(copyPath, body);
          await loadTree();
          notify('Made a copy');
        },
      };
      items = [
        ...(isMd ? [{ label: 'Backlinks in document', icon: 'link', onClick: () => setRightPanel('backlinks') }, sep] : []),
        ...(canSplit
          ? [
              { label: 'Split right', icon: 'columns', onClick: () => openToSide(path, 'right') },
              { label: 'Split down', icon: 'rows', onClick: () => openToSide(path, 'down') },
            ]
          : []),
        { label: 'Open in new window', icon: 'arrow-up-right', onClick: () => window.open(pathToUrl(path), '_blank', 'noopener') },
        sep,
        renameItem,
        moveItem,
        copyItem,
        { label: bookmarks.includes(path) ? 'Remove bookmark' : 'Bookmark', icon: 'bookmark', onClick: () => toggleBookmark(path) },
        ...(isMd ? [{ label: 'Add file property', icon: 'plus', onClick: addFileProperty }] : []),
        ...(isMd ? [{ label: 'Export to PDF…', icon: 'file-pdf', onClick: exportToPdf }] : []),
        ...(canSplit
          ? [
              sep,
              {
                label: 'Find…',
                icon: 'search',
                onClick: () => {
                  if (!editorFind()) notify('Open the note to search inside it');
                },
              },
            ]
          : []),
        sep,
        {
          label: 'Copy URL path',
          onClick: () => {
            navigator.clipboard?.writeText(`${location.origin}${pathToUrl(path)}`).catch(() => {});
            notify('URL copied');
          },
        },
        { label: 'Open version history', icon: 'clock', onClick: () => setVersionHistory(path) },
        ...(isMd
          ? [
              {
                label: 'Open linked view',
                icon: 'arrow-up-right',
                submenu: [
                  { label: 'Backlinks', icon: 'link', onClick: () => setRightPanel('backlinks') },
                  { label: 'Outgoing links', icon: 'arrow-up-right', onClick: () => setRightPanel('outgoing') },
                  { label: 'Outline', icon: 'list', onClick: () => setRightPanel('outline') },
                ],
              },
            ]
          : []),
        sep,
        {
          label: 'Reveal file in navigation',
          icon: 'folder',
          onClick: () => {
            revealInTree(path);
            if (isMobile) setMobileDrawer('left');
          },
        },
        ...(isShareable ? [{ label: 'Share…', icon: 'globe', onClick: () => setShareDialog(path) }] : []),
        sep,
        ...tabItems,
        sep,
        {
          label: 'Delete',
          danger: true,
          icon: 'trash',
          onClick: async () => {
            if (confirm(`Delete "${baseName}"?`)) {
              const r = await api.remove(path);
              closeTab(path);
              await loadTree();
              notify(r.deleted ? 'Deleted permanently' : 'Moved to trash');
            }
          },
        },
      ];
    }
    openContextMenu({ x: Math.round(rect.right) - 220, y: Math.round(rect.bottom) + 6, items });
  };

  // Paste / drop image → upload to attachments and insert an embed.
  const handleFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const { path } = await api.upload(file);
        setContent(`${content}\n![[${path}]]\n`);
        notify(`Inserted ${path}`);
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
          title={isMobile ? 'Open menu' : 'Toggle left sidebar (⌘\\)'}
          onClick={() => (isMobile ? setMobileDrawer('left') : toggleLeft())}
        >
          <Icon name={isMobile ? 'menu' : 'panel-left'} size={isMobile ? 20 : 16} />
        </span>
        <div className="tab-scroll">
          {tabs.map((t) => (
            <div
              key={t.path}
              className={`tab ${activePath === t.path ? 'active' : ''}`}
              onClick={() => openFile(t.path)}
              onAuxClick={(e) => e.button === 1 && closeTab(t.path)}
              title={t.path}
            >
              {t.path === GRAPH_PATH && (
                <Icon name="graph" size={13} style={{ marginRight: 4, flexShrink: 0 }} />
              )}
              <span className="title">{t.title.replace(/\.(md|markdown)$/, '')}</span>
              {dirty && activePath === t.path ? (
                <span className="dot">●</span>
              ) : (
                <span
                  className="close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.path);
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
          title="New note (⌘N)"
          onClick={() => newNote()}
        >
          <Icon name="plus" size={16} />
        </span>
        <span className="grow" style={{ flex: 1 }} />
        <span
          className="tab-new tab-ctl"
          title="Toggle right sidebar"
          onClick={() => (isMobile ? setMobileDrawer('right') : toggleRight())}
        >
          <Icon name="panel-right" size={isMobile ? 20 : 16} />
        </span>
      </div>

      {activePath && (
        <div className="view-header">
          <button className="tool-btn" title="Back" disabled={!canGoBack} onClick={goBack}>
            <Icon name="arrow-left" size={18} />
          </button>
          <button className="tool-btn" title="Forward" disabled={!canGoForward} onClick={goForward}>
            <Icon name="arrow-right" size={18} />
          </button>
          <span className="grow" />
          <span className="crumbs">
            {activePath === GRAPH_PATH
              ? 'Graph view'
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
              <button className={`tool-btn ${bookmarks.includes(activePath) ? 'active' : ''}`} title="Bookmark" onClick={() => toggleBookmark(activePath)}>
                <Icon name="bookmark" size={16} />
              </button>
              {!isMobile && (
                <button className="tool-btn" title="Open to the right" onClick={() => openToSide(activePath)}>
                  <Icon name="columns" size={16} />
                </button>
              )}
              <div className="seg">
                <button className={viewMode === 'source' ? 'active' : ''} onClick={() => setViewMode('source')} title="Source">
                  Source
                </button>
                <button className={viewMode === 'live' ? 'active' : ''} onClick={() => setViewMode('live')} title="Live preview">
                  Live
                </button>
                <button className={viewMode === 'reading' ? 'active' : ''} onClick={() => setViewMode('reading')} title="Reading">
                  Reading
                </button>
              </div>
            </>
          )}
          {!activeIsFolder && (
            <button className="tool-btn" title="More options" onClick={openMoreMenu}>
              <Icon name="more-horizontal" size={18} />
            </button>
          )}
        </div>
      )}

      {!isMobile && activePath && activePath !== GRAPH_PATH && isMd && viewMode !== 'reading' && (
        <FormatToolbar />
      )}

      <div className={`editor-area ${splitDirection === 'down' ? 'split-down' : ''}`}>
        {!activePath && (
          <div className="empty-state">
            <div>
              <div className="big">
                <Icon name="file-text" size={48} />
              </div>
              <p>No file is open — pick a note, or press ⌘O</p>
            </div>
          </div>
        )}
        {activePath === GRAPH_PATH && (
          <div className="pane main-pane">
            <GraphView />
          </div>
        )}
        {activePath && activePath !== GRAPH_PATH && activeIsFolder && (
          <div className="pane main-pane">
            <FolderView path={activePath} />
          </div>
        )}
        {activePath && activePath !== GRAPH_PATH && !activeIsFolder && (
          <div className="pane main-pane">
            <EditorPane />
          </div>
        )}
        {splitPath && (
          <div className="pane split-pane">
            <div className="split-head">
              <span className="crumbs">{splitPath}</span>
              <span className="grow" />
              <button className="tool-btn" onClick={closeSplit} title="Close split">
                <Icon name="x" size={16} />
              </button>
            </div>
            <Preview source={splitContent} />
          </div>
        )}
      </div>
      {isMobile && activePath && activePath !== GRAPH_PATH && isMd && viewMode !== 'reading' && (
        <FormatToolbar mobile />
      )}
      <StatusBar />
    </div>
  );
}
