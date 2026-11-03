import { Router } from 'express';
import { indexing } from '../services/indexing/coordinator.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { CodeFileViewerSchema, getSettings, updateSettings, redactSettings, ensureVaultBrowsable } from '../services/settings.js';
import { config } from '../config.js';
import { purgeExpiredTrash } from '../services/trashretention.js';
import {getVaultPreferences} from '../services/vaultPreferences.js';
import {LanguagePackSchema} from '../services/settings.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);
settingsRouter.get('/vault-preferences',asyncHandler(async(_req,res)=>{res.json(await getVaultPreferences());}));

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(redactSettings(await getSettings()));
  }),
);

// Patch a subset of settings. Secret fields are only overwritten when present.
settingsRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    if (body.ui?.languagePack !== undefined && body.ui.languagePack !== null) {
      const parsed = LanguagePackSchema.safeParse(body.ui.languagePack);
      if (!parsed.success) throw Object.assign(new Error('Invalid language pack'), {status:400});
      body.ui.languagePack = parsed.data;
    }
    if(body.ui?.codeFileViewer!==undefined){const parsed=CodeFileViewerSchema.safeParse(body.ui.codeFileViewer);if(!parsed.success)throw Object.assign(new Error('Invalid code viewer settings'),{status:400});body.ui.codeFileViewer=parsed.data;}
    const previousVault = (await getSettings()).vault;
    // A changed vault.path turns the whole files API into read/write over that
    // tree, so constrain it to the allowed roots (same gate as Browse…) and
    // require it to be an existing directory before persisting.
    if (body.vault && Object.hasOwn(body.vault,'path')) {
      if(typeof body.vault.path!=='string'||!body.vault.path.trim())throw Object.assign(new Error('Vault path must not be blank'),{status:400});
      await assertVaultPathAllowed(body.vault);
    }
    const requestedVault = { ...previousVault, ...(body.vault ? sanitizeVault(body.vault) : {}) };
    const changesVault = path.resolve(previousVault.path) !== path.resolve(requestedVault.path)
      || JSON.stringify(previousVault.allowedRoots) !== JSON.stringify(requestedVault.allowedRoots);
    // Hold readiness until persistence and the corresponding index switch finish.
    const releaseTransition = indexing.isStarted && changesVault ? indexing.beginTransition() : () => {};
    try {
      const updated = await updateSettings((d) => {
        if (body.vault) {
          Object.assign(d.vault, sanitizeVault(body.vault));
          ensureVaultBrowsable(d);
        }
        if (body.git) {
          const { token, ...rest } = body.git;
          Object.assign(d.git, rest);
          if (typeof token === 'string' && token && token !== '••••••••') d.git.token = token;
        }
        if (body.search) Object.assign(d.search, body.search);
        if (body.ui) Object.assign(d.ui, body.ui);
        if (body.api && typeof body.api.rateLimitPerMin === 'number') {
          d.api.rateLimitPerMin = body.api.rateLimitPerMin;
        }
      });
      if (indexing.isStarted && (path.resolve(previousVault.path) !== path.resolve(updated.vault.path) || JSON.stringify(previousVault.allowedRoots) !== JSON.stringify(updated.vault.allowedRoots))) {
        // Another settings request may already have published a newer vault.
        await indexing.switchVault((await getSettings()).vault.path);
      }
      // A new retention period applies right away (don't wait for the hourly check).
      if (body.vault && 'trashRetentionDays' in body.vault) {
        void purgeExpiredTrash().catch(() => undefined);
      }
      res.json(redactSettings(updated));
    } catch (error) {
      // A failed index switch can follow a successful settings persist. Align
      // with the committed active vault; a persist failure retains the old root.
      if (indexing.isStarted && changesVault) {
        const active = (await getSettings()).vault;
        if (path.resolve(previousVault.path) !== path.resolve(active.path)
          || JSON.stringify(previousVault.allowedRoots) !== JSON.stringify(active.allowedRoots)) {
          await indexing.switchVault(active.path);
        }
      }
      throw error;
    } finally {
      releaseTransition();
    }
  }),
);

function sanitizeVault(v: any) {
  const out: any = {};
  if (typeof v.path === 'string') out.path = v.path;
  if (typeof v.trash === 'string') out.trash = v.trash;
  if (v.deleteMode === 'trash' || v.deleteMode === 'permanent') out.deleteMode = v.deleteMode;
  if (typeof v.followObsidianDeletion === 'boolean') out.followObsidianDeletion = v.followObsidianDeletion;
  if (typeof v.attachmentDir === 'string') out.attachmentDir = v.attachmentDir;
  // Whole days, 0 (keep forever) … 3650. Anything else is dropped rather than persisted.
  if (Number.isInteger(v.trashRetentionDays) && v.trashRetentionDays >= 0 && v.trashRetentionDays <= 3650) {
    out.trashRetentionDays = v.trashRetentionDays;
  }
  if (Array.isArray(v.allowedRoots)) {
    // allowedRoots is the gate for vault.path / Browse, so keep it well-formed:
    // only non-empty strings, normalised to absolute paths. Drops anything else
    // instead of persisting garbage (objects/numbers) that later crash path.* .
    out.allowedRoots = v.allowedRoots
      .filter((r: unknown): r is string => typeof r === 'string' && r.trim() !== '')
      .map((r: string) => path.resolve(r));
  }
  return out;
}

/**
 * The hard boundary for where the vault may live. Comes ONLY from operator-
 * controlled configuration — the env ALLOWED_ROOTS, else the home directory — and
 * NEVER from the request body or from mutable settings. Otherwise the new path was
 * validated against `allowedRoots` taken from the same request, so a request could
 * authorize its own path (e.g. {"path":"/","allowedRoots":["/"]}) and repoint the
 * whole files API at the host filesystem.
 */
function authorizedRoots(): string[] {
  const roots = config.allowedRoots.length ? config.allowedRoots : [os.homedir()];
  return roots.map((r) => path.resolve(r));
}

/** True iff `target` resolves to, or inside, one of `roots`. */
export function isWithinRoots(target: string, roots: string[]): boolean {
  const t = path.resolve(target);
  return roots.some((r) => {
    const rr = path.resolve(r);
    return t === rr || t.startsWith(rr + path.sep);
  });
}

async function assertVaultPathAllowed(v: { path: unknown }): Promise<void> {
  const target = path.resolve(String(v.path));
  if (!isWithinRoots(target, authorizedRoots())) {
    throw Object.assign(new Error('Vault path is outside the allowed roots'), { status: 403 });
  }
  const st = await fs.stat(target).catch(() => null);
  if (!st || !st.isDirectory()) {
    throw Object.assign(new Error('Vault path is not an existing directory'), { status: 400 });
  }
  const resolved=await fs.realpath(target);
  const roots=await Promise.all(authorizedRoots().map(r=>fs.realpath(r).catch(()=>r)));
  if(!isWithinRoots(resolved,roots))throw Object.assign(new Error('Vault path resolves outside the allowed roots'),{status:403});
}


/** Safe folder browser for picking a vault path, limited to allowed roots. */
settingsRouter.get(
  '/browse',
  asyncHandler(async (req, res) => {
    // Bound the picker to the same hard roots that authorize a vault path — never
    // to mutable settings, which a prior request could have widened.
    const roots = authorizedRoots();
    const dir = req.query.dir ? path.resolve(String(req.query.dir)) : roots[0];
    if (!isWithinRoots(dir, roots)) {
      res.status(403).json({ error: 'Path outside allowed roots', roots });
      return;
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const folders = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, path: path.join(dir, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ dir, parent: path.dirname(dir), roots, folders });
  }),
);
