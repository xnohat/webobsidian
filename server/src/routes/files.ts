import {readCodeFile} from '../services/codeFileReader.js';
import {resolveReference} from '../services/fileReferences.js';
import {indexedFilePaths} from '../services/fileindex.js';
import {randomUUID} from 'node:crypto';
import {collectNoteAttachmentCandidates,cleanupNoteAttachments} from '../services/noteAttachmentCleanup.js';
import {fileReferenceReport,findFileReferences} from '../services/referenceScan.js';
import {deleteUnreferencedAttachment} from '../services/attachmentDeletion.js';
import {getVaultPreferences} from '../services/vaultPreferences.js';
import {getDraftScope} from '../services/draftScopes.js';
import { Router, type Request, type Response } from 'express';
import { indexing } from '../services/indexing/coordinator.js';
import multer from 'multer';
import path from 'node:path';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import * as vault from '../services/vault.js';
import { getSettings } from '../services/settings.js';
import { qmd } from '../services/search.js';
import { updateLinkGraphForFile } from '../services/links.js';
import { scheduleAutoCommitOnSave } from '../services/git.js';
import { resolveFile } from '../services/fileindex.js';
import { onFileRenamed } from '../services/shares.js';
import { mimeFor, attachmentDisposition } from '../services/mime.js';
import { sendFileWithRange } from '../services/httpfile.js';
import { contentVersion, checkVersion } from '../services/noteversion.js';
import { annotateTree, loadLocks, lockFor, sessionMayWrite, targetsOf } from '../services/locks.js';

const cleanupReceipts=new Map<string,{root:string;sourcePath:string;candidates:string[];expires:number;confirmedMode:'trash'|'permanent'}>();
function issueCleanupReceipt(root:string,sourcePath:string,candidates:string[],confirmedMode:'trash'|'permanent'){for(const [key,v] of cleanupReceipts)if(v.expires<Date.now())cleanupReceipts.delete(key);if(cleanupReceipts.size>=512)cleanupReceipts.delete(cleanupReceipts.keys().next().value!);const key=randomUUID();cleanupReceipts.set(key,{root,sourcePath,candidates,confirmedMode,expires:Date.now()+15*60*1000});return key;}
export const filesRouter = Router();
filesRouter.use(requireAuth);
filesRouter.get('/code-content',asyncHandler(async(req,res)=>{if(typeof req.query.path!=='string'||!req.query.path)throw Object.assign(new Error('path required'),{status:400});res.json(await readCodeFile(req.query.path));}));
filesRouter.get('/draft-scope',asyncHandler(async(_req,res)=>{res.json({scopeId:await getDraftScope((await getSettings()).vault.path)});}));

// Locked paths (the areas the agent maintains: raw evidence, generated pages, `_system/`) are
// readable but not writable from a browser session. The agent is unaffected — it writes through
// the API-key router (`/api/v1`), which never passes this middleware. The list is
// `_system/locks.json`; see `services/locks.ts` for the glob syntax and the unlock modes.
filesRouter.use(
  asyncHandler(async (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    for (const rel of targetsOf(req)) {
      const verdict = await sessionMayWrite(req, rel);
      if (!verdict.ok) {
        const { unlock } = await loadLocks();
        res.status(423).json({ error: 'locked', path: rel, reason: verdict.reason, unlock });
        return;
      }
    }
    next();
  }),
);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 * 1024 } });

const isMd = (p: string) => /\.(md|markdown)$/i.test(p);

// Refresh derived indexes after a mutation (best-effort, non-blocking).
// Incremental: only the touched file(s) are reparsed, not the whole vault.
async function reindex(opts: { upsert?: string; added?: string; removed?: string } = {}) {
  if (indexing.isStarted) {
    indexing.notify({ root: await vault.getVaultRoot(), paths: [...new Set(Object.values(opts).filter((p): p is string => !!p))], source: 'web' });
  } else {
    if (opts.upsert) void qmd.upsert(opts.upsert).catch(() => {});
    if (opts.removed) qmd.remove(opts.removed);
    if (opts.added && isMd(opts.added)) void updateLinkGraphForFile(opts.added).catch(() => {});
    if (opts.removed && isMd(opts.removed)) void updateLinkGraphForFile(opts.removed, true).catch(() => {});
  }
  scheduleAutoCommitOnSave();
}

// Keep both the write and its index notification bound to the same captured vault.
function mutationHandler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return asyncHandler(async (req, res) => vault.withVaultMutation(() => fn(req, res)));
}

/** `?download`, `?download=1`, `?download=true` (FR-22). */
function wantsDownload(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(wantsDownload);
  return value === '' || value === '1' || value === 'true' || value === 'yes';
}

filesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    // Lock flags ride along so the tree can badge the agent-owned paths without a second request.
    res.json(await annotateTree(await vault.listTree()));
  }),
);

// Resolve a link/embed target to a real vault path. Relative references
// (`attachments/x.png`) resolve against the folder of the note that embeds them
// (`from`) first, then fall back to the Obsidian-style vault-wide basename lookup.
async function resolveRef(target: string, from: string): Promise<string> {
  let rel = target;
  if (from && !rel.startsWith('/')) {
    const dir = path.posix.dirname(from);
    const cand = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, rel));
    if (!cand.startsWith('..') && (await vault.exists(cand))) return cand;
  }
  if (!(await vault.exists(rel))) {
    if (indexing.isStarted) indexing.assertReady();
    let decoded=rel;try{decoded=decodeURIComponent(rel);}catch{}
    const available=[...indexedFilePaths()];if(decoded!==rel){const dir=path.posix.dirname(from||'.');for(const p of [path.posix.normalize(path.posix.join(dir,decoded)),decoded])if(await vault.exists(p))available.push(p);}
    const resolved = resolveReference(rel,from,available,'wiki')??resolveFile(rel);
    if (resolved) rel = resolved;
  }
  return rel;
}

filesRouter.get(
  '/resolve',
  asyncHandler(async (req, res) => {
    const target = String(req.query.path ?? '');
    if (!target) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    const rel = await resolveRef(target, typeof req.query.from === 'string' ? req.query.from : '');
    res.json({ path: (await vault.exists(rel)) ? rel : null });
  }),
);

/** Scope check and operation share the vault's captured settings and mutation queue. */
async function withDraftScope<T>(scope: unknown, action: () => Promise<T>): Promise<T> {
  if(scope===undefined)return action();
  return vault.withVaultMutation(async()=>{
    if(typeof scope!=='string'||scope!==await getDraftScope(await vault.getVaultRoot()))throw Object.assign(new Error('draft_scope_changed'),{status:409});
    return action();
  });
}

filesRouter.get(
  '/content',
  asyncHandler(async (req, res) => withDraftScope(req.method==='GET'?req.query.draftScopeId:req.body?.draftScopeId,async()=>{
    const target = String(req.query.path ?? '');
    if (!target) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    const rel = await resolveRef(target, typeof req.query.from === 'string' ? req.query.from : '');
    // Still missing: a text-looking path that is not there is a 404. Without this the read fell
    // through to readFileText and surfaced ENOENT as a 500 (found by the deploy smoke).
    if (!(await vault.exists(rel))) {
      res.status(404).json({ error: 'not_found', path: rel });
      return;
    }
    if (vault.isTextFile(rel)) {
      const content = await vault.readFileText(rel);
      // Additive: existing clients that ignore `version` are unaffected. Used as
      // the compare-and-set base for PUT (e.g. the Tasks board's write-back).
      const rule = await lockFor(rel);
      const { unlock } = await loadLocks();
      res.json({
        path: rel,
        content,
        encoding: 'utf8',
        version: contentVersion(content),
        locked: !!rule,
        lockReason: rule?.reason,
        unlock,
      });
    } else {
      // Stream with Range support so embedded <video>/<audio> can seek.
      const abs = await vault.resolveInVault(rel);
      const headers: Record<string, string> = {};
      // `?download=1` (FR-22): save it under its own name instead of letting the
      // browser name it after the URL — `/api/files/content?path=…` otherwise
      // lands as `content`, with no extension, and nothing can open it.
      if (wantsDownload(req.query.download)) {
        headers['Content-Disposition'] = attachmentDisposition(path.posix.basename(rel));
      }
      await sendFileWithRange(req, res, abs, mimeFor(rel), headers);
    }
  })),
);

filesRouter.put(
  '/content',
  mutationHandler(async (req, res) => withDraftScope(req.method==='GET'?req.query.draftScopeId:req.body?.draftScopeId,async()=>{
    const { path: rel, content, baseVersion } = req.body ?? {};
    if (typeof rel !== 'string' || typeof content !== 'string') {
      res.status(400).json({ error: 'path and content required' });
      return;
    }
    // Optimistic lock (compare-and-set), same contract as the Agent API's
    // base_version: only checked when the caller sends baseVersion — omitting
    // it keeps the old last-writer-wins autosave behaviour byte-for-byte. When
    // baseVersion IS sent, a missing file only satisfies baseVersion === '' —
    // otherwise a card move racing a delete would silently recreate the note.
    let conflict: string | undefined;
    await vault.mutateFileText(rel, current => {
      if (typeof baseVersion === 'string') {
        const check = checkVersion(current, baseVersion);
        if (!check.ok) {
          conflict = check.currentVersion;
          throw Object.assign(new Error('version_conflict'), { status: 409, currentVersion: conflict });
        }
      }
      return { content, result: undefined };
    }).catch(error => {
      if (conflict === undefined) throw error;
    });
    if (conflict !== undefined) {
      res.status(409).json({ error: 'version_conflict', currentVersion: conflict });
      return;
    }
    await reindex({ upsert: rel, added: rel });
    res.json({ ok: true, path: rel, version: contentVersion(content) });
  })),
);

filesRouter.post(
  '/folder',
  mutationHandler(async (req, res) => {
    const { path: rel } = req.body ?? {};
    if (typeof rel !== 'string') {
      res.status(400).json({ error: 'path required' });
      return;
    }
    await vault.createFolder(rel);
    await reindex({added:rel});
    res.json({ ok: true, path: rel });
  }),
);

filesRouter.post(
  '/upload',
  upload.single('file'),
  mutationHandler(async (req, res) => {
    const sourcePath = req.body?.sourcePath;
    if (sourcePath !== undefined && typeof sourcePath !== 'string') {
      res.status(400).json({ error: 'sourcePath must be a string' });
      return;
    }
    const dir = sourcePath !== undefined ? await vault.resolveAttachmentDir(sourcePath) : String(req.body?.dir ?? '');
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'file required' });
      return;
    }
    // Reuse an existing folder that differs only in case (e.g. an Obsidian vault's
    // "Attachments") instead of creating a duplicate "attachments". See vault.ts.
    const rel = await vault.withVaultMutation(async () => {
    const resolvedDir = dir ? await vault.resolveDirCaseInsensitive(dir) : '';
    // Never overwrite an existing attachment: pick image.png, image-1.png, image-2.png, …
    const original = path.posix.basename(file.originalname.replace(/\\/g, '/')) || 'file';
    const ext = path.posix.extname(original);
    const stem = ext ? original.slice(0, -ext.length) : original;
    let rel = path.posix.join(resolvedDir, original);
    for (let i = 1; await vault.exists(rel); i++) {
      rel = path.posix.join(resolvedDir, `${stem}-${i}${ext}`);
    }
    // Multipart fields and the actual collision-free destination are only known here.
    const verdict = await sessionMayWrite(req, rel);
    if (!verdict.ok) {
      const { unlock } = await loadLocks();
      res.status(423).json({ error: 'locked', path: rel, reason: verdict.reason, unlock });
      return null;
    }
    await vault.writeFileBuffer(rel, file.buffer);
    await reindex({added:rel});
    return rel;
    });
    if (rel !== null) res.json({ ok: true, path: rel, relativePath: vault.attachmentRelativeUrl(rel, sourcePath ?? ''), size: file.size });
  }),
);

filesRouter.patch(
  '/rename',
  mutationHandler(async (req, res) => {
    const { from, to } = req.body ?? {};
    if (typeof from !== 'string' || typeof to !== 'string') {
      res.status(400).json({ error: 'from and to required' });
      return;
    }
    const renameResult=await vault.rename(from, to,{updateLinks:typeof req.body.updateLinks==='boolean'?req.body.updateLinks:undefined,mayWrite:async p=>(await sessionMayWrite(req,p)).ok});
    if (!indexing.isStarted) await qmd.rename(from, to);
    await onFileRenamed(from, to).catch(() => {}); // keep public share links pointing at the note
    await reindex({ added: to, removed: from });
    for(const p of renameResult.removedPaths??[])await reindex({removed:p});
    for(const p of renameResult.changedPaths)await reindex({upsert:p,added:p});
    res.json({ ok: true, from, to,...renameResult });
  }),
);

filesRouter.post(
  '/copy',
  mutationHandler(async (req, res) => {
    const { from, to } = req.body ?? {};
    if (typeof from !== 'string' || typeof to !== 'string') {
      res.status(400).json({ error: 'from and to required' });
      return;
    }
    const copied = await vault.copy(from, to);
    for (const f of copied) await reindex({upsert:f,added:f});
    res.json({ ok: true, from, to });
  }),
);

// --- Trash (FR-1) -----------------------------------------------------------
// Listed/mutated via dedicated /trash* routes; the plain DELETE / below either
// trashes or permanently removes depending on settings.vault.deleteMode.

filesRouter.get(
  '/trash',
  asyncHandler(async (_req, res) => {
    res.json({ items: await vault.listTrash() });
  }),
);

filesRouter.post(
  '/trash/restore',
  mutationHandler(async (req, res) => {
    const rel = String(req.body?.path ?? '');
    if (!rel) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    const restored = await vault.restoreFromTrash(rel);
    await reindex({ upsert: restored, added: restored });
    res.json({ ok: true, restored });
  }),
);

// Permanently delete one trashed item.
filesRouter.delete(
  '/trash/item',
  mutationHandler(async (req, res) => {
    const rel = String(req.query.path ?? '');
    if (!rel) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    await vault.deleteFromTrash(rel);
    res.json({ ok: true });
  }),
);

// Empty the whole trash.
filesRouter.delete(
  '/trash',
  asyncHandler(async (_req, res) => {
    await vault.emptyTrash();
    res.json({ ok: true });
  }),
);

// Notes (other than `exclude`) that still reference the given attachment — used
// to protect shared attachments before deleting the file from an image's trash icon.
filesRouter.get(
  '/references',
  asyncHandler(async (req, res) => {
    const target = String(req.query.path ?? '');
    const exclude = String(req.query.exclude ?? '');
    if (!target) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    await vault.resolveInVault(target);
    const refs = await findFileReferences(target,exclude);
    res.json({ references: refs, deleteMode:(await getVaultPreferences()).values.deleteMode });
  }),
);

filesRouter.post('/references',asyncHandler(async(req,res)=>{const {path:target,exclude,sourceContent}=req.body??{};if(typeof target!=='string'||typeof exclude!=='string'||typeof sourceContent!=='string'){res.status(400).json({error:'path, exclude and sourceContent required'});return;}await vault.resolveInVault(target);const report=await fileReferenceReport(target,exclude,sourceContent);res.json({...report,deleteMode:(await getVaultPreferences(await vault.getVaultRoot())).values.deleteMode});}));

filesRouter.post('/attachments/cleanup',mutationHandler(async(req,res)=>{
 const {sourcePath,selected,receipt}=req.body??{};if(typeof sourcePath!=='string'||!Array.isArray(selected)||selected.some(p=>typeof p!=='string')){res.status(400).json({error:'sourcePath and selected paths required'});return;}
 const authorization=typeof receipt==='string'?cleanupReceipts.get(receipt):undefined;
 if(!authorization||authorization.root!==await vault.getVaultRoot()||authorization.sourcePath!==sourcePath||authorization.expires<Date.now()||selected.some(p=>!authorization.candidates.includes(p))){res.status(409).json({error:'Attachment cleanup selection expired or changed. Files kept.'});return;}
 const {values}=await getVaultPreferences(await vault.getVaultRoot());
 const result=await cleanupNoteAttachments({sourcePath,candidates:authorization.candidates,policy:'ask',selected,deleteAttachment:async p=>{if(!(await sessionMayWrite(req,p)).ok)throw Object.assign(Error('Read-only attachment'),{status:423});if(values.deleteMode==='permanent'&&authorization.confirmedMode==='permanent')await vault.remove(p);else await vault.trash(p);await reindex({removed:p});}});cleanupReceipts.delete(receipt);res.json(result);
}));

filesRouter.post('/attachments/delete', mutationHandler(async(req,res)=>{
 const {sourcePath,targetPath,sourceVersion,draftScopeId,confirmedMode}=req.body??{};
 if([sourcePath,targetPath,sourceVersion].some(v=>typeof v!=='string'||!v)){res.status(400).json({error:'sourcePath, targetPath and sourceVersion required'});return;}
 if(typeof draftScopeId!=='string'){res.status(400).json({error:'draftScopeId required'});return;}
 const result=await withDraftScope(draftScopeId,()=>deleteUnreferencedAttachment({sourcePath,targetPath,sourceVersion,confirmedMode,mayWrite:async p=>(await sessionMayWrite(req,p)).ok}));
 await reindex({removed:result.outcome==='kept'?undefined:result.path});res.json(result);
}));

filesRouter.delete(
  '/',
  mutationHandler(async (req, res) => {
    const rel = String(req.query.path ?? '');
    if (!rel) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    const {values:prefs}=await getVaultPreferences(await vault.getVaultRoot());
    const actionMode=req.query.confirmedMode==='trash'?'trash':(prefs.deleteMode==='permanent'||req.query.permanent==='1')?'permanent':'trash';
    const candidates=await collectNoteAttachmentCandidates(rel);
    const finishCleanup=async()=>cleanupNoteAttachments({sourcePath:rel,candidates,policy:prefs.deleteUnlinkedAttachments,deleteAttachment:async p=>{if(!(await sessionMayWrite(req,p)).ok)throw Object.assign(Error('Attachment is read-only'),{status:423});if(actionMode==='permanent')await vault.remove(p);else await vault.trash(p);await reindex({removed:p});}}).catch(()=>({pending:[] as string[],cleanupWarning:'The note was deleted, but attachment cleanup could not be completed. Check the remaining files.'}));
    if (actionMode === 'permanent') {
      await vault.remove(rel);
      await vault.pruneEmptyAttachmentsDir(rel);
      await reindex({ removed: rel });
      const cleanup=await finishCleanup();res.json({ ok: true, deleted: rel,pendingAttachments:cleanup.pending,...('cleanupWarning' in cleanup?{cleanupWarning:cleanup.cleanupWarning}:{}),...(cleanup.pending.length?{cleanupReceipt:issueCleanupReceipt(await vault.getVaultRoot(),rel,cleanup.pending,actionMode)}:{}) });
      return;
    }
    const dest = await vault.trash(rel);
    await vault.pruneEmptyAttachmentsDir(rel);
    await reindex({ removed: rel });
    const cleanup=await finishCleanup();res.json({ ok: true, trashed: dest,pendingAttachments:cleanup.pending,...('cleanupWarning' in cleanup?{cleanupWarning:cleanup.cleanupWarning}:{}),...(cleanup.pending.length?{cleanupReceipt:issueCleanupReceipt(await vault.getVaultRoot(),rel,cleanup.pending,actionMode)}:{}) });
  }),
);
