import { useEffect, useState } from 'react';
import { api, ApiError } from './lib/api';
import { useStore } from './lib/store';
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
import { loadPlugins } from './lib/plugins';
import { initUrlSync } from './lib/urlsync';
import { useIsMobile } from './lib/useIsMobile';

export default function App() {
  const authed = useStore((s) => s.authed);
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
  const [theme, setTheme] = useState<'theme-dark' | 'theme-light'>('theme-light');

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
    if (!authed) return;
    loadTree();
    // Deep link (/note/<path>) wins over the restored workspace's active note.
    const deepLink = initUrlSync();
    useStore
      .getState()
      .loadUiState() // restore workspace from server + open note(s)
      .then(() => {
        if (deepLink && deepLink !== useStore.getState().activePath) {
          return useStore.getState().openFile(deepLink);
        }
      })
      .catch(() => {});
    api
      .getSettings()
      .then((s) => setTheme(s?.ui?.theme === 'obsidian-dark' ? 'theme-dark' : 'theme-light'))
      .catch(() => {});
    useStore.getState().loadShares(); // badge shared notes in the file tree
    loadPlugins().catch(() => {});
    // websocket live updates
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    let treeTimer: number | undefined;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'fs') {
          // coalesce bursts of fs events into a single tree refresh
          window.clearTimeout(treeTimer);
          treeTimer = window.setTimeout(() => loadTree(), 800);
        } else if (msg.type === 'uistate') {
          // another tab/device changed the workspace → sync live
          useStore.getState().applyRemoteState(msg.state, msg.originId);
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      window.clearTimeout(treeTimer);
      ws.close();
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
      <div className={appCls}>
        <Ribbon onTheme={() => setTheme((t) => (t === 'theme-dark' ? 'theme-light' : 'theme-dark'))} />
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
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
