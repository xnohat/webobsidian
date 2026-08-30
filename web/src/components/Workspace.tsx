import { useEffect } from 'react';
import { useStore, GRAPH_PATH, type ContextMenuItem } from '../lib/store';
import { api } from '../lib/api';
import Editor from './Editor';
import Preview from './Preview';
import GraphView from './GraphView';
import CanvasView from './CanvasView';
import FolderView from './FolderView';
import { addDraftAssetToTree, findNode, isFolderPath } from '../lib/tree';
import Icon from './Icon';
import StatusBar from './StatusBar';
import FormatToolbar from './FormatToolbar';
import { useIsMobile } from '../lib/useIsMobile';
import { editorFind, getActiveEditor } from '../lib/activeEditor';
import { triggerAddProperty } from '../lib/livePreview';
import { pathToUrl } from '../lib/urlsync';
import { VIDEO_EXT_RE, AUDIO_EXT_RE } from '../lib/media';
import { contributionMode } from '../lib/mode';
import { isCreatedNote } from '../lib/drafts';
import {
  CONTRIBUTION_IMAGE_RE,
  MAX_DRAFT_IMAGE_BYTES,
  draftAssetsForNote,
  saveDraftAsset,
} from '../lib/draftAssets';
import { vaultAssetUrl } from '../lib/assetUrl';

function EditorPane() {
  const activePath = useStore((s) => s.activePath);
  const tree = useStore((s) => s.tree);
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
          <img src={vaultAssetUrl(tree, activePath, activePath)} alt={activePath} />
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
  const toggleRight = useStore((s) => s.toggleRight);
  const setMobileDrawer = useStore((s) => s.setMobileDrawer);
  const isMobile = useIsMobile();
  const newNote = useStore((s) => s.newNote);
  const createNote = useStore((s) => s.createNote);
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
    } else if (contributionMode && isCreatedNote(path)) {
      const sep: ContextMenuItem = { label: '', separator: true };
      items = [
        ...(canSplit
          ? [
              { label: 'Split right', icon: 'columns', onClick: () => openToSide(path, 'right') },
              { label: 'Split down', icon: 'rows', onClick: () => openToSide(path, 'down') },
              sep,
            ]
          : []),
        ...(isMd ? [{ label: 'Add file property', icon: 'plus', onClick: addFileProperty }] : []),
        ...(isMd ? [{ label: 'Export to PDF…', icon: 'file-pdf', onClick: exportToPdf }] : []),
        {
          label: 'Copy URL path',
          onClick: () => {
            navigator.clipboard?.writeText(`${location.origin}${pathToUrl(path)}`).catch(() => {});
            notify('URL copied');
          },
        },
        {
          label: 'Reveal file in navigation',
          icon: 'folder',
          onClick: () => revealInTree(path),
        },
        sep,
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
  const handleContributionFiles = async (files: File[], targetDir?: string) => {
    let imported = 0;
    for (const file of files) {
      try {
      const safeName = file.name
        .trim()
        .replace(/[\\/\u0000-\u001f]/g, '-')
        .replace(/[\[\]#|^]/g, '-');
      if (!safeName || safeName.startsWith('.') || safeName === '..') {
        notify('文件名无效');
        continue;
      }

      if (/\.(md|markdown)$/i.test(safeName)) {
        if (file.size > 256 * 1024) {
          notify(`${safeName} 超过 256 KiB，无法导入`);
          continue;
        }
        const current = useStore.getState();
        const activeNode = current.activePath ? findNode(current.tree, current.activePath) : null;
        const activeDir = activeNode?.type === 'folder'
          ? activeNode.path
          : current.activePath?.includes('/')
            ? current.activePath.slice(0, current.activePath.lastIndexOf('/'))
            : '';
        const dir = targetDir || activeDir || current.tree?.path || 'docs';
        const path = uniqueImportedPath(current.tree, dir, safeName);
        await createNote(path, await file.text());
        imported++;
        continue;
      }

      if (CONTRIBUTION_IMAGE_RE.test(safeName)) {
        const current = useStore.getState();
        const notePath = current.activePath;
        if (!notePath || !/\.(md|markdown)$/i.test(notePath)) {
          notify('请先打开一个 Markdown 文档，再拖入图片');
          continue;
        }
        if (file.size > MAX_DRAFT_IMAGE_BYTES) {
          notify(`${safeName} 超过 2 MiB，无法导入`);
          continue;
        }
        const existingAssets = await draftAssetsForNote(notePath);
        if (existingAssets.length >= 19) {
          notify('一个投稿最多包含 19 个图片附件');
          continue;
        }
        if (existingAssets.reduce((total, asset) => total + asset.size, 0) + file.size > 5 * 1024 * 1024) {
          notify('当前文档的投稿附件总大小不能超过 5 MiB');
          continue;
        }
        const noteDir = notePath.slice(0, notePath.lastIndexOf('/'));
        const attachmentDir = `${noteDir}/attachments`;
        const path = uniqueImportedPath(current.tree, attachmentDir, safeName);
        await saveDraftAsset({
          path,
          notePath,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          blob: file,
        });
        if (current.tree) {
          useStore.setState({ tree: addDraftAssetToTree(current.tree, path) });
        }
        const separator = current.content.endsWith('\n') || current.content.length === 0 ? '' : '\n';
        const importedName = path.slice(path.lastIndexOf('/') + 1);
        useStore.getState().setContent(`${current.content}${separator}![[${importedName}]]\n`);
        imported++;
        continue;
      }

      notify(`${safeName} 不是支持的 Markdown 或图片文件`);
      } catch (cause) {
        notify(cause instanceof Error ? cause.message : `${file.name} 导入失败`);
      }
    }
    if (imported) {
      try {
        await useStore.getState().save();
        notify(`已导入 ${imported} 个文件，将随投稿 PR 一起提交`);
      } catch (cause) {
        notify(cause instanceof Error ? cause.message : '导入的文件无法保存');
      }
    }
  };

  const handleFiles = async (files: FileList | File[], targetDir?: string) => {
    if (contributionMode) {
      await handleContributionFiles(Array.from(files), targetDir);
      return;
    }
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

  useEffect(() => {
    const onImport = (event: Event) => {
      const detail = (event as CustomEvent<{ files: File[]; targetDir?: string }>).detail;
      if (detail?.files?.length) void handleFiles(detail.files, detail.targetDir);
    };
    window.addEventListener('wo-import-files', onImport);
    return () => window.removeEventListener('wo-import-files', onImport);
  });
  const onPaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (imgs.length) {
      e.preventDefault();
      void handleFiles(imgs);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.files.length) {
      e.preventDefault();
      void handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="workspace" onPaste={onPaste} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <div className="tab-bar">
        {isMobile && (
          <span
            className="tab-new tab-ctl"
            title="Open menu"
            onClick={() => setMobileDrawer('left')}
          >
            <Icon name="menu" size={20} />
          </span>
        )}
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

function uniqueImportedPath(tree: import('../lib/api').TreeNode | null, dir: string, name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let candidate = `${dir}/${name}`;
  for (let index = 1; importedNameExists(tree, dir, candidate.slice(dir.length + 1)); index++) {
    candidate = `${dir}/${stem} ${index}${extension}`;
  }
  return candidate;
}

function importedNameExists(
  tree: import('../lib/api').TreeNode | null,
  dir: string,
  name: string,
): boolean {
  const folder = dir === tree?.path ? tree : findNode(tree, dir);
  return (folder?.children ?? []).some((child) => child.name.toLowerCase() === name.toLowerCase());
}
