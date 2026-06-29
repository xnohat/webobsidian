import { create } from 'zustand';
import { api, type TreeNode, type ShareRecord } from './api';
import { findNode } from './tree';

/** Per-tab id so we can ignore the echo of our own server-pushed state change. */
export const CLIENT_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export type ViewMode = 'live' | 'source' | 'reading';
export type TreeSort =
  | 'name-asc' | 'name-desc'
  | 'mtime-desc' | 'mtime-asc'
  | 'ctime-desc' | 'ctime-asc';
const TREE_SORTS: TreeSort[] = ['name-asc', 'name-desc', 'mtime-desc', 'mtime-asc', 'ctime-desc', 'ctime-asc'];

/** Sentinel tab path for the Graph view (it lives in a tab, like Obsidian). */
export const GRAPH_PATH = 'graph://view';

export interface Tab {
  path: string;
  title: string;
}

/** A color group in the graph (nodes matching `query` are tinted `color`). */
export interface GraphGroup {
  query: string;
  color: string;
}

/** Persisted Graph view filters/display/forces — mirrors Obsidian's graph panel. */
export interface GraphSettings {
  // filters
  search: string;
  tags: boolean;
  attachments: boolean;
  existingOnly: boolean;
  orphans: boolean;
  // groups
  groups: GraphGroup[];
  // display (Obsidian's native ranges/defaults)
  arrows: boolean;
  textFade: number; // -3..3, default 0 — higher = labels need more zoom
  nodeSize: number; // 0.1..5, default 1
  linkThickness: number; // 0.1..5, default 1
  // forces (Obsidian's native ranges/defaults)
  centerForce: number; // 0..1, default 0.52
  repelForce: number; // 0..20, default 10
  linkForce: number; // 0..1, default 1
  linkDistance: number; // 30..500, default 250
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  search: '',
  tags: false,
  attachments: false,
  existingOnly: false,
  orphans: true,
  groups: [],
  arrows: false,
  textFade: 0,
  nodeSize: 1,
  linkThickness: 1,
  centerForce: 0.52,
  repelForce: 10,
  linkForce: 1,
  linkDistance: 250,
};

export interface ContextMenuItem {
  label: string;
  danger?: boolean;
  separator?: boolean;
  icon?: string;
  onClick?: () => void;
  submenu?: ContextMenuItem[];
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface AppState {
  authed: boolean;
  setAuthed: (v: boolean) => void;
  mustChangePassword: boolean;
  setMustChangePassword: (v: boolean) => void;

  /** Active theme wrapper class (e.g. 'theme-dark', 'theme-ctp-mocha'). */
  theme: string;
  setTheme: (t: string) => void;

  tree: TreeNode | null;
  loadTree: () => Promise<void>;

  tabs: Tab[];
  activePath: string | null;
  /** Back/forward navigation stack of visited paths (incl. GRAPH_PATH). */
  history: string[];
  histIndex: number;
  goBack: () => void;
  goForward: () => void;
  content: string;
  dirty: boolean;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;

  // expanded folders in the file tree (persisted)
  expanded: string[];
  toggleFolder: (path: string) => void;
  setExpanded: (paths: string[]) => void;
  // file tree sort order + auto-reveal active file (both persisted)
  treeSort: TreeSort;
  setTreeSort: (s: TreeSort) => void;
  autoReveal: boolean;
  toggleAutoReveal: () => void;

  // split pane (open to the side)
  splitPath: string | null;
  splitContent: string;
  /** Which edge the split pane is docked to ('right' = columns, 'down' = rows). */
  splitDirection: 'right' | 'down';
  openToSide: (path: string, direction?: 'right' | 'down') => Promise<void>;
  closeSplit: () => void;

  recent: string[];
  removeRecent: (path: string) => void;
  bookmarks: string[];
  toggleBookmark: (path: string) => void;

  /** Path(s) the "Move to…" folder picker is acting on (null = closed). An array = bulk move. */
  movePath: string | string[] | null;
  setMovePath: (path: string | string[] | null) => void;

  /** Multi-selected file/folder paths in the tree (Shift/Cmd-click); never persisted. */
  selected: string[];
  setSelected: (paths: string[]) => void;
  /** Anchor row for Shift-click range selection. */
  selectAnchor: string | null;
  setSelectAnchor: (path: string | null) => void;

  /** File/folder copied or cut, awaiting paste (session-local, never persisted). */
  clipboard: { path: string; mode: 'copy' | 'cut' } | null;
  setClipboard: (c: { path: string; mode: 'copy' | 'cut' } | null) => void;

  leftPanel: 'files' | 'search' | 'tags' | 'bookmarks';
  setLeftPanel: (p: 'files' | 'search' | 'tags' | 'bookmarks') => void;
  rightPanel: 'backlinks' | 'outgoing' | 'tags' | 'outline';
  setRightPanel: (p: 'backlinks' | 'outgoing' | 'tags' | 'outline') => void;
  /** Query pushed into the search panel (e.g. clicking a tag node in the graph). */
  searchQuery: string;
  searchFor: (q: string) => void;
  leftOpen: boolean;
  rightOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  /** Mobile-only overlay drawer; device-local (never persisted/broadcast). */
  mobileDrawer: 'left' | 'right' | null;
  setMobileDrawer: (d: 'left' | 'right' | null) => void;

  paletteOpen: boolean;
  paletteMode: 'all' | 'commands' | 'files';
  setPalette: (v: boolean, mode?: 'all' | 'commands' | 'files') => void;
  settingsOpen: boolean;
  setSettings: (v: boolean) => void;
  /** Open (true) or close (false) the Trash modal. */
  trashOpen: boolean;
  setTrash: (v: boolean) => void;
  /** Open (true) or close (false) the Graph view tab. */
  setGraph: (v: boolean) => void;
  openGraph: () => Promise<void>;
  graphSettings: GraphSettings;
  setGraphSettings: (patch: Partial<GraphSettings>) => void;
  resetGraphSettings: () => void;

  contextMenu: ContextMenuState | null;
  openContextMenu: (m: ContextMenuState) => void;
  closeContextMenu: () => void;

  /** Public share links (FR-10) — cached so the tree can badge shared notes. */
  shares: ShareRecord[];
  loadShares: () => Promise<void>;
  /** Note path whose Share dialog is open (null = closed). */
  shareDialogPath: string | null;
  setShareDialog: (path: string | null) => void;
  /** Note path whose Version history modal is open (null = closed). */
  versionHistoryPath: string | null;
  setVersionHistory: (path: string | null) => void;
  /** Expand ancestor folders + scroll the file into view in the file tree. */
  revealInTree: (path: string) => void;

  toast: string;
  /** Show a toast. ms=0 keeps it until another notify() replaces it. */
  notify: (msg: string, ms?: number) => void;

  openFile: (path: string) => Promise<void>;
  openWikilink: (target: string) => Promise<void>;
  closeTab: (path: string) => void;
  setContent: (c: string) => void;
  save: () => Promise<void>;
  createNote: (path: string, body?: string) => Promise<void>;
  /** Obsidian-style: create & open a fresh "Untitled" note (no prompt). `dir` = target folder, '' = vault root. */
  newNote: (dir?: string) => Promise<void>;
  /** Obsidian-style: create a fresh "Untitled" folder (no prompt) and start inline-renaming it. */
  newFolder: (dir?: string) => Promise<void>;
  /** Obsidian-style: create & open a fresh "Untitled.canvas" (empty JSON Canvas). `dir` = target folder. */
  newCanvas: (dir?: string) => Promise<void>;
  /** Tree path currently being inline-renamed (null = none); FileTree shows an input for it. */
  renamingPath: string | null;
  setRenamingPath: (path: string | null) => void;
  openDailyNote: () => Promise<void>;
  /** Re-fetch content for the active/split tabs (after reload or remote sync). */
  hydrate: () => Promise<void>;
  /** Load persisted workspace state from the server and apply it. */
  loadUiState: () => Promise<void>;
  /** Apply a workspace state pushed from another tab/device. */
  applyRemoteState: (state: any, originId: string) => Promise<void>;
}

const TEXT_RE = /\.(md|markdown|txt|json|csv|canvas|css|js|ya?ml)$/i;

// ---- server-side workspace persistence (shared across browsers/devices) ----
const PERSIST_KEYS = [
  'tabs', 'activePath', 'viewMode', 'expanded', 'splitPath', 'splitDirection',
  'recent', 'bookmarks', 'leftPanel', 'rightPanel', 'leftOpen', 'rightOpen', 'graphSettings',
  'treeSort', 'autoReveal',
] as const;

function pickPersisted(s: any): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of PERSIST_KEYS) o[k] = s[k];
  return o;
}

/**
 * Merge persisted graph settings over defaults. Settings saved before the move
 * to Obsidian-native slider units (all sliders were normalized 0..1) are detected
 * by linkDistance ≤ 1 — keep the filters/groups but reset display/forces.
 */
function migrateGraphSettings(gs: unknown): GraphSettings {
  if (!gs || typeof gs !== 'object') return DEFAULT_GRAPH_SETTINGS;
  const merged = { ...DEFAULT_GRAPH_SETTINGS, ...(gs as Partial<GraphSettings>) };
  if (typeof merged.linkDistance !== 'number' || merged.linkDistance <= 1) {
    const d = DEFAULT_GRAPH_SETTINGS;
    Object.assign(merged, {
      textFade: d.textFade, nodeSize: d.nodeSize, linkThickness: d.linkThickness,
      centerForce: d.centerForce, repelForce: d.repelForce, linkForce: d.linkForce,
      linkDistance: d.linkDistance,
    });
  }
  return merged;
}

function applyPersisted(s: any, set: (p: any) => void): void {
  set({
    tabs: Array.isArray(s.tabs) ? s.tabs : [],
    activePath: typeof s.activePath === 'string' ? s.activePath : null,
    viewMode: ['live', 'source', 'reading'].includes(s.viewMode) ? s.viewMode : 'live',
    expanded: Array.isArray(s.expanded) ? s.expanded : [],
    treeSort: TREE_SORTS.includes(s.treeSort) ? s.treeSort : 'name-asc',
    autoReveal: s.autoReveal === true,
    splitPath: typeof s.splitPath === 'string' ? s.splitPath : null,
    splitDirection: s.splitDirection === 'down' ? 'down' : 'right',
    recent: Array.isArray(s.recent) ? s.recent : [],
    bookmarks: Array.isArray(s.bookmarks) ? s.bookmarks : [],
    leftPanel: ['files', 'search', 'tags', 'bookmarks'].includes(s.leftPanel) ? s.leftPanel : 'files',
    rightPanel: ['backlinks', 'outgoing', 'tags', 'outline'].includes(s.rightPanel) ? s.rightPanel : 'backlinks',
    leftOpen: s.leftOpen !== false,
    rightOpen: s.rightOpen !== false,
    graphSettings: migrateGraphSettings(s.graphSettings),
  });
}

/** When true, openFile/openGraph won't push a new history entry (we're replaying one). */
let navByHistory = false;

/** Push `path` onto the back/forward stack (truncating any forward entries). */
function pushHistory(s: { history: string[]; histIndex: number }, path: string): { history: string[]; histIndex: number } {
  if (navByHistory || s.history[s.histIndex] === path) {
    return { history: s.history, histIndex: s.histIndex };
  }
  let history = [...s.history.slice(0, s.histIndex + 1), path];
  if (history.length > 100) history = history.slice(history.length - 100);
  return { history, histIndex: history.length - 1 };
}

// Only start saving after the initial load; suppress while applying remote/initial state.
let canSave = false;
let suppressSave = false;
let saveTimer: number | undefined;
let lastSaved = '';

function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const payload = pickPersisted(useStore.getState());
    const json = JSON.stringify(payload);
    if (json === lastSaved) return;
    lastSaved = json;
    api.putUiState(payload, CLIENT_ID).catch(() => {});
  }, 500);
}

export const useStore = create<AppState>()(
    (set, get) => ({
      authed: false,
      setAuthed: (v) => set({ authed: v }),
      mustChangePassword: false,
      setMustChangePassword: (v) => set({ mustChangePassword: v }),
      theme: 'theme-light',
      setTheme: (t) => set({ theme: t }),

      tree: null,
      loadTree: async () => {
        const tree = await api.tree();
        set({ tree });
      },

      tabs: [],
      activePath: null,
      history: [],
      histIndex: -1,
      goBack: () => {
        const { history, histIndex } = get();
        if (histIndex <= 0) return;
        const target = history[histIndex - 1];
        navByHistory = true;
        set({ histIndex: histIndex - 1 });
        Promise.resolve(get().openFile(target))
          .catch(() => {})
          .finally(() => {
            navByHistory = false;
          });
      },
      goForward: () => {
        const { history, histIndex } = get();
        if (histIndex >= history.length - 1) return;
        const target = history[histIndex + 1];
        navByHistory = true;
        set({ histIndex: histIndex + 1 });
        Promise.resolve(get().openFile(target))
          .catch(() => {})
          .finally(() => {
            navByHistory = false;
          });
      },
      content: '',
      dirty: false,
      viewMode: 'live',
      setViewMode: (m) => set({ viewMode: m }),

      expanded: [],
      toggleFolder: (path) =>
        set((s) => ({
          expanded: s.expanded.includes(path)
            ? s.expanded.filter((p) => p !== path)
            : [...s.expanded, path],
        })),
      setExpanded: (paths) => set({ expanded: paths }),
      treeSort: 'name-asc',
      setTreeSort: (treeSort) => set({ treeSort }),
      autoReveal: false,
      toggleAutoReveal: () => set((s) => ({ autoReveal: !s.autoReveal })),

      splitPath: null,
      splitContent: '',
      splitDirection: 'right',
      openToSide: async (path, direction) => {
        if (!TEXT_RE.test(path)) return;
        const r = await api.read(path);
        set((s) => ({
          splitPath: path,
          splitContent: typeof r === 'string' ? r : r.content,
          splitDirection: direction ?? s.splitDirection,
        }));
      },
      closeSplit: () => set({ splitPath: null, splitContent: '' }),

      recent: [],
      removeRecent: (path) => set((s) => ({ recent: s.recent.filter((p) => p !== path) })),
      movePath: null,
      setMovePath: (path) => set({ movePath: path }),

      selected: [],
      setSelected: (selected) => set({ selected }),
      selectAnchor: null,
      setSelectAnchor: (selectAnchor) => set({ selectAnchor }),
      clipboard: null,
      setClipboard: (c) => set({ clipboard: c }),
      bookmarks: [],
      toggleBookmark: (path) =>
        set((s) => ({
          bookmarks: s.bookmarks.includes(path)
            ? s.bookmarks.filter((p) => p !== path)
            : [...s.bookmarks, path],
        })),

      leftPanel: 'files',
      setLeftPanel: (p) => set({ leftPanel: p, leftOpen: true }),
      rightPanel: 'backlinks',
      setRightPanel: (p) => set({ rightPanel: p, rightOpen: true }),
      searchQuery: '',
      searchFor: (q) => set({ searchQuery: q, leftPanel: 'search', leftOpen: true }),
      leftOpen: true,
      rightOpen: true,
      toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
      toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
      mobileDrawer: null,
      setMobileDrawer: (d) => set({ mobileDrawer: d }),

      paletteOpen: false,
      paletteMode: 'all',
      setPalette: (v, mode = 'all') => set({ paletteOpen: v, paletteMode: mode }),
      settingsOpen: false,
      setSettings: (v) => set({ settingsOpen: v }),
      trashOpen: false,
      setTrash: (v) => set({ trashOpen: v }),
      setGraph: (v) => {
        if (v) get().openGraph();
        else get().closeTab(GRAPH_PATH);
      },
      openGraph: async () => {
        if (get().dirty) await get().save();
        set((s) => ({
          tabs: s.tabs.some((t) => t.path === GRAPH_PATH)
            ? s.tabs
            : [...s.tabs, { path: GRAPH_PATH, title: 'Graph view' }],
          activePath: GRAPH_PATH,
          content: '',
          dirty: false,
          ...pushHistory(s, GRAPH_PATH),
        }));
      },
      graphSettings: DEFAULT_GRAPH_SETTINGS,
      setGraphSettings: (patch) =>
        set((s) => ({ graphSettings: { ...s.graphSettings, ...patch } })),
      resetGraphSettings: () => set({ graphSettings: DEFAULT_GRAPH_SETTINGS }),

      contextMenu: null,
      openContextMenu: (m) => set({ contextMenu: m }),
      closeContextMenu: () => set({ contextMenu: null }),

      shares: [],
      loadShares: async () => {
        try {
          const { shares } = await api.listShares();
          set({ shares });
        } catch {
          /* not authed yet */
        }
      },
      shareDialogPath: null,
      setShareDialog: (path) => set({ shareDialogPath: path }),
      versionHistoryPath: null,
      setVersionHistory: (path) => set({ versionHistoryPath: path }),
      revealInTree: (path) => {
        // Expand every ancestor folder so the file's row is rendered, open the
        // Files panel, then let FileTree scroll the now-visible row into view.
        const segs = path.split('/');
        segs.pop();
        const ancestors: string[] = [];
        let acc = '';
        for (const s of segs) {
          acc = acc ? `${acc}/${s}` : s;
          ancestors.push(acc);
        }
        set((st) => ({
          expanded: Array.from(new Set([...st.expanded, ...ancestors])),
          leftPanel: 'files',
          leftOpen: true,
        }));
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('wo-reveal-file', { detail: { path } }));
        }, 60);
      },

      toast: '',
      notify: (msg, ms = 2500) => {
        set({ toast: msg });
        if (ms > 0) {
          window.setTimeout(() => set((s) => (s.toast === msg ? { toast: '' } : {})), ms);
        }
      },

      openFile: async (path) => {
        if (path === GRAPH_PATH) return get().openGraph();
        if (get().dirty) await get().save();
        // A folder path (e.g. deep-link /note/<folder>) opens a folder content
        // view — never read it as a note nor pollute Recent with it.
        const isFolder = findNode(get().tree, path)?.type === 'folder';
        let content = '';
        if (!isFolder && TEXT_RE.test(path)) {
          const r = await api.read(path);
          content = typeof r === 'string' ? r : r.content;
        }
        const title = path.split('/').pop() ?? path;
        set((s) => {
          const tabs = s.tabs.find((t) => t.path === path) ? s.tabs : [...s.tabs, { path, title }];
          const recent = isFolder ? s.recent : [path, ...s.recent.filter((p) => p !== path)].slice(0, 20);
          return { tabs, activePath: path, content, dirty: false, recent, ...pushHistory(s, path) };
        });
      },

      openWikilink: async (target) => {
        try {
          const { path } = await api.resolve(target);
          if (path) await get().openFile(path);
          else {
            // Only append `.md` when the target has no extension at all — a target
            // like `Foo.canvas` must stay `Foo.canvas`, not become `Foo.canvas.md`.
            const hasExt = /\.[^./]+$/.test(target);
            const newPath = hasExt ? target : `${target}.md`;
            await get().createNote(newPath, `# ${target.replace(/\.md$/, '')}\n`);
          }
        } catch {
          /* ignore */
        }
      },

      closeTab: (path) =>
        set((s) => {
          const tabs = s.tabs.filter((t) => t.path !== path);
          const wasActive = s.activePath === path;
          const activePath = wasActive ? (tabs.at(-1)?.path ?? null) : s.activePath;
          return { tabs, activePath, ...(wasActive ? { content: '', dirty: false } : {}) };
        }),

      setContent: (c) => set({ content: c, dirty: true }),

      save: async () => {
        const { activePath, content, dirty } = get();
        if (!activePath || !dirty) return;
        if (!TEXT_RE.test(activePath)) return;
        await api.write(activePath, content);
        set({ dirty: false });
      },

      createNote: async (path, body) => {
        await api.write(path, body ?? '');
        await get().loadTree();
        await get().openFile(path);
      },

      newNote: async (dir) => {
        // Pick the first free "Untitled" name in the target folder, like Obsidian.
        const base = (dir ?? '').replace(/\/+$/, '');
        const folder = base ? findNode(get().tree, base) : get().tree;
        const taken = new Set((folder?.children ?? []).map((c) => c.name.toLowerCase()));
        let name = 'Untitled.md';
        for (let i = 1; taken.has(name.toLowerCase()); i++) name = `Untitled ${i}.md`;
        const path = base ? `${base}/${name}` : name;
        await get().createNote(path, '');
        if (base) get().revealInTree(path);
      },

      newCanvas: async (dir) => {
        const base = (dir ?? '').replace(/\/+$/, '');
        const folder = base ? findNode(get().tree, base) : get().tree;
        const taken = new Set((folder?.children ?? []).map((c) => c.name.toLowerCase()));
        let name = 'Untitled.canvas';
        for (let i = 1; taken.has(name.toLowerCase()); i++) name = `Untitled ${i}.canvas`;
        const path = base ? `${base}/${name}` : name;
        await get().createNote(path, '{\n\t"nodes":[],\n\t"edges":[]\n}');
        if (base) get().revealInTree(path);
      },

      renamingPath: null,
      setRenamingPath: (path) => set({ renamingPath: path }),

      newFolder: async (dir) => {
        // Create an "Untitled" folder (unique name) and drop straight into inline
        // rename — same as Obsidian, no prompt.
        const base = (dir ?? '').replace(/\/+$/, '');
        const parent = base ? findNode(get().tree, base) : get().tree;
        const taken = new Set((parent?.children ?? []).map((c) => c.name.toLowerCase()));
        let name = 'Untitled';
        for (let i = 1; taken.has(name.toLowerCase()); i++) name = `Untitled ${i}`;
        const path = base ? `${base}/${name}` : name;
        await api.createFolder(path);
        await get().loadTree();
        // Make sure the new row is rendered (expand ancestors + open the Files panel)…
        if (base) {
          const segs = base.split('/');
          const ancestors: string[] = [];
          let acc = '';
          for (const s of segs) { acc = acc ? `${acc}/${s}` : s; ancestors.push(acc); }
          set((st) => ({ expanded: Array.from(new Set([...st.expanded, ...ancestors])) }));
        }
        set({ leftPanel: 'files', leftOpen: true, renamingPath: path });
      },

      openDailyNote: async () => {
        const d = new Date();
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate(),
        ).padStart(2, '0')}`;
        const path = `Daily/${iso}.md`;
        try {
          const { path: existing } = await api.resolve(iso);
          if (existing) {
            await get().openFile(existing);
            return;
          }
        } catch {
          /* none */
        }
        await get().createNote(path, `# ${iso}\n\n`);
        get().notify(`Daily note ${iso} ready`);
      },

      hydrate: async () => {
        // Active tab + split pane content aren't persisted (only the paths) —
        // re-read them from the vault after a reload. Drop tabs whose file is gone.
        const { activePath, splitPath, tabs } = get();
        if (activePath && TEXT_RE.test(activePath)) {
          try {
            const r = await api.read(activePath);
            set({ content: typeof r === 'string' ? r : r.content, dirty: false });
          } catch {
            set({
              tabs: tabs.filter((t) => t.path !== activePath),
              activePath: tabs.filter((t) => t.path !== activePath).at(-1)?.path ?? null,
              content: '',
            });
          }
        }
        if (splitPath && TEXT_RE.test(splitPath)) {
          try {
            const r = await api.read(splitPath);
            set({ splitContent: typeof r === 'string' ? r : r.content });
          } catch {
            set({ splitPath: null, splitContent: '' });
          }
        }
      },

      loadUiState: async () => {
        try {
          const s = await api.getUiState();
          suppressSave = true;
          applyPersisted(s, set);
          lastSaved = JSON.stringify(pickPersisted(get()));
          suppressSave = false;
        } catch {
          /* first run / not authed */
        }
        canSave = true;
        await get().hydrate();
      },

      applyRemoteState: async (state, originId) => {
        if (originId === CLIENT_ID) return; // ignore echo of our own change
        const prevActive = get().activePath;
        const prevSplit = get().splitPath;
        if (get().dirty) await get().save(); // don't lose local edits when switching
        suppressSave = true;
        applyPersisted(state, set);
        lastSaved = JSON.stringify(pickPersisted(get()));
        suppressSave = false;
        if (get().activePath !== prevActive || get().splitPath !== prevSplit) {
          await get().hydrate();
        }
      },
    }),
);

// Save durable workspace state to the server (debounced) whenever it changes.
useStore.subscribe((state, prev) => {
  if (!canSave || suppressSave) return;
  if (JSON.stringify(pickPersisted(state)) !== JSON.stringify(pickPersisted(prev))) {
    scheduleSave();
  }
});
