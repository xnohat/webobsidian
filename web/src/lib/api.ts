import type {CodeFileViewerSettings,CodeFileReadResult} from './codeFiles';
import {confirmDialog} from './confirm';
import {getVaultPreferences} from './vaultPreferences';
// Thin fetch wrapper around the WebObsidian server API.
import type {ToolbarConfigV1} from './toolbar/config';
import type {StoredLanguagePack} from './i18n/runtime';

export interface Settings {
  version: number;
  auth: {hasCustomPassword:boolean;hasOverridePassword:boolean};
  vault: {path:string;allowedRoots:string[];trash:string;deleteMode:'trash'|'permanent';trashRetentionDays:number;attachmentDir:string;followObsidianDeletion?:boolean};
  git: {enabled:boolean;remote:string;branch:string;token:string;authorName:string;authorEmail:string;autoSync:boolean;autoCommitOnSave:boolean;intervalSec:number;lfsPatterns:string[]};
  search: {fuzzy:number;prefix:boolean;indexFrontmatter:boolean};
  api: {rateLimitPerMin:number;keys:unknown[]};
  ui: {theme:string;defaultView:'live'|'source'|'reading';showInlineTitle:boolean;editingToolbar?:ToolbarConfigV1;codeFileViewer?:CodeFileViewerSettings;languagePack?:StoredLanguagePack|null};
  plugins:{enabled:string[];installed:string[]};
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  ext?: string;
  size?: number;
  mtime?: number;
  ctime?: number;
  children?: TreeNode[];
  attachmentFolder?: boolean;
  /** Set by the server from `_system/locks.json`: the browser must not edit this path. */
  locked?: boolean;
  lockReason?: string;
}

export interface TrashItem {
  name: string;
  path: string; // includes the .trash/ prefix
  original: string; // where it restores to
  ext: string;
  size: number;
  mtime: number;
}

export interface ShareRecord {
  id: string;
  path: string;
  enabled: boolean;
  createdAt: string;
  hasPassword?: boolean;
}

export interface SearchHit {
  path: string;
  title: string;
  score: number;
  tags: string[];
  snippet: string;
}

export interface IndexStatus {
  phase: 'starting' | 'reconciling' | 'ready' | 'rebuilding' | 'degraded';
  available: boolean;
  initialScanComplete: boolean;
  generation: string;
  revision: number;
  watcherMode: string;
  indexedNotes: number;
  pendingPaths: number;
  errorCount: number;
  lastReconcileAt: string | null;
  lastHashAuditAt: string | null;
  persistenceError: boolean;
}

export interface MatchContext {
  text: string;
  ranges: [number, number][];
  pre: boolean;
  post: boolean;
}

export interface NoteMatches {
  path: string;
  count: number;
  contexts: MatchContext[];
}

export interface GitCommit {
  hash: string;
  date: string;
  message: string;
  author: string;
}

// Tasks board (FR-15) query params. Keep in sync with server/src/services/tasks.ts's TaskFilter.
export interface TaskQuery {
  folder?: string;
  status?: string;
  priority?: string;
  owner?: string;
  q?: string;
}

// Tasks board (FR-15). Keep in sync with server/src/services/tasks.ts's TaskRecord.
export interface TaskRecord {
  path: string; // vault-relative
  title: string; // frontmatter title, fallback file name without extension
  status: string; // canonical id if canonical/alias; else the raw value unchanged; 'open' when missing
  statusRaw: string | null; // raw frontmatter value as a string; null when the key is absent/empty
  priority: string | null;
  owner: string | null;
  due: string | null; // 'YYYY-MM-DD' | other raw string (e.g. 'none') | null
  raised: string | null;
  created: string | null;
  updated: string | null;
  tags: string[];
}

/**
 * Unlocking a locked note is deliberate and per-session: the editor sets this only after the
 * human confirms (or types the operator password, when `_system/locks.json` asks for one), and
 * every write then carries the headers below. The server re-checks them on each request.
 */
let unlock: { active: boolean; password?: string } = { active: false };

export function setUnlock(v: { active: boolean; password?: string }): void {
  unlock = v;
}

export function isUnlocked(): boolean {
  return unlock.active;
}

async function req<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const { headers: optHeaders, ...rest } = opts;
  const res = await fetch(url, {
    credentials: 'include',
    ...rest,
    // headers MUST be merged last — spreading ...opts after a `headers` literal
    // would drop Content-Type whenever a caller passes its own headers.
    headers: {
      'Content-Type': 'application/json',
      ...(unlock.active
        ? { 'x-unlock-locked': '1', ...(unlock.password ? { 'x-unlock-password': unlock.password } : {}) }
        : {}),
      ...(optHeaders ?? {}),
    },
  });
  if (res.status === 401) {
    throw new ApiError('Unauthorized', 401);
  }
  if (!res.ok) {
    let msg = res.statusText;
    let data: unknown;
    try {
      const body = await res.json();
      msg = body.error ?? msg;
      data = body;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status, data);
  }
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('application/json') ? res.json() : (res.text() as unknown)) as Promise<T>;
}

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image: string | null;
  domain: string;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public data?: unknown) {
    super(message);
  }
}

/**
 * Lets the store react to renames/moves (e.g. keep manual sort order) no matter which component
 * triggered them, without api.ts depending on the store.
 */
export interface RenameHook {
  start(): void;
  done(from: string, to: string, ok: boolean): void;
}
let renameHook: RenameHook | null = null;
export function setRenameHook(h: RenameHook | null): void {
  renameHook = h;
}

export const api = {
  readCode:(path:string,signal?:AbortSignal)=>req<CodeFileReadResult>('/api/files/code-content?path='+encodeURIComponent(path),{signal}),
  // auth
  // /auth/status is unauthenticated, so it deliberately reports nothing about
  // whether the default password is still in use. mustChangePassword comes from
  // /auth/login and /auth/me instead.
  authStatus: () => req<{ passwordSet: boolean }>('/auth/status'),
  setup: (password: string) =>
    req<{ ok: true }>('/auth/setup', { method: 'POST', body: JSON.stringify({ password }) }),
  login: (password: string) =>
    req<{ ok: true; mustChangePassword: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<{ ok: true }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  me: () => req<{ authenticated: boolean; mustChangePassword: boolean }>('/auth/me'),

  linkPreview: (url: string) => req<LinkPreview>(`/api/linkpreview?url=${encodeURIComponent(url)}`),

  // files
  draftScope: () => req<{scopeId:string}>('/api/files/draft-scope'),
  vaultPreferences: getVaultPreferences,
  tree: () => req<TreeNode>('/api/files/'),
  read: (path: string, draftScopeId?: string) =>
    req<{
      path: string;
      content: string;
      encoding?: string;
      version?: string;
      locked?: boolean;
      lockReason?: string;
      unlock?: 'off' | 'confirm' | 'password';
    }>(`/api/files/content?path=${encodeURIComponent(path)}${draftScopeId===undefined?'':'&draftScopeId='+encodeURIComponent(draftScopeId)}`),
  // baseVersion (CAS): when given, the server rejects a stale write with 409 version_conflict.
  write: (path: string, content: string, baseVersion?: string, draftScopeId?: string) =>
    req<{ ok: true; path: string; version?: string }>('/api/files/content', {
      method: 'PUT',
      body: JSON.stringify({ path, content, ...(baseVersion !== undefined ? { baseVersion } : {}), ...(draftScopeId!==undefined?{draftScopeId}:{}) }),
    }),
  createFolder: (path: string) =>
    req<{ ok: true }>('/api/files/folder', { method: 'POST', body: JSON.stringify({ path }) }),
  rename: async (from: string, to: string) => {
    renameHook?.start();
    let ok = false;
    try {
      const send=(updateLinks?:boolean)=>req<{ok:true;changedPaths?:string[];versions?:Record<string,string>}>('/api/files/rename',{method:'PATCH',body:JSON.stringify({from,to,...(updateLinks===undefined?{}:{updateLinks})})});
      let r;try{r=await send();}catch(error){
        if(!(error instanceof ApiError)||(error.data as {code?:string})?.code!=='rename_confirmation_required')throw error;
        let keep=false;const update=await confirmDialog('Update links to the renamed file?',{confirmLabel:'Rename and update links',alternativeLabel:'Rename without updating links',onAlternative:()=>{keep=true;}});
        if(!update&&!keep)throw new Error('Rename cancelled');r=await send(update);
      }
      ok = true;
      return r;
    } finally {
      renameHook?.done(from, to, ok);
    }
  },
  copy: (from: string, to: string) =>
    req<{ ok: true }>('/api/files/copy', { method: 'POST', body: JSON.stringify({ from, to }) }),
  remove: (path: string, permanent = false,confirmedMode?:'trash'|'permanent') =>
    req<{ ok: true; trashed?: string; deleted?: string;pendingAttachments?:string[];cleanupReceipt?:string;cleanupWarning?:string }>(
      `/api/files/?path=${encodeURIComponent(path)}${permanent ? '&permanent=1' : ''}${confirmedMode?'&confirmedMode='+confirmedMode:''}`,
      { method: 'DELETE' },
    ),
  resolveAttachment: (path: string, from: string) =>
    req<{ path: string | null }>(
      `/api/files/resolve?path=${encodeURIComponent(path)}&from=${encodeURIComponent(from)}`,
    ),
  // notes (other than `exclude`) still referencing an attachment
  references: (path: string, exclude?: string,sourceContent?:string) =>
    req<{ references: string[];sourceReferences?:number; deleteMode?: 'trash' | 'permanent' }>(
      sourceContent===undefined?`/api/files/references?path=${encodeURIComponent(path)}${exclude ? `&exclude=${encodeURIComponent(exclude)}` : ''}`:'/api/files/references',
      sourceContent===undefined?undefined:{method:'POST',body:JSON.stringify({path,exclude,sourceContent})},
    ),
  cleanupAttachments:(sourcePath:string,selected:string[],receipt:string)=>req<{deleted:string[];kept:string[]}>('/api/files/attachments/cleanup',{method:'POST',body:JSON.stringify({sourcePath,selected,receipt})}),
  deleteAttachment: (sourcePath:string,targetPath:string,sourceVersion:string,draftScopeId:string,confirmedMode:'trash'|'permanent') =>
    req<{outcome:'kept'|'trashed'|'deleted';path:string}>('/api/files/attachments/delete',{
      method:'POST',body:JSON.stringify({sourcePath,targetPath,sourceVersion,draftScopeId,confirmedMode}),
    }),
  // trash (FR-1)
  listTrash: () => req<{ items: TrashItem[] }>('/api/files/trash'),
  restoreTrash: (path: string) =>
    req<{ ok: true; restored: string }>('/api/files/trash/restore', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  deleteTrashItem: (path: string) =>
    req<{ ok: true }>(`/api/files/trash/item?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  emptyTrash: () => req<{ ok: true }>('/api/files/trash', { method: 'DELETE' }),
  uploadUrl: () => '/api/files/upload',
  upload: async (file: File, dir = 'attachments', sourcePath?: string) => {
    const fd = new FormData();
    if (sourcePath !== undefined) fd.append('sourcePath', sourcePath);
    else fd.append('dir', dir);
    fd.append('file', file);
    const res = await fetch('/api/files/upload', { method: 'POST', credentials: 'include', body: fd });
    if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error ?? 'Upload failed', res.status);
    return res.json() as Promise<{ ok: true; path: string; relativePath: string; size: number }>;
  },
  rawUrl: (path: string, from?: string) => `/api/files/content?path=${encodeURIComponent(path)}${from ? `&from=${encodeURIComponent(from)}` : ''}`,
  /** Same route, but the server sends it as an attachment under its own name (FR-22). */
  downloadUrl: (path: string) =>
    `/api/files/content?path=${encodeURIComponent(path)}&download=1`,

  // search & links
  // limit omitted → server returns every match (panel renders them incrementally)
  search: (q: string, limit?: number) =>
    req<{ hits: SearchHit[]; index?: IndexStatus }>(
      `/api/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ''}`,
    ),
  // per-note highlighted match contexts for the given paths (lazy, batched);
  // phrase=true matches the whole query as one needle (unlinked mentions)
  searchMatches: (query: string, paths: string[], matchCase = false, phrase = false) =>
    req<{ matches: NoteMatches[] }>('/api/search/matches', {
      method: 'POST',
      body: JSON.stringify({ query, paths, matchCase, phrase }),
    }),
  tags: () => req<{ tags: { tag: string; count: number }[] }>('/api/tags'),
  properties: () =>
    req<{ properties: { key: string; type: string; count: number }[] }>('/api/properties'),
  propertyTypes: () => req<{ types: Record<string, string> }>('/api/property-types'),
  setPropertyType: (key: string, type: string) =>
    req<{ types: Record<string, string> }>('/api/property-types', {
      method: 'POST',
      body: JSON.stringify({ key, type }),
    }),
  backlinks: (path: string) =>
    req<{ backlinks: string[] }>(`/api/backlinks?path=${encodeURIComponent(path)}`),
  resolve: (target: string, from?: string,kind:'wiki'|'markdown'='wiki') =>
    req<{ path: string | null }>(`/api/resolve?target=${encodeURIComponent(target)}&kind=${kind}${from ? `&from=${encodeURIComponent(from)}` : ''}`),
  graph: () =>
    req<{
      nodes: { id: string; label: string; kind: 'note' | 'attachment' | 'unresolved'; tags: string[] }[];
      edges: { source: string; target: string }[];
    }>('/api/graph'),
  reindex: () => req<{ ok: true }>('/api/reindex', { method: 'POST' }),
  indexStatus: () => req<IndexStatus>('/api/index/status'),
  indexJob: (mode: 'reconcile' | 'rebuild') => req<{jobId:string}>('/api/index/jobs', {
    method: 'POST', body: JSON.stringify({mode}),
  }),

  // tasks board (FR-15)
  tasks: (params?: TaskQuery) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) qs.set(key, value);
    }
    const s = qs.toString();
    return req<{ tasks: TaskRecord[] }>(`/api/tasks${s ? `?${s}` : ''}`);
  },

  // ui state (workspace persistence, shared across browsers)
  getUiState: () => req<any>('/api/uistate/'),
  putUiState: (state: any, clientId: string) =>
    req<{ ok: true }>('/api/uistate/', {
      method: 'PUT',
      headers: { 'X-Client-Id': clientId },
      body: JSON.stringify(state),
    }),

  // settings
  getSettings: () => req<Settings>('/api/settings/'),
  putSettings: (patch: any) => req<any>('/api/settings/', { method: 'PUT', body: JSON.stringify(patch) }),
  browse: (dir?: string) =>
    req<{ dir: string; parent: string; roots: string[]; folders: { name: string; path: string }[] }>(
      `/api/settings/browse${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`,
    ),

  // git
  gitStatus: () => req<any>('/api/git/status'),
  gitInit: () => req<any>('/api/git/init', { method: 'POST' }),
  gitClone: () => req<any>('/api/git/clone', { method: 'POST' }),
  gitPull: () => req<{ message: string }>('/api/git/pull', { method: 'POST' }),
  gitCommit: (message?: string) =>
    req<{ message: string }>('/api/git/commit', { method: 'POST', body: JSON.stringify({ message }) }),
  gitPush: () => req<{ message: string }>('/api/git/push', { method: 'POST' }),
  gitSync: (message?: string) =>
    req<{ ok: boolean; log: string[] }>('/api/git/sync', { method: 'POST', body: JSON.stringify({ message }) }),
  gitLog: (path: string) =>
    req<{ commits: GitCommit[] }>(`/api/git/log?path=${encodeURIComponent(path)}`),
  gitShow: (hash: string, path: string) =>
    req<{ content: string }>(`/api/git/show?hash=${encodeURIComponent(hash)}&path=${encodeURIComponent(path)}`),

  // api keys
  listKeys: () => req<{ keys: any[] }>('/api/keys/'),
  createKey: (name: string, scopes: string[]) =>
    req<{ key: string; record: any }>('/api/keys/', { method: 'POST', body: JSON.stringify({ name, scopes }) }),
  revokeKey: (id: string) => req<{ ok: boolean }>(`/api/keys/${id}`, { method: 'DELETE' }),

  // public shares (FR-10)
  listShares: () => req<{ shares: ShareRecord[] }>('/api/shares/'),
  createShare: (path: string) =>
    req<{ share: ShareRecord }>('/api/shares/', { method: 'POST', body: JSON.stringify({ path }) }),
  setShareEnabled: (id: string, enabled: boolean) =>
    req<{ share: ShareRecord }>(`/api/shares/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  deleteShare: (id: string) => req<{ ok: true }>(`/api/shares/${id}`, { method: 'DELETE' }),
  // password = null clears the share's password
  setSharePassword: (id: string, password: string | null) =>
    req<{ share: ShareRecord }>(`/api/shares/${id}`, { method: 'PATCH', body: JSON.stringify({ password }) }),
  // NOTE: the public-facing /share/<id> page is fully server-rendered (SSR) —
  // the SPA never fetches /public/shares/* itself.

  // plugins
  listPlugins: () => req<{ plugins: any[];vaultIdentity:string }>('/api/plugins/'),
  installPlugin: (repo: string) =>
    req<{ plugin: any }>('/api/plugins/install', { method: 'POST', body: JSON.stringify({ repo }) }),
  pluginData: (id:string,vaultIdentity:string) => req<{data:unknown|null}>(`/api/plugins/${encodeURIComponent(id)}/data`,{headers:{'X-Plugin-Vault':vaultIdentity}}),
  savePluginData: (id:string,data:unknown,vaultIdentity:string) => req<{ok:true}>(`/api/plugins/${encodeURIComponent(id)}/data`,{method:'PUT',headers:{'X-Plugin-Vault':vaultIdentity},body:JSON.stringify({data})}),
  setPluginEnabled: (id: string, enabled: boolean) =>
    req<{ ok: true }>(`/api/plugins/${id}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
};
