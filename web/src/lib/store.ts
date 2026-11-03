import {t as uiText} from "./i18n/runtime";
import {defaultCodeFileViewer,resolveCodeLanguage,type CodeFileViewerSettings,type CodeFileReadResult} from './codeFiles';
import {listDrafts} from './drafts/storage';
import {resolveNewNoteDirectory} from './vaultLinks';
import {resetVaultPreferences} from './vaultPreferences';
import {confirmDialog} from './confirm';
import {DocumentSession} from './drafts/session';
import {putDraft,deleteDraftIfRevision,remapDrafts} from './drafts/storage';
import { create } from 'zustand';
import { ApiError, api, setUnlock, setRenameHook, type TreeNode, type ShareRecord } from './api';
import { findNode, isFolderPath } from './tree';
import { isAttachmentTarget } from './media';
import { dateStamp, slugify, substituteTemplate, timeStamp, uniqueNotePath } from './templates';
import { isInsideHiddenAttachmentFolder } from './attachments';

/** Per-tab id so we can ignore the echo of our own server-pushed state change. */
export const CLIENT_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const documentSessions=new Map<string,DocumentSession>();
export let currentDraftScope='';
let draftScopeRequest:Promise<string>|null=null;
let scopeEpoch=0;
let splitCodeRequest=0;
let draftSessionSequence=0;
export function draftScopeEpoch(){return scopeEpoch;}
export function isDraftScopeCurrent(scope:string,epoch:number){return scope===currentDraftScope&&epoch===scopeEpoch;}
export function assertDraftScope(scope:string,epoch:number){if(!isDraftScopeCurrent(scope,epoch))throw new Error('Draft scope changed. Reopen recovery in the current vault.');}
export async function loadDraftScope(){const epoch=scopeEpoch;if(!draftScopeRequest)draftScopeRequest=api.draftScope().then(r=>{if(epoch!==scopeEpoch)throw new Error('Draft scope changed');currentDraftScope=r.scopeId;return r.scopeId;}).catch(error=>{if(epoch===scopeEpoch)draftScopeRequest=null;throw error;});return draftScopeRequest;}
export function resetDraftScope(){resetVaultPreferences();scopeEpoch++;openRequest++;splitCodeRequest++;useStore.setState({codeFileResult:null,splitCodeFileResult:null,codeEditorOverride:null,noteNavigation:null});for(const s of documentSessions.values())s.dispose();documentSessions.clear();currentDraftScope='';draftScopeRequest=null;if(typeof window!=='undefined'&&window.dispatchEvent)window.dispatchEvent(new Event('draft-scope-change'));}
export function acceptResolvedDocument(path:string,content:string,version:string){const s=documentSessions.get(path);if(s){s.acceptServerResult(content,version);}else{const scopeId=currentDraftScope;documentSessions.set(path,new DocumentSession({scopeId,path,writerId:CLIENT_ID+':'+(++draftSessionSequence),content,version},{put:putDraft,remove:deleteDraftIfRevision,write:(p,t,v)=>api.write(p,t,v,scopeId)},refreshSaveStatus));}useStore.setState({content,dirty:false,codeFileResult:null,codeEditorOverride:path});}
function refreshSaveStatus(){if(typeof window!=='undefined'&&window.dispatchEvent)window.dispatchEvent(new Event('draft-status'));}
export type ViewMode = 'live' | 'source' | 'reading';
/** Board | Timeline mode of the Tasks view (FR-16). Part of the URL, so a
 *  `/tasks?mode=timeline` deep link survives a reload. */
export type TasksMode = 'board' | 'timeline';
export type TreeSort =
  | 'name-asc' | 'name-desc'
  | 'mtime-desc' | 'mtime-asc'
  | 'ctime-desc' | 'ctime-asc'
  | 'manual';
const TREE_SORTS: TreeSort[] = ['name-asc', 'name-desc', 'mtime-desc', 'mtime-asc', 'ctime-desc', 'ctime-asc', 'manual'];

/** Sentinel tab path for the Graph view (it lives in a tab, like Obsidian). */
export const GRAPH_PATH = 'graph://view';
/** Sentinel tab path for the Tasks board (FR-15) — a virtual view, not a file. */
export const TASKS_PATH = 'tasks://view';

/** True for a sentinel "virtual view, not a file" tab path (Graph, Tasks board). */
export function isViewPath(path: string | null): boolean {
  return path === GRAPH_PATH || path === TASKS_PATH;
}

export interface Tab {
  path: string;
  title: string;
  /** Reusable until kept open or edited. Missing on older, permanent tabs. */
  preview?: boolean;
  /** PDF navigation is kept out of the canonical vault filename. */
  pdfFragment?: string;
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
  codeFileViewer:CodeFileViewerSettings;
  refreshCodeFile:(path:string,pane:'main'|'split')=>Promise<void>;
  codeFileResult:CodeFileReadResult|null;
  splitCodeFileResult:CodeFileReadResult|null;
  codeEditorOverride:string|null;
  applyCodeFileViewerSettings:(next:CodeFileViewerSettings)=>Promise<void>;
  authed: boolean;
  setAuthed: (v: boolean) => void;
  mustChangePassword: boolean;
  setMustChangePassword: (v: boolean) => void;

  /** Active theme wrapper class (e.g. 'theme-dark', 'theme-ctp-mocha'). */
  theme: string;
  setTheme: (t: string) => void;
  /** Settings → Appearance → "Show inline title" (ui.showInlineTitle). */
  showInlineTitle: boolean;
  setShowInlineTitle: (v: boolean) => void;

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
  /** The active note is locked for this browser session — an agent-owned path from
   *  `_system/locks.json`. Typing is refused and the editor shows why. */
  locked: boolean;
  lockReason: string | null;
  /** How the vault lets a human override a lock (mirrors `_system/locks.json`). */
  unlockMode: 'off' | 'confirm' | 'password';
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
  /** Per-folder manual order (key: folder path, '' = vault root; value: ordered child paths). */
  manualOrder: Record<string, string[]>;
  setManualOrderForParent: (parent: string, order: string[]) => void;
  autoReveal: boolean;
  setAutoReveal: (v: boolean) => void;
  toggleAutoReveal: () => void;
  /** Show auto-created `attachments/` folders in the file tree (persisted; hidden by default). */
  showAttachmentFolders: boolean;
  setShowAttachmentFolders: (v: boolean) => void;

  // split pane (open to the side)
  splitPath: string | null;
  splitPdfFragment: string;
  splitContent: string;
  /** Which edge the split pane is docked to ('right' = columns, 'down' = rows). */
  splitDirection: 'right' | 'down';
  openToSide: (path: string, direction?: 'right' | 'down',options?:{pdfFragment?:string}) => Promise<void>;
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
  /** Open (true) or close (false) the New-note-from-template modal (FR-17). */
  templatePicker: boolean;
  setTemplatePicker: (v: boolean) => void;
  /** Open (true) or close (false) the Graph view tab. */
  setGraph: (v: boolean) => void;
  openGraph: () => Promise<void>;
  graphSettings: GraphSettings;
  setGraphSettings: (patch: Partial<GraphSettings>) => void;
  resetGraphSettings: () => void;
  /** Open (or focus) the Tasks board tab (FR-15). */
  openTasks: () => Promise<void>;
  /** Deliberately NOT in PERSIST_KEYS: the URL owns this on load, so a
   *  restored workspace can never override `/tasks?mode=timeline`. */
  tasksMode: TasksMode;
  setTasksMode: (m: TasksMode) => void;

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

  noteNavigation:{path:string;fragment:string;request:number}|null;
  openFile: (path: string, options?: { preview?: boolean;pdfFragment?:string;noteFragment?:string }) => Promise<void>;
  /** Open a media reference using its originating note, then keep the canonical path in tabs. */
  openAttachment: (target: string, from: string) => Promise<void>;
  /** Finish inline creation without replacing an existing preview tab. */
  openCreatedFile: (path: string) => Promise<void>;
  keepTab: (path: string) => void;
  openWikilink: (target: string,kind?:'wiki'|'markdown',from?:string) => Promise<void>;
  closeTab: (path: string) => Promise<boolean>;
  renamePath: (from: string, to: string) => Promise<void>;
  /** Discard state only after the server has confirmed removal. */
  forgetDeletedPath: (path: string) => void;
  /** Confirm deletion in the caller, then exclude saves until removal finishes. */
  deletePath: (path: string, permanent?: boolean,confirmedMode?:'trash'|'permanent') => ReturnType<typeof api.remove>;
  setContent: (c: string) => void;
  /** Deliberately open the active locked note for editing — confirm dialog, or the operator
   *  password when the vault's locks config asks for one. Session-scoped; the agent keeps writing. */
  unlockLocked: (password?: string) => void;
  /** Record that the server refused a write with 423, so the banner can explain it. */
  markLocked: (reason: string | null) => void;
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
  /** Path of a just-created note awaiting its first (inline) rename; opened once that finishes. */
  newNotePath: string | null;
  setNewNotePath: (path: string | null) => void;
  setRenamingPath: (path: string | null) => void;
  openDailyNote: () => Promise<void>;
  /**
   * Create a note from a vault template (FR-17): `<folder>/<YYYY-MM-DD>-<slug>.md`
   * with the template's placeholders filled in. Returns the created path.
   *
   * Throws — and writes nothing — when the target folder is absent or the title
   * yields no usable slug. Never overwrites an existing note: the write is
   * create-only (`baseVersion: ''`) and a conflict moves on to `-2`, `-3` …
   */
  newFromTemplate: (templatePath: string, title: string, folder: string) => Promise<string>;
  /** Re-fetch content for the active/split tabs (after reload or remote sync). */
  hydrate: () => Promise<void>;
  /** Load persisted workspace state from the server and apply it. */
  loadUiState: (strict?:boolean) => Promise<void>;
  /** Apply a workspace state pushed from another tab/device. */
  applyRemoteState: (state: any, originId: string) => Promise<void>;
}

const THEME_CACHE_KEY = 'wo-theme';
function readCachedTheme(): string | null {
  try {
    const t = typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_CACHE_KEY) : null;
    return t && /^theme-[a-z-]+$/.test(t) ? t : null;
  } catch {
    return null;
  }
}

const TEXT_RE = /\.(md|markdown|txt|json|csv|canvas|css|js|ya?ml)$/i;

// ---- server-side workspace persistence (shared across browsers/devices) ----
const PERSIST_KEYS = [
  'tabs', 'activePath', 'viewMode', 'expanded', 'splitPath', 'splitDirection', 'splitPdfFragment',
  'recent', 'bookmarks', 'leftPanel', 'rightPanel', 'leftOpen', 'rightOpen', 'graphSettings',
  'treeSort', 'manualOrder', 'autoReveal', 'showAttachmentFolders',
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

/** Sanitize persisted manual order data (folderPath -> ordered child paths). */
function parseManualOrder(input: unknown): Record<string, string[]> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!Array.isArray(v)) continue;
    const seen = new Set<string>();
    const arr: string[] = [];
    for (const p of v) {
      if (typeof p !== 'string' || !p || seen.has(p)) continue;
      seen.add(p);
      arr.push(p);
    }
    out[k] = arr;
  }
  return out;
}

const parentOfPath = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

/**
 * Carry manual order across a rename/move so the item keeps its place:
 *  - same folder (rename): the item keeps its slot in that folder's order;
 *  - a renamed/moved FOLDER takes its children's order with it (keys and values are re-prefixed);
 *  - moved to another folder: dropped from the old folder's order and appended to the end of the
 *    new folder's order (when that folder has a manual order; otherwise it just uses the default).
 */
function remapManualOrder(order: Record<string, string[]>, from: string, to: string): Record<string, string[]> {
  if (!from || from === to) return order;
  const prefix = `${from}/`;
  const swap = (p: string) => (p === from ? to : p.startsWith(prefix) ? to + p.slice(from.length) : p);
  const out: Record<string, string[]> = {};
  for (const [k, list] of Object.entries(order)) out[swap(k)] = list.map(swap);
  const fromParent = parentOfPath(from);
  const toParent = parentOfPath(to);
  if (fromParent !== toParent) {
    if (out[fromParent]) out[fromParent] = out[fromParent].filter((p) => p !== to);
    if (out[toParent]) out[toParent] = [...out[toParent].filter((p) => p !== to), to];
  }
  return out;
}

// Renames/moves currently awaiting the server. While any is pending the tree on screen and the
// manual order can disagree, so reconciling then would treat the renamed item as "deleted + new".
let renamesInFlight = 0;

/**
 * Keep manual-order metadata in sync with the live tree:
 * - remove deleted paths,
 * - preserve known order,
 * - append brand-new children to the end (per-folder).
 */
function reconcileManualOrder(tree: TreeNode | null, current: Record<string, string[]>): Record<string, string[]> {
  if (!tree) return {};
  const out: Record<string, string[]> = {};
  const walk = (node: TreeNode) => {
    const key = node.path || '';
    const children = node.children ?? [];
    const childPaths = children.map((c) => c.path);
    const known = new Set(childPaths);
    const existing = current[key] ?? [];
    const kept = existing.filter((p) => known.has(p));
    const seen = new Set(kept);
    for (const p of childPaths) {
      if (!seen.has(p)) {
        kept.push(p);
        seen.add(p);
      }
    }
    out[key] = kept;
    for (const c of children) if (c.type === 'folder') walk(c);
  };
  walk(tree);
  return out;
}

function applyPersisted(s: any, set: (p: any) => void): void {
  set({
    tabs: Array.isArray(s.tabs) ? s.tabs : [],
    activePath: typeof s.activePath === 'string' ? s.activePath : null,
    viewMode: ['live', 'source', 'reading'].includes(s.viewMode) ? s.viewMode : 'live',
    expanded: Array.isArray(s.expanded) ? s.expanded : [],
    treeSort: TREE_SORTS.includes(s.treeSort) ? s.treeSort : 'name-asc',
    manualOrder: parseManualOrder(s.manualOrder),
    autoReveal: s.autoReveal === true,
    showAttachmentFolders: s.showAttachmentFolders === true,
    splitPath: typeof s.splitPath === 'string' ? s.splitPath : null,
    splitPdfFragment: typeof s.splitPdfFragment === 'string' ? s.splitPdfFragment : '',
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

/** Ignore older reads when notes are selected faster than the server responds. */
let openRequest = 0;

const withinPath = (path: string | null, parent: string): boolean =>
  path !== null && (path === parent || path.startsWith(`${parent}/`));
let editRevision = 0;
const saves = new Map<string, Promise<void>>();
const closes = new Map<string, Promise<boolean>>();
let fileMutation: Promise<void> = Promise.resolve();
let mutationsPending = 0;

function mutateFiles<T>(action: () => Promise<T>): Promise<T> {
  mutationsPending++;
  const result = fileMutation.then(action);
  fileMutation = result.then(() => {}, () => {}).finally(() => { mutationsPending--; });
  return result;
}

async function waitForFileMutations(): Promise<void> {
  while (mutationsPending) await fileMutation;
}

/** One writer per note; each writer drains edits made while its request is pending. */
function saveActiveDraft(): Promise<void> {
  const path = useStore.getState().activePath;
  if (!path) return Promise.resolve();
  if (!TEXT_RE.test(path)) {
    const error = new Error('Cannot save this file type — keep this tab open and copy your changes');
    useStore.getState().notify(error.message);
    return Promise.reject(error);
  }
  const running = saves.get(path);
  if (running) return running;
  if (!useStore.getState().dirty) return Promise.resolve();
  const saving = (async () => {
    try {
      while (useStore.getState().activePath === path && useStore.getState().dirty) {
        const { content } = useStore.getState();
        const revision = editRevision;
        const session=documentSessions.get(path);
        if(!session)throw new Error('Reopen this document to load its version before saving');
        if(session.content!==content)session.edit(content);
        await session.save();
        useStore.setState((s) => s.activePath === path && revision === editRevision && s.content === content
          ? { dirty: false } : {});
      }
    } catch (error) {
      const state = useStore.getState();
      if (error instanceof ApiError && error.status === 423) {
        if (state.activePath === path) {
          state.markLocked((error.data as { reason?: string } | undefined)?.reason ?? null);
        }
        state.notify(uiText("webobsidian.read-only-note-ask-the-agent-to-change-it-b0d374"));
      } else state.notify(error instanceof Error ? uiText("webobsidian.save-failed-value0-4c82cd", {value0: error.message}) : uiText("webobsidian.save-failed-0a4444"));
      throw error;
    } finally {
      saves.delete(path);
    }
  })();
  saves.set(path, saving);
  return saving;
}

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
      // Start from the last theme this browser used, so the login screen (shown
      // before settings can be fetched) matches the app instead of flashing light.
      theme: readCachedTheme() ?? 'theme-light',
      setTheme: (t) => {
        try {
          localStorage.setItem(THEME_CACHE_KEY, t);
        } catch {
          /* storage unavailable — theme just isn't remembered for the login screen */
        }
        set({ theme: t });
      },
      showInlineTitle: true,
      setShowInlineTitle: (v) => set({ showInlineTitle: v }),

      tree: null,
      noteNavigation:null,
      loadTree: async () => {
        const tree = await api.tree();
        set((s) => ({ tree, manualOrder: renamesInFlight > 0 ? s.manualOrder : reconcileManualOrder(tree, s.manualOrder) }));
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
      locked: false,
      lockReason: null,
      unlockMode: 'confirm',
      dirty: false,
      viewMode: 'live',
      setViewMode: (m) => set({ viewMode: m }),
      tasksMode: 'board',
      setTasksMode: (m) => set({ tasksMode: m }),

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
      manualOrder: {},
      setManualOrderForParent: (parent, order) =>
        set((s) => ({
          manualOrder: {
            ...s.manualOrder,
            [parent]: Array.from(new Set(order.filter(Boolean))),
          },
        })),
      autoReveal: false,
      setAutoReveal: (autoReveal) => set({ autoReveal }),
      toggleAutoReveal: () => set((s) => ({ autoReveal: !s.autoReveal })),
      showAttachmentFolders: false,
      setShowAttachmentFolders: (showAttachmentFolders) => set({ showAttachmentFolders }),

      refreshCodeFile:async(path,pane)=>{
        const epoch=scopeEpoch;const request=pane==='main'?openRequest:splitCodeRequest;
        const initial=pane==='main'?get().codeFileResult:get().splitCodeFileResult;
        if(initial?.path!==path)return;
        const result=await api.readCode(path);
        if(epoch!==scopeEpoch||request!==(pane==='main'?openRequest:splitCodeRequest))return;
        if(pane==='main'&&get().activePath===path&&get().codeFileResult===initial)set({codeFileResult:result,content:result.kind==='text'?result.content:''});
        if(pane==='split'&&get().splitPath===path&&get().splitCodeFileResult===initial)set({splitCodeFileResult:result,splitContent:result.kind==='text'?result.content:''});
      },
      codeFileViewer:defaultCodeFileViewer,
      codeFileResult:null,splitCodeFileResult:null,codeEditorOverride:null,
      applyCodeFileViewerSettings:async(next)=>{
        if(get().dirty)await get().save();
        await api.putSettings({ui:{codeFileViewer:next}});
        set({codeFileViewer:next});
        const {activePath,splitPath}=get();if(activePath)await get().openFile(activePath,{preview:false});if(splitPath)await get().openToSide(splitPath);
      },
      splitPath: null,
      splitPdfFragment: '',
      splitContent: '',
      splitDirection: 'right',
      openToSide: async (path, direction,options) => {
        const request=++splitCodeRequest;const epoch=scopeEpoch;
        const code=resolveCodeLanguage(path,get().codeFileViewer)!==null;
        if(!code&&!TEXT_RE.test(path)&&!/\.pdf$/i.test(path)){set({splitPath:null,splitContent:'',splitCodeFileResult:null});return;}
        const result=code?await api.readCode(path):null;
        const r=/\.pdf$/i.test(path)?{content:''}:result?{content:result.kind==='text'?result.content:''}:await api.read(path);
        if(request!==splitCodeRequest||epoch!==scopeEpoch)return;
        set({splitCodeFileResult:result});
        set((s) => ({
          splitPath: path,
          splitPdfFragment:/\.pdf$/i.test(path)?options?.pdfFragment??(s.splitPath===path?s.splitPdfFragment:''):'',
          splitContent: typeof r === 'string' ? r : r.content,
          splitDirection: direction ?? s.splitDirection,
        }));
      },
      closeSplit: () => {splitCodeRequest++;set({splitPath:null,splitPdfFragment:'',splitContent:'',splitCodeFileResult:null});},

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
      templatePicker: false,
      setTemplatePicker: (v) => set({ templatePicker: v }),
      setGraph: (v) => {
        if (v) get().openGraph();
        else get().closeTab(GRAPH_PATH);
      },
      openGraph: async () => {
        if (mutationsPending) await waitForFileMutations();
        const request = ++openRequest;
        if (get().dirty) await get().save();
        if (request !== openRequest) return;
        set((s) => ({
          tabs: s.tabs.some((t) => t.path === GRAPH_PATH)
            ? s.tabs
            : [...s.tabs, { path: GRAPH_PATH, get title() {return uiText("plugins.graph-view.name");} }],
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

      openTasks: async () => {
        if (mutationsPending) await waitForFileMutations();
        const request = ++openRequest;
        if (get().dirty) await get().save();
        if (request !== openRequest) return;
        set((s) => ({
          tabs: s.tabs.some((t) => t.path === TASKS_PATH)
            ? s.tabs
            : [...s.tabs, { path: TASKS_PATH, get title() {return uiText("webobsidian.tasks-090ec5");} }],
          activePath: TASKS_PATH,
          content: '',
          dirty: false,
          ...pushHistory(s, TASKS_PATH),
        }));
      },

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
        const st0 = get();
        if (!st0.showAttachmentFolders && isInsideHiddenAttachmentFolder(st0.tree, path)) {
          st0.notify(uiText("webobsidian.that-file-is-in-a-hidden-attachments-folder-turn-f05280"), 4500);
          return;
        }
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

      openAttachment: async (target, from) => {
        try {
          const { path } = await api.resolveAttachment(target, from);
          if (path) await get().openFile(path,/\.pdf$/i.test(path)&&target.includes('#')?{pdfFragment:target.slice(target.indexOf('#')+1)}:undefined);
          else get().notify(uiText("webobsidian.attachment-not-found-cf2258"));
        } catch (err: any) {
          get().notify(err?.message ?? 'Could not open attachment');
        }
      },
      openCreatedFile: async (path) => {
        set({ selected: [path], selectAnchor: path });
        await get().openFile(path, { preview: false });
        get().revealInTree(path);
      },

      openFile: async (path, { preview = true,pdfFragment,noteFragment } = {}) => {
        if (mutationsPending) await waitForFileMutations();
        if (path === GRAPH_PATH) return get().openGraph();
        if (path === TASKS_PATH) return get().openTasks();
        const request = ++openRequest;
        if (get().dirty) await get().save();
        if (request !== openRequest) return;
        // A folder path (e.g. deep-link /note/<folder>) opens a folder content
        // view — never read it as a note nor pollute Recent with it.
        const isFolder = findNode(get().tree, path)?.type === 'folder';
        let codeFileResult:CodeFileReadResult|null=null;
        let codeEditorOverride:string|null=null;
        let isCode=!isFolder&&resolveCodeLanguage(path,get().codeFileViewer)!==null;
        if(isCode&&TEXT_RE.test(path)&&typeof indexedDB!=='undefined'){
          const scope=await loadDraftScope();
          const drafts=await listDrafts(scope);
          if(drafts.some(d=>d.path===path)){isCode=false;codeEditorOverride=path;}
        }
        let content = '';
        if(isCode){codeFileResult=await api.readCode(path);content=codeFileResult.kind==='text'?codeFileResult.content:'';}
        let version: string | undefined;
        let documentScope='';
        let locked = false;
        let lockReason: string | null = null;
        let unlockMode: 'off' | 'confirm' | 'password' = 'confirm';
        if (!isFolder && !isCode && TEXT_RE.test(path)) {
          documentScope=await loadDraftScope();
          if(request!==openRequest)return;
          const r = await api.read(path,documentScope||undefined);
          version = typeof r==='string'?undefined:r.version;
          content = typeof r === 'string' ? r : r.content;
          if (typeof r !== 'string') {
            locked = !!r.locked;
            lockReason = r.lockReason ?? null;
            unlockMode = r.unlock ?? 'confirm';
          }
        }
        if (request !== openRequest) return;
        // The user may have edited the previous note while this read was pending.
        if (get().dirty) await get().save();
        if (request !== openRequest) return;
        if(!isFolder&&!isCode&&TEXT_RE.test(path)){
          const previous=documentSessions.get(path);previous?.dispose();
          const scopeId=documentScope;
          if(request!==openRequest)return;
          if(get().dirty)await get().save();
          if(request!==openRequest)return;
          if(version){documentSessions.set(path,new DocumentSession({scopeId,path,writerId:CLIENT_ID+':'+(++draftSessionSequence),content,version},{put:record=>scopeId?putDraft(record):Promise.reject(new Error('Local draft scope is unavailable')),remove:deleteDraftIfRevision,write:(path,text,version)=>api.write(path,text,version,scopeId||undefined)},refreshSaveStatus));}
          else documentSessions.delete(path);
        }
        const title = path.split('/').pop() ?? path;
        set((s) => {
          const existing = s.tabs.find((t) => t.path === path);
          let tabs = s.tabs;
          if (existing) {
            // Selecting an open tab never turns a permanent tab back into a preview.
            if (!preview && existing.preview) {
              tabs = tabs.map((t) => t.path === path ? { ...t, preview: false } : t);
            }
          } else {
            const tab:Tab = { path, title, preview };
            const replace = preview ? tabs.findIndex((t) => t.preview) : -1;
            tabs = replace < 0 ? [...tabs, tab] : tabs.map((t, i) => i === replace ? tab : t);
          }
          if(pdfFragment!==undefined&&/\.pdf$/i.test(path))tabs=tabs.map(t=>t.path===path?{...t,pdfFragment}:t);
          const recent = isFolder ? s.recent : [path, ...s.recent.filter((p) => p !== path)].slice(0, 20);
          const noteNavigation=/\.(md|markdown)$/i.test(path)&&noteFragment!==undefined?{path,fragment:noteFragment,request}:null;
          return { tabs, activePath: path, content, codeFileResult, codeEditorOverride,noteNavigation, locked, lockReason, unlockMode, dirty: false, recent, ...pushHistory(s, path) };
        });
        refreshSaveStatus();
      },

      keepTab: (path) => set((s) => ({
        tabs: s.tabs.map((t) => t.path === path && t.preview ? { ...t, preview: false } : t),
      })),

      openWikilink: async (target,kind='wiki',from) => {
        const resolveRequest=++openRequest;
        try {
          const { path } = await api.resolve(target,from??get().activePath??undefined,kind);
          if(resolveRequest!==openRequest)return;
          if(path){
            let fragment=target.includes('#')?target.slice(target.indexOf('#')+1):'';
            if(kind==='markdown')try{fragment=decodeURIComponent(fragment)}catch{}
            await get().openFile(path,/\.pdf$/i.test(path)&&target.includes('#')?{pdfFragment:target.slice(target.indexOf('#')+1)}:/\.(md|markdown)$/i.test(path)?{noteFragment:fragment}:undefined);
          }
          else if (isAttachmentTarget(target)||resolveCodeLanguage(target,get().codeFileViewer)!==null) {
            // FR-21: a picture/media/PDF target the vault does not hold is a broken
            // link, not a new note — creating `report.pdf` for a typo pollutes the vault.
            get().notify(uiText("webobsidian.file-not-found-value0-603728", {value0: target}));
          } else {
            // Only append `.md` when the target has no extension at all — a target
            // like `Foo.canvas` must stay `Foo.canvas`, not become `Foo.canvas.md`.
            let file=target.split('#')[0];if(kind==='markdown')try{file=decodeURIComponent(file)}catch{}
            if(!file){get().notify(uiText("webobsidian.section-or-block-not-found-095a45"));return}
            const hasExt = /\.[^./]+$/.test(file);
            const name=hasExt?file:`${file}.md`;
            const directory=file.includes('/')?'':resolveNewNoteDirectory({sourcePath:from??get().activePath,preferences:(await api.vaultPreferences()).values});
            if(resolveRequest!==openRequest)return;
            const newPath=directory?`${directory}/${name}`:name;
            await get().createNote(newPath, `# ${file.replace(/\.md$/, '')}\n`);
          }
        } catch(error) {
          get().notify(error instanceof ApiError && error.status===503 ? uiText("webobsidian.the-index-is-updating-try-opening-this-link-agai-9c9232") : uiText("webobsidian.could-not-resolve-this-link-check-the-connection-8f9aed"));
        }
      },

      closeTab: (path) => {
        const pending = closes.get(path);
        if (pending) return pending;
        const closing = (async () => {
          try {
            if (mutationsPending) await waitForFileMutations();
            if (get().activePath === path && get().dirty && !TEXT_RE.test(path)) {
              get().notify(uiText("webobsidian.cannot-save-this-file-type-keep-this-tab-open-an-314f3c"));
              return false;
            }
            while (get().activePath === path && (get().dirty || saves.has(path))) {
              await get().save();
            }
            const s = get();
            const tabs = s.tabs.filter((t) => t.path !== path);
            if (s.activePath !== path) {
              set({ tabs });
            } else {
              ++openRequest;
              const activePath = tabs.at(-1)?.path ?? null;
              set({ tabs, activePath, content: '', dirty: false, locked: false, lockReason: null });
              if (activePath) await get().openFile(activePath).catch((error: unknown) => {
                get().notify(error instanceof Error ? error.message : uiText("webobsidian.could-not-open-file-ac6e99"));
              });
            }
            return true;
          } catch {
            return false;
          } finally {
            closes.delete(path);
          }
        })();
        closes.set(path, closing);
        // A clean inactive tab can finish synchronously, before it enters the map.
        void closing.then(() => { if (closes.get(path) === closing) closes.delete(path); });
        return closing;
      },

      renamePath: (from, to) => mutateFiles(async () => {
        if (from === to) return;
        ++openRequest;
        while(get().dirty)await saveActiveDraft();
        for(const session of documentSessions.values())if(session.content!==session.baseContent)await session.save();
        const revisions=new Map([...documentSessions].map(([p,s])=>[p,s.revision]));
        splitCodeRequest++;
        const renameResult=await api.rename(from, to);
        const remap = (path: string) => withinPath(path, from) ? `${to}${path.slice(from.length)}` : path;
        for(const [name,session] of documentSessions){if(withinPath(name,from)){documentSessions.delete(name);session.key.path=remap(name);documentSessions.set(session.key.path,session);}}
        if(currentDraftScope)await remapDrafts(currentDraftScope,from,to).catch(()=>get().notify(uiText("webobsidian.rename-succeeded-local-draft-paths-could-not-be-d1e17b")));
        const remapNullable = (path: string | null) => path === null ? null : remap(path);
        set((s) => ({
          tabs: s.tabs.map((tab) => {
            const path = remap(tab.path);
            return path === tab.path ? tab : { ...tab, path, title: path.split('/').pop() ?? path };
          }),
          codeFileResult:s.codeFileResult?{...s.codeFileResult,path:remap(s.codeFileResult.path)}:null,
          splitCodeFileResult:s.splitCodeFileResult?{...s.splitCodeFileResult,path:remap(s.splitCodeFileResult.path)}:null,
          codeEditorOverride:remapNullable(s.codeEditorOverride),
          activePath: remapNullable(s.activePath),
          splitPath: remapNullable(s.splitPath),
          history: s.history.map(remap), recent: s.recent.map(remap), bookmarks: s.bookmarks.map(remap),
          expanded: s.expanded.map(remap), selected: s.selected.map(remap),
          selectAnchor: remapNullable(s.selectAnchor), renamingPath: remapNullable(s.renamingPath),
          newNotePath: remapNullable(s.newNotePath), versionHistoryPath: remapNullable(s.versionHistoryPath),
          shareDialogPath: remapNullable(s.shareDialogPath),
          clipboard: s.clipboard ? { ...s.clipboard, path: remap(s.clipboard.path) } : null,
        }));
        for(const changed of renameResult?.changedPaths??[]){const session=documentSessions.get(changed);if(!session)continue;const old=[...revisions.keys()].find(p=>remap(p)===changed);if(old===undefined||session.revision!==revisions.get(old)){get().notify(uiText("webobsidian.links-changed-on-the-server-unsaved-local-text-w-6984c9"));continue;}const current=await api.read(changed);if(session.revision!==revisions.get(old))continue;if(typeof current.content==='string'&&current.version){session.acceptServerResult(current.content,current.version);if(get().activePath===changed)set({content:current.content,dirty:false});if(get().splitPath===changed)set({splitContent:current.content});}}
      }).then(async()=>{const {activePath,splitPath}=get();if(activePath)await get().openFile(activePath,{preview:false});if(splitPath)await get().openToSide(splitPath);}),

      deletePath: (path, permanent,confirmedMode) => mutateFiles(async () => {
        ++openRequest;splitCodeRequest++;
        // Requests already sent must finish before deletion; queued autosaves wait for us.
        await Promise.all([...saves].filter(([file]) => withinPath(file, path)).map(([, pending]) => pending.catch(() => {})));
        const result = await api.remove(path, permanent,confirmedMode);
        get().forgetDeletedPath(path);
        if(result.cleanupWarning)get().notify(result.cleanupWarning,8000);
        if(result.pendingAttachments?.length){let selected:string[]=[];const yes=await confirmDialog('Delete unused attachments from the deleted note?',{confirmLabel:'Delete selected attachments',detail:'Only selected files that are still unused will be removed using your deletion setting.',items:result.pendingAttachments,onSelection:paths=>{selected=paths;}});if(yes&&selected.length){await api.cleanupAttachments(path,selected,result.cleanupReceipt??'');await get().loadTree();}}
        return result;
      }),

      forgetDeletedPath: (path) => {
        for(const [name,session] of documentSessions)if(withinPath(name,path)){void session.flush().catch(()=>{});session.dispose();documentSessions.delete(name);}
        ++openRequest;
        const s = get();
        const keep = (file: string) => !withinPath(file, path);
        const tabs = s.tabs.filter((tab) => keep(tab.path));
        const wasActive = withinPath(s.activePath, path);
        const activePath = wasActive ? tabs.at(-1)?.path ?? null : s.activePath;
        const history = s.history.filter(keep);
        set({
          tabs, activePath, history, histIndex: Math.min(s.histIndex, history.length - 1),
          recent: s.recent.filter(keep), selected: s.selected.filter(keep), expanded: s.expanded.filter(keep),
          ...(wasActive ? { content: '', dirty: false, locked: false, lockReason: null } : {}),
          ...(withinPath(s.splitPath, path) ? { splitPath: null, splitContent: '' } : {}),
        });
        // Run after the deletion gate releases, otherwise openFile would wait on itself.
        if (wasActive && activePath) void get().openFile(activePath).catch((error: unknown) => {
          get().notify(error instanceof Error ? error.message : uiText("webobsidian.could-not-open-file-ac6e99"));
        });
      },

      setContent: (c) => {
        if(get().codeFileResult?.path===get().activePath)return;
        editRevision++;
        const path=get().activePath;if(path)documentSessions.get(path)?.edit(c);
        set((s) => ({
        content: c,
        dirty: true,
        tabs: s.tabs.map((t) => t.path === s.activePath && t.preview ? { ...t, preview: false } : t),
        }));
      },

      save: async () => {
        if (mutationsPending) await waitForFileMutations();
        const path = get().activePath;
        if (!path) return;
        // Recheck after await too: a queued input can arrive as the writer completes.
        while (get().activePath === path && get().dirty) await saveActiveDraft();
      },

      markLocked: (reason) => set({ locked: true, lockReason: reason }),

      unlockLocked: (password) => {
        const { activePath, locked, unlockMode } = get();
        if (!activePath || !locked) return;
        if (unlockMode === 'off') return;
        if (unlockMode === 'password' && !password) return;
        setUnlock({ active: true, password: unlockMode === 'password' ? password : undefined });
        set({ locked: false, lockReason: null });
        get().notify(uiText("webobsidian.unlocked-for-this-session-the-agent-still-mainta-267fac"));
      },

      createNote: async (path, body) => {
        await api.write(path, body ?? '');
        await get().loadTree();
        await get().openFile(path, { preview: false });
      },

      newNote: async (dir) => {
        // Pick the first free "Untitled" name in the target folder, like Obsidian.
        const base = dir===undefined?resolveNewNoteDirectory({sourcePath:get().activePath,preferences:(await api.vaultPreferences()).values}):dir.replace(/\/+$/, '');
        const folder = base ? findNode(get().tree, base) : get().tree;
        const taken = new Set((folder?.children ?? []).map((c) => c.name.toLowerCase()));
        let name = 'Untitled.md';
        for (let i = 1; taken.has(name.toLowerCase()); i++) name = `Untitled ${i}.md`;
        const path = base ? `${base}/${name}` : name;
        // Create the file, then drop straight into inline rename (like newFolder);
        // the note is opened once the rename finishes so the editor can't steal focus.
        await api.write(path, '');
        await get().loadTree();
        if (base) {
          const ancestors: string[] = [];
          let acc = '';
          for (const sg of base.split('/')) { acc = acc ? `${acc}/${sg}` : sg; ancestors.push(acc); }
          set((st) => ({ expanded: Array.from(new Set([...st.expanded, ...ancestors])) }));
        }
        set({ leftPanel: 'files', leftOpen: true, newNotePath: path, renamingPath: path, selected: [path], selectAnchor: path });
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('wo-reveal-file', { detail: { path } }));
        }, 60);
      },

      newCanvas: async (dir) => {
        const base = dir===undefined?resolveNewNoteDirectory({sourcePath:get().activePath,preferences:(await api.vaultPreferences()).values}):dir.replace(/\/+$/, '');
        const folder = base ? findNode(get().tree, base) : get().tree;
        const taken = new Set((folder?.children ?? []).map((c) => c.name.toLowerCase()));
        let name = 'Untitled.canvas';
        for (let i = 1; taken.has(name.toLowerCase()); i++) name = `Untitled ${i}.canvas`;
        const path = base ? `${base}/${name}` : name;
        // Same flow as newNote: create, then inline-rename; opened once the rename finishes.
        await api.write(path, '{\n\t"nodes":[],\n\t"edges":[]\n}');
        await get().loadTree();
        if (base) {
          const ancestors: string[] = [];
          let acc = '';
          for (const sg of base.split('/')) { acc = acc ? `${acc}/${sg}` : sg; ancestors.push(acc); }
          set((st) => ({ expanded: Array.from(new Set([...st.expanded, ...ancestors])) }));
        }
        set({ leftPanel: 'files', leftOpen: true, newNotePath: path, renamingPath: path, selected: [path], selectAnchor: path });
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('wo-reveal-file', { detail: { path } }));
        }, 60);
      },

      renamingPath: null,
      newNotePath: null,
      setNewNotePath: (path) => set({ newNotePath: path }),
      setRenamingPath: (path) => set({ renamingPath: path }),

      newFolder: async (dir) => {
        // Create an "Untitled" folder (unique name) and drop straight into inline
        // rename — same as Obsidian, no prompt.
        const base = dir===undefined?resolveNewNoteDirectory({sourcePath:get().activePath,preferences:(await api.vaultPreferences()).values}):dir.replace(/\/+$/, '');
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
        try {
          const { path: existing } = await api.resolve(iso);
          if (existing) {
            await get().openFile(existing);
            return;
          }
        } catch(error) {
          get().notify(error instanceof ApiError && error.status===503 ? uiText("webobsidian.the-index-is-updating-try-opening-the-daily-note-e18576") : uiText("webobsidian.could-not-check-for-an-existing-daily-note-check-90f19b"));
          return;
        }
        // Create the note inside a `daily/` folder when the vault has one, and only fall back to
        // the conventional root `Daily/` otherwise. Vaults whose daily notes are filed by an agent
        // (a wiki scope with `relats/daily/`, for instance) are read from that path only, so a note
        // created at the root fallback would sit there unseen and never be filed.
        const dailyDir = (() => {
          const stack: TreeNode[] = [...(get().tree?.children ?? [])];
          let best = '';
          while (stack.length) {
            const n = stack.pop()!;
            if (n.type === 'folder' && n.path.split('/').pop()?.toLowerCase() === 'daily') {
              if (!best || n.path.length < best.length) best = n.path;
            }
            if (n.children) stack.push(...n.children);
          }
          return best;
        })();
        const path = `${dailyDir || 'Daily'}/${iso}.md`;
        await get().createNote(path, `# ${iso}\n\n`);
        get().notify(uiText("webobsidian.daily-note-value0-ready-56d639", {value0: iso}));
      },

      newFromTemplate: async (templatePath, title, folder) => {
        const clean = title.trim();
        const slug = slugify(clean);
        if (!slug) throw new Error('A title is required — it names the file.');
        const dir = folder.replace(/^\/+|\/+$/g, '');
        // A template note with nowhere to go must not land in the vault root:
        // the folder is part of the answer, not an optional detail.
        if (!dir) throw new Error('A target folder is required.');
        if (!isFolderPath(get().tree, dir)) throw new Error(`Folder not found: ${dir}`);

        const { content } = await api.read(templatePath);
        const now = new Date();
        const date = dateStamp(now);
        const body = substituteTemplate(typeof content === 'string' ? content : '', {
          title: clean,
          date,
          time: timeStamp(now),
          slug,
        });

        // Create-only: `baseVersion: ''` asks the server for "this path must not
        // exist yet", so a note created on another device a second ago is not
        // overwritten — the conflict moves us to -2, -3 … instead.
        let path = uniqueNotePath(dir, `${date}-${slug}`, (p) => !!findNode(get().tree, p));
        for (let attempt = 0; ; attempt++) {
          try {
            await api.write(path, body, '');
            break;
          } catch (e) {
            if (!(e instanceof ApiError) || e.status !== 409 || attempt >= 20) throw e;
            const suffix = /-(\d+)\.md$/.exec(path);
            path = `${dir ? `${dir}/` : ''}${date}-${slug}-${suffix ? Number(suffix[1]) + 1 : 2}.md`;
          }
        }

        await get().loadTree();
        await get().openFile(path, { preview: false });
        if (dir) get().revealInTree(path);
        get().notify(uiText("webobsidian.created-from-template-value0-cc66d7", {value0: path}));
        return path;
      },

      hydrate: async () => {
        // Active tab + split pane content aren't persisted (only the paths) —
        // re-read them from the vault after a reload. Drop tabs whose file is gone.
        const { activePath, splitPath, tabs } = get();
        if (activePath && (TEXT_RE.test(activePath)||resolveCodeLanguage(activePath,get().codeFileViewer)!==null)) {
          try {
            await get().openFile(activePath);
          } catch {
            set({
              tabs: tabs.filter((t) => t.path !== activePath),
              activePath: tabs.filter((t) => t.path !== activePath).at(-1)?.path ?? null,
              content: '',
            });
          }
        }
        if (splitPath && (TEXT_RE.test(splitPath)||/\.pdf$/i.test(splitPath)||resolveCodeLanguage(splitPath,get().codeFileViewer)!==null)) {
          try {
            await get().openToSide(splitPath);
          } catch {
            set({ splitPath: null, splitContent: '' });
          }
        }
      },

      loadUiState: async (strict=false) => {
        try {
          const s = await api.getUiState();
          suppressSave = true;
          applyPersisted(s, set);
          lastSaved = JSON.stringify(pickPersisted(get()));
          suppressSave = false;
        } catch(error) {
          if(strict)throw error;
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

// Keep manual sort order attached to items when ANY caller renames or moves them (inline rename,
// drag-and-drop, "Move to…", cut/paste, inline title). Reconcile (which drops order entries for
// paths that vanished) runs on the next tree load, by which time the order has been remapped.
setRenameHook({
  start: () => {
    renamesInFlight++;
  },
  done: (from, to, ok) => {
    renamesInFlight = Math.max(0, renamesInFlight - 1);
    if (ok) useStore.setState((s) => ({ manualOrder: remapManualOrder(s.manualOrder, from, to) }));
  },
});
