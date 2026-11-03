import {t as uiText, useLanguage} from "./lib/i18n/runtime";
import DraftRecovery from './components/DraftRecovery';
import {loadServerLanguage} from './lib/i18n/server';
import { useEffect, useState } from 'react';
import { api, ApiError } from './lib/api';
import { useStore,resetDraftScope } from './lib/store';
import Login from './components/Login';
import ForceChangePassword from './components/ForceChangePassword';
import Ribbon from './components/Ribbon';
import Sidebar from './components/Sidebar';
import RightSidebar from './components/RightSidebar';
import Workspace from './components/Workspace';
import CommandPalette from './components/CommandPalette';
import Settings from './components/Settings';
import ShareDialog from './components/ShareDialog';
import VersionHistory from './components/VersionHistory';
import TrashView from './components/TrashView';
import ContextMenu from './components/ContextMenu';
import FolderPicker from './components/FolderPicker';
import TemplatePicker from './components/TemplatePicker';
import ConfirmDialog from './components/ConfirmDialog';
import { loadPlugins,stopPlugins } from './lib/plugins';
import { restoreWorkspaceFromUrl } from './lib/urlsync';
import { useIsMobile } from './lib/useIsMobile';
import { themeClass } from './lib/theme';
import {applyIndexStatus,refreshIndexStatus,resetIndexStatus,useIndexStatus,indexStatusMessage} from './lib/indexStatus';

export default function App() {
  const languageRevision = useLanguage().revision;

  const authed = useStore((s) => s.authed);
  useEffect(() => {
    if (!authed) return;
    const load = () => {void loadServerLanguage().catch(() => useStore.getState().notify('Could not load the server language. Open Language settings to retry.'));};
    load();
    window.addEventListener('focus',load);
    return () => window.removeEventListener('focus',load);
  },[authed]);
  const setAuthed = useStore((s) => s.setAuthed);
  const mustChangePassword = useStore((s) => s.mustChangePassword);
  const setMustChangePassword = useStore((s) => s.setMustChangePassword);
  const loadTree = useStore((s) => s.loadTree);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const mobileDrawer = useStore((s) => s.mobileDrawer);
  const setMobileDrawer = useStore((s) => s.setMobileDrawer);
  const activePath = useStore((s) => s.activePath);
  const isMobile = useIsMobile();
  const setPalette = useStore((s) => s.setPalette);
  const save = useStore((s) => s.save);
  const toast = useStore((s) => s.toast);
  const [checking, setChecking] = useState(true);
  const {status:indexStatus}=useIndexStatus();
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setMustChangePassword(Boolean(r.mustChangePassword));
        setAuthed(true);
      })
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) console.error(e);
      })
      .finally(() => setChecking(false));
  }, [setAuthed, setMustChangePassword]);

  useEffect(() => {
    if (!authed) {resetDraftScope();resetIndexStatus();return;}
    const treeReady=loadTree();
    // Deep link (/note/<path>) wins over the restored workspace's active note.
    const codeSettingsReady=api.getSettings().then(s=>{useStore.setState({codeFileViewer:s.ui.codeFileViewer??useStore.getInitialState().codeFileViewer});}).catch(()=>{useStore.setState({codeFileViewer:{...useStore.getInitialState().codeFileViewer,enabled:false}});useStore.getState().notify(uiText("webobsidian.could-not-load-code-viewer-settings-reload-to-re-f53504"),10000);});
    const workspaceReady=restoreWorkspaceFromUrl(async()=>{
      await codeSettingsReady;
      await useStore.getState().loadUiState(true);
    });
    api
      .getSettings()
      .then((s) => {
        setTheme(themeClass(s?.ui?.theme));
        useStore.getState().setShowInlineTitle(s?.ui?.showInlineTitle !== false);
      })
      .catch(() => {});
    useStore.getState().loadShares(); // badge shared notes in the file tree
    const pluginReady=Promise.all([treeReady,workspaceReady]).then(()=>{if(!useStore.getState().tree)throw new Error('Vault tree could not be restored');});
    void loadPlugins(pluginReady);
    const pluginScopeChange=()=>{void stopPlugins().then(()=>loadPlugins(Promise.all([loadTree(),useStore.getState().loadUiState(true)])));};
    window.addEventListener('draft-scope-change',pluginScopeChange);
    // websocket live updates. Reconnects with backoff: the socket drops on every
    // redeploy, laptop sleep or proxy idle-timeout, and without this live updates
    // silently stopped until a full reload. After a reconnect the tree is reloaded
    // once, since fs events may have been missed while disconnected.
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws: WebSocket | undefined;
    let treeTimer: number | undefined;
    let retryTimer: number | undefined;
    let retryDelay = 1000;
    let hadConnection = false;
    let closed = false;
    const onMessage = (ev: MessageEvent) => {
      if(closed)return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'fs') {
          // coalesce bursts of fs events into a single tree refresh
          window.clearTimeout(treeTimer);
          treeTimer = window.setTimeout(() => loadTree(), 800);
          // let other views (e.g. the Tasks board) react to the raw event themselves
          window.dispatchEvent(new CustomEvent('wo-fs', { detail: msg }));
        } else if (msg.type === 'index') {
          applyIndexStatus(msg.status);
        } else if (msg.type === 'uistate') {
          // another tab/device changed the workspace → sync live
          useStore.getState().applyRemoteState(msg.state, msg.originId);
        }
      } catch {
        /* ignore */
      }
    };
    const connect = () => {
      if (closed) return;
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => {
        retryDelay = 1000;
        refreshIndexStatus().catch(()=>{});
        if (hadConnection) loadTree();
        hadConnection = true;
      };
      ws.onmessage = onMessage;
      ws.onclose = () => {
        if (closed) return;
        retryTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      };
    };
    connect();
    return () => {
      closed = true;
      window.removeEventListener('draft-scope-change',pluginScopeChange);
      void stopPlugins();
      window.clearTimeout(treeTimer);
      window.clearTimeout(retryTimer);
      ws?.close();
    };
  }, [authed, loadTree]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      const s = useStore.getState();
      if (k === 'p') { e.preventDefault(); setPalette(true, e.shiftKey ? 'commands' : 'commands'); }
      else if (k === 'o') { e.preventDefault(); setPalette(true, 'files'); }
      else if (k === 's') { e.preventDefault(); save(); }
      else if (k === 'n') { e.preventDefault(); s.newNote(); }
      else if (k === 'e') { e.preventDefault(); s.setViewMode(s.viewMode === 'reading' ? 'live' : 'reading'); }
      else if (k === 'f' && e.shiftKey) { e.preventDefault(); s.setLeftPanel('search'); }
      else if (k === '\\') { e.preventDefault(); s.toggleLeft(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPalette, save]);

  // Mobile: close the overlay drawer once a note is opened (tap note → read it).
  useEffect(() => {
    if (isMobile && useStore.getState().mobileDrawer) setMobileDrawer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  // Mobile: edge-swipe to open/close the drawers (Obsidian Mobile gesture).
  useEffect(() => {
    if (!isMobile) return;
    let sx = 0, sy = 0, fromLeftEdge = false, fromRightEdge = false, tracking = false;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY;
      fromLeftEdge = sx <= 28;
      fromRightEdge = sx >= window.innerWidth - 28;
      tracking = true;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 45 || Math.abs(dy) > Math.abs(dx)) return; // mostly-horizontal only
      const open = useStore.getState().mobileDrawer;
      if (dx > 0) {
        if (open === 'right') setMobileDrawer(null);
        else if (fromLeftEdge && !open) setMobileDrawer('left');
      } else {
        if (open === 'left') setMobileDrawer(null);
        else if (fromRightEdge && !open) setMobileDrawer('right');
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isMobile, setMobileDrawer]);

  if (checking) return <div className={theme} style={{ height: '100%' }} />;
  if (!authed) return <div className={theme}><Login onAuthed={() => setAuthed(true)} /></div>;
  // Signed in but still on the default password → block the app until it's changed.
  if (mustChangePassword) return <div className={theme}><ForceChangePassword /></div>;

  // On mobile the sidebars are overlay drawers (always mounted, slid in/out by
  // CSS), driven by the device-local `mobileDrawer` state — not the persisted
  // leftOpen/rightOpen that sync across desktops.
  const showLeft = isMobile || leftOpen;
  const showRight = isMobile || rightOpen;
  const appCls = [
    'app',
    leftOpen ? '' : 'left-closed',
    rightOpen ? '' : 'right-closed',
    isMobile ? 'mobile' : '',
    isMobile && mobileDrawer === 'left' ? 'drawer-left-open' : '',
    isMobile && mobileDrawer === 'right' ? 'drawer-right-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={theme}>
      {indexStatusMessage(indexStatus)&&<div role="status" style={{position:'fixed',bottom:28,right:16,zIndex:60,maxWidth:360,padding:'6px 10px',background:'var(--background-secondary)',border:'1px solid var(--background-modifier-border)',borderRadius:6,fontSize:12}}>{indexStatusMessage(indexStatus)}</div>}
      <div className={appCls}>
        <Ribbon onTheme={() => setTheme(theme === 'theme-dark' ? 'theme-light' : 'theme-dark')} />
        {showLeft && <Sidebar />}
        <Workspace />
        {showRight && <RightSidebar />}
        {isMobile && mobileDrawer && (
          <div className="drawer-backdrop" onClick={() => setMobileDrawer(null)} />
        )}
      </div>
      <CommandPalette />
      <Settings />
      <ShareDialog />
      <VersionHistory />
      <TrashView />
      <ContextMenu />
      <FolderPicker />
      <TemplatePicker />
      <ConfirmDialog />
      <DraftRecovery />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
