/**
 * Vault locks — paths the agent owns and the browser must not edit by accident.
 *
 * The two writers are already separate: the SPA writes through `/api/files` with a session
 * cookie, the agent writes through `/api/v1` with an API key. A lock therefore only has to
 * refuse the *session* one, which is a two-line guard rather than a second permission system.
 *
 * The list lives in `_system/locks.json` **inside the vault** (the vault keeps its own rules —
 * see ADR-0005), so it travels with the notes, can be changed without redeploying, and each
 * entry carries the reason the UI shows the human.
 */
import type { Request } from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getVaultRoot, type TreeNode } from './vault.js';
import { getSettings } from './settings.js';
import { verifyPassword } from './auth.js';

export const LOCKS_FILE = '_system/locks.json';

/** `off`: never editable from the browser. `confirm`: the human may unlock after confirming.
 *  `password`: only after typing the operator password. */
export type UnlockMode = 'off' | 'confirm' | 'password';

export interface LockRule {
  /** Vault-relative glob: `**` any depth, `*` within one segment, `?` one character. */
  glob: string;
  /** Shown to the human when they try to edit a locked note. */
  reason?: string;
}

export interface LockConfig {
  locked: LockRule[];
  unlock: UnlockMode;
}

/** No locks file, or an unreadable one: nothing is locked. A bad config must never block a write. */
const DEFAULTS: LockConfig = { locked: [], unlock: 'confirm' };

let cache: { mtimeMs: number; cfg: LockConfig } | null = null;

export async function loadLocks(force = false): Promise<LockConfig> {
  try {
    const abs = path.join(await getVaultRoot(), LOCKS_FILE);
    const st = await fs.stat(abs);
    if (!force && cache && cache.mtimeMs === st.mtimeMs) return cache.cfg;
    const raw = JSON.parse(await fs.readFile(abs, 'utf8')) as Partial<LockConfig>;
    const cfg: LockConfig = {
      locked: Array.isArray(raw.locked)
        ? raw.locked.filter((r): r is LockRule => !!r && typeof r.glob === 'string')
        : [],
      unlock: raw.unlock === 'off' || raw.unlock === 'password' ? raw.unlock : 'confirm',
    };
    cache = { mtimeMs: st.mtimeMs, cfg };
    return cfg;
  } catch {
    cache = null;
    return DEFAULTS;
  }
}

/** Reset the cache (tests, and the vault-root changing under us). */
export function resetLockCache(): void {
  cache = null;
}

/** Glob -> anchored RegExp. `**\/` also matches the vault root, so `**\/x.md` covers `x.md`. */
export function globToRegExp(glob: string): RegExp {
  const g = glob.trim().replace(/^\.?\//, '');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`, 'i');
}

/** The first rule covering `rel`, or null when it is writable. */
export async function lockFor(rel: string): Promise<LockRule | null> {
  const norm = (rel ?? '').replace(/^\/+/, '').trim();
  if (!norm) return null;
  const { locked } = await loadLocks();
  for (const rule of locked) if (globToRegExp(rule.glob).test(norm)) return rule;
  return null;
}

/** Every path a request would touch. Uniform on purpose: a locked area is also not a source to
 *  move or copy *from* through the browser — one rule, no surprises, and the message says why. */
export function targetsOf(req: Request): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v.trim().replace(/^\/+/, ''));
    else if (Array.isArray(v)) v.forEach(push);
  };
  const body = (req.body ?? {}) as Record<string, unknown>;
  for (const key of ['path', 'from', 'to', 'dir', 'paths', 'rel']) push(body[key]);
  for (const key of ['path', 'from', 'to', 'dir']) push(req.query?.[key]);
  return [...new Set(out)];
}

export interface WriteVerdict {
  ok: boolean;
  reason?: string;
}

/** May this *session* write `rel`? Honours the unlock headers per the configured mode. */
export async function sessionMayWrite(req: Request, rel: string): Promise<WriteVerdict> {
  const rule = await lockFor(rel);
  if (!rule) return { ok: true };
  const { unlock } = await loadLocks();
  const asked = String(req.headers['x-unlock-locked'] ?? '') === '1';
  if (asked && unlock === 'confirm') return { ok: true };
  if (asked && unlock === 'password') {
    const pw = String(req.headers['x-unlock-password'] ?? '');
    const s = await getSettings();
    const stored = s.auth?.userPasswordHash || s.auth?.passwordHash || '';
    if (pw && stored && (await verifyPassword(pw, stored))) return { ok: true };
    return { ok: false, reason: 'the unlock password was not accepted' };
  }
  return { ok: false, reason: rule.reason ?? 'this note is maintained by the agent' };
}

/** Copy lock flags onto every node of a tree response (one config load, one walk). */
export async function annotateTree(node: TreeNode): Promise<TreeNode> {
  const { locked } = await loadLocks();
  const rules = locked.map((r) => ({ ...r, re: globToRegExp(r.glob) }));
  const walk = (n: TreeNode): TreeNode => {
    const rule = rules.find((r) => r.re.test(n.path));
    const out: TreeNode = rule ? { ...n, locked: true, lockReason: rule.reason } : { ...n };
    if (n.children) out.children = n.children.map(walk);
    return out;
  };
  return walk(node);
}
