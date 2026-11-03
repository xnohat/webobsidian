import { Router } from 'express';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import * as vault from '../services/vault.js';
import { hashPassword, verifyPassword } from '../services/auth.js';
import { getSettings } from '../services/settings.js';
import {
  listShares, createShare, setShareEnabled, setSharePassword, deleteShare, getActiveShare,
  type ShareRecord,
} from '../services/shares.js';
import {localEmbedTargets,canvasAttachmentReferences,resolveCanvasFile,resolvePublicAttachment} from '../services/publicAttachments.js';
import { mimeFor } from '../services/mime.js';
import { sendFileWithRange } from '../services/httpfile.js';

const isMd = (p: string) => /\.(md|markdown)$/i.test(p);
const isCanvas = (p: string) => /\.canvas$/i.test(p);
const isShareable = (p: string) => isMd(p) || isCanvas(p);

/** Never send the password hash to the client — expose `hasPassword` only. */
function redact(rec: ShareRecord) {
  const { passwordHash, ...rest } = rec;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}

/** ---- Management API (session auth) — /api/shares ------------------------- */

export const sharesRouter = Router();
sharesRouter.use(requireAuth);

sharesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ shares: (await listShares()).map(redact) });
  }),
);

sharesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const rel = String(req.body?.path ?? '');
    if (!rel || !isShareable(rel)) {
      res.status(400).json({ error: 'path to a .md or .canvas note required' });
      return;
    }
    if (!(await vault.exists(rel))) {
      res.status(404).json({ error: 'note not found' });
      return;
    }
    res.json({ share: redact(await createShare(rel)) });
  }),
);

// Update a share: { enabled?: boolean, password?: string | null }.
// password: non-empty string sets it (scrypt-hashed); null/'' removes it.
sharesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { enabled, password } = req.body ?? {};
    const hasEnabled = typeof enabled === 'boolean';
    const hasPassword = password !== undefined;
    if (!hasEnabled && !hasPassword) {
      res.status(400).json({ error: 'enabled (boolean) or password (string|null) required' });
      return;
    }
    if (hasPassword && password !== null && typeof password !== 'string') {
      res.status(400).json({ error: 'password must be a string or null' });
      return;
    }
    let rec = hasEnabled ? await setShareEnabled(req.params.id, enabled) : null;
    if (hasPassword) {
      const hash = password ? await hashPassword(password) : null;
      rec = await setSharePassword(req.params.id, hash);
    }
    if (!rec) {
      res.status(404).json({ error: 'share not found' });
      return;
    }
    res.json({ share: redact(rec) });
  }),
);

sharesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ok = await deleteShare(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'share not found' });
      return;
    }
    res.json({ ok: true });
  }),
);

/** ---- Public API (NO auth) — /public/shares ------------------------------- */

/** Only files directly present in this publication grant byte access. */
export async function resolveSharedAttachments(share:ShareRecord,source?:string):Promise<Set<string>>{
 const content=source??await vault.readFileText(share.path);
 const refs=isCanvas(share.path)?canvasAttachmentReferences(content):localEmbedTargets(content).map(target=>({target,rooted:false}));
 const allowed=new Set<string>();
 for(const ref of refs){
  const target=ref.rooted?await resolveCanvasFile(ref.target):await resolvePublicAttachment(ref.target,share.path);
  if(target&&!isMd(target))allowed.add(target);
 }
 return allowed;
}

export async function resolveSharedFile(share:ShareRecord,requested:string):Promise<string|null>{
 const target=isCanvas(share.path)?await resolveCanvasFile(requested):await resolvePublicAttachment(requested,share.path);
 if(!target||isMd(target))return null;
 return (await resolveSharedAttachments(share)).has(target)?target:null;
}

export const publicSharesRouter = Router();

const UNLOCK_TTL = '12h';
const unlockCookie = (id: string) => `wo_share_${id}`;

/** True when the share has no password, or the visitor carries a valid unlock cookie. */
export async function isUnlocked(req: Request, share: ShareRecord): Promise<boolean> {
  if (!share.passwordHash) return true;
  const token = req.cookies?.[unlockCookie(share.id)];
  if (!token) return false;
  try {
    const s = await getSettings();
    const payload = jwt.verify(token, s.auth.jwtSecret, { algorithms: ['HS256'] }) as {
      sub?: string;
      share?: string;
    };
    return payload.sub === 'share' && payload.share === share.id;
  } catch {
    return false;
  }
}

// Exchange the share password for an unlock cookie scoped to this share's
// public endpoints (httpOnly so embedded <img> requests send it automatically).
publicSharesRouter.post(
  '/:id/unlock',
  asyncHandler(async (req, res) => {
    const share = await getActiveShare(req.params.id);
    if (!share || !share.passwordHash) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const password = String(req.body?.password ?? '');
    if (!password || !(await verifyPassword(password, share.passwordHash))) {
      res.status(401).json({ error: 'wrong password' });
      return;
    }
    const s = await getSettings();
    const token = jwt.sign({ sub: 'share', share: share.id }, s.auth.jwtSecret, {
      expiresIn: UNLOCK_TTL,
      algorithm: 'HS256',
    });
    // Path '/' so both /public/shares/<id>/* (content, files) AND the SSR page
    // at /share/<id> receive it. The JWT is bound to this share id only.
    res.cookie(unlockCookie(share.id), token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 60 * 60 * 1000,
    });
    res.json({ ok: true });
  }),
);

publicSharesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const share = await getActiveShare(req.params.id);
    if (!share || !(await vault.exists(share.path))) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    if (!(await isUnlocked(req, share))) {
      res.status(401).json({ error: 'password required', passwordRequired: true });
      return;
    }
    const title = (share.path.split('/').pop() ?? share.path).replace(/\.(md|markdown|canvas)$/i, '');
    // NOTE: only title + content — the vault path/structure is not exposed.
    res.json({ title, content: await vault.readFileText(share.path) });
  }),
);

publicSharesRouter.get(
  '/:id/file',
  asyncHandler(async (req, res) => {
    const share = await getActiveShare(req.params.id);
    const requested = String(req.query.path ?? '');
    if (!share || !requested || !(await vault.exists(share.path))) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    if (!(await isUnlocked(req, share))) {
      res.status(401).json({ error: 'password required', passwordRequired: true });
      return;
    }
    const target = await resolveSharedFile(share,requested);
    if (!target) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    // Stream with Range support so shared <video>/<audio> can seek.
    const abs = await vault.resolveInVault(target);
    await sendFileWithRange(req, res, abs, mimeFor(target), { 'Cache-Control': 'private, max-age=300' });
  }),
);
