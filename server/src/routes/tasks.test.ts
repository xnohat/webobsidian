import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, promises as fsp, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';

// config.ts computes INDEX_FILE/SETTINGS_FILE from process.env.DATA_DIR at import time,
// so this must be set before any module that (transitively) imports '../config.js' is
// evaluated. Plain top-level statements below run before the dynamic imports further
// down (dynamic import() is not hoisted the way static imports/vi.mock are), so this is
// safe as long as nothing above statically imports a route/service module.
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'wo-tasks-data-'));
const vaultDir = mkdtempSync(path.join(os.tmpdir(), 'wo-tasks-vault-'));
process.env.DATA_DIR = dataDir;

const { settings } = vi.hoisted(() => ({
  settings: {
    vault: { path: '', allowedRoots: [] as string[], trash: '.trash', deleteMode: 'trash' as const, attachmentDir: 'attachments' },
    git: {
      enabled: false, remote: '', branch: 'main', token: '', authorName: 'Tester', authorEmail: 't@example.com',
      autoSync: false, autoCommitOnSave: false, intervalSec: 300, lfsPatterns: [] as string[],
    },
    search: { fuzzy: 0.2, prefix: true, indexFrontmatter: true },
    api: { keys: [] as { id: string; name: string; hash: string; prefix: string; scopes: string[]; createdAt: string; lastUsed: string | null }[], rateLimitPerMin: 120 },
    auth: { userPasswordHash: '', passwordHash: '', jwtSecret: 'x'.repeat(64) },
  },
}));
settings.vault.path = vaultDir;

vi.mock('../services/settings.js', () => ({
  getSettings: vi.fn(async () => settings),
  updateSettings: vi.fn(async (mutator: (d: typeof settings) => void) => {
    await mutator(settings);
    return settings;
  }),
}));

// git is disabled in these settings anyway, but scheduleAutoCommitOnSave sets a
// real (un-unref'd) 5s setTimeout on every write — stub it so the test file exits
// promptly instead of the worker waiting the timer out.
vi.mock('../services/git.js', () => ({ scheduleAutoCommitOnSave: vi.fn() }));

// Fixture task notes (snippets copied from /tmp/kanban-fixture/Wiki/tasks — do not
// edit that fixture directory; these are trimmed-down copies for the test vault).
const OPEN_TASK = `---
title: Deliver the 2027 budget plan to the manager
created: 2026-09-15
updated: 2026-09-15
type: task
status: open
priority: P1
owner: hung
due: 2026-09-29
raised: 2026-09-15
tags: [action-item, planning]
---

# Deliver the 2027 budget plan to the manager
Body.
`;

const WAITING_TASK = `---
title: Work Chien's pending QC issues list
created: 2026-09-21
updated: 2026-09-21
type: task
status: waiting
priority: P2
owner: hung
due: none
raised: 2026-09-21
tags: [action-item, quality]
---

# Work Chien's pending QC issues list
Body.
`;

const UNKNOWN_STATUS_TASK = `---
title: Fixture task with unknown status
created: 2026-09-10
updated: 2026-09-20
type: task
status: escalated
priority: P1
owner: fixture
due: 2026-10-05
raised: 2026-09-10
tags: [action-item]
---

# Fixture: unknown status
Body.
`;

const NO_STATUS_TASK = `---
title: Fixture task without a status key
created: 2026-08-01
updated: 2026-08-15
type: task
priority: P3
owner: fixture
due: none
raised: 2026-08-01
tags: [action-item]
---

# Fixture: no status key
Body.
`;

const NON_TASK_NOTE = `---
title: Not a task
type: note
---

Just a regular note.
`;

const TEMPLATE_TASK = `---
title: Short imperative title
type: task
status: open
---

# Short imperative title
Template body — must never appear as a real task.
`;

async function writeFixtures() {
  await fsp.mkdir(path.join(vaultDir, 'Wiki/tasks'), { recursive: true });
  await fsp.mkdir(path.join(vaultDir, 'Wiki/templates'), { recursive: true });
  await fsp.writeFile(path.join(vaultDir, 'Wiki/tasks/deliver-budget.md'), OPEN_TASK, 'utf8');
  await fsp.writeFile(path.join(vaultDir, 'Wiki/tasks/qc-issues.md'), WAITING_TASK, 'utf8');
  await fsp.writeFile(path.join(vaultDir, 'Wiki/tasks/escalated.md'), UNKNOWN_STATUS_TASK, 'utf8');
  await fsp.writeFile(path.join(vaultDir, 'Wiki/tasks/no-status.md'), NO_STATUS_TASK, 'utf8');
  await fsp.writeFile(path.join(vaultDir, 'Wiki/not-a-task.md'), NON_TASK_NOTE, 'utf8');
  await fsp.writeFile(path.join(vaultDir, 'Wiki/templates/task.md'), TEMPLATE_TASK, 'utf8');
}

let base: string;
let server: http.Server;
let COOKIE_NAME: string;
let ownerToken: string;
let readKey: string;
let noScopeKey: string;

beforeAll(async () => {
  await writeFixtures();

  const authMod = await import('../services/auth.js');
  const apikeysMod = await import('../services/apikeys.js');
  const authMw = await import('../middleware/auth.js');
  const searchMod = await import('../services/search.js');
  const { tasksRouter } = await import('./tasks.js');
  const { filesRouter } = await import('./files.js');
  const { agentRouter } = await import('./agent.js');
  const { errorHandler } = await import('../middleware/error.js');

  COOKIE_NAME = authMw.COOKIE_NAME;
  ownerToken = await authMod.issueToken();

  // Real API keys, stored on the mocked settings object, authenticated for real
  // through apikeys.authenticateKey (hash lookup) — no need to mock apikeys.js.
  const { raw: rawRead } = await apikeysMod.createKey('read-agent', ['read']);
  readKey = rawRead;
  const { raw: rawNoScope } = await apikeysMod.createKey('write-only-agent', ['write']);
  noScopeKey = rawNoScope;

  await searchMod.qmd.build();

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/tasks', tasksRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/v1', agentRouter);
  app.use(errorHandler);

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(vaultDir, { recursive: true, force: true });
});

function authHeaders(): Record<string, string> {
  return { Cookie: `${COOKIE_NAME}=${ownerToken}` };
}

describe('GET /api/tasks', () => {
  it('401s without a session cookie', async () => {
    const res = await fetch(`${base}/api/tasks`);
    expect(res.status).toBe(401);
  });

  it('returns only type: task notes, excluding templates, sorted by path', async () => {
    const res = await fetch(`${base}/api/tasks`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    const paths = body.tasks.map((t: { path: string }) => t.path);
    expect(paths).toEqual([
      'Wiki/tasks/deliver-budget.md',
      'Wiki/tasks/escalated.md',
      'Wiki/tasks/no-status.md',
      'Wiki/tasks/qc-issues.md',
    ]);
    expect(paths).not.toContain('Wiki/not-a-task.md');
    expect(paths).not.toContain('Wiki/templates/task.md');
  });

  it('the unknown-status task keeps its raw status and gets its own column id', () => {
    return fetch(`${base}/api/tasks`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((body) => {
        const t = body.tasks.find((x: { path: string }) => x.path === 'Wiki/tasks/escalated.md');
        expect(t.status).toBe('escalated');
        expect(t.statusRaw).toBe('escalated');
      });
  });

  it('the no-status task defaults to open with statusRaw null', async () => {
    const res = await fetch(`${base}/api/tasks`, { headers: authHeaders() });
    const body = await res.json();
    const t = body.tasks.find((x: { path: string }) => x.path === 'Wiki/tasks/no-status.md');
    expect(t.status).toBe('open');
    expect(t.statusRaw).toBeNull();
  });

  it('filters by status alias (waiting -> blocked column)', async () => {
    const res = await fetch(`${base}/api/tasks?status=blocked`, { headers: authHeaders() });
    const body = await res.json();
    expect(body.tasks.map((t: { path: string }) => t.path)).toEqual(['Wiki/tasks/qc-issues.md']);
  });

  it('filters by folder', async () => {
    const res = await fetch(`${base}/api/tasks?folder=Wiki/tasks`, { headers: authHeaders() });
    const body = await res.json();
    expect(body.tasks).toHaveLength(4);
  });

  it('filters by priority', async () => {
    const res = await fetch(`${base}/api/tasks?priority=P1`, { headers: authHeaders() });
    const body = await res.json();
    expect(body.tasks.map((t: { path: string }) => t.path).sort()).toEqual([
      'Wiki/tasks/deliver-budget.md',
      'Wiki/tasks/escalated.md',
    ]);
  });

  it('filters by owner', async () => {
    const res = await fetch(`${base}/api/tasks?owner=fixture`, { headers: authHeaders() });
    const body = await res.json();
    expect(body.tasks.map((t: { path: string }) => t.path).sort()).toEqual([
      'Wiki/tasks/escalated.md',
      'Wiki/tasks/no-status.md',
    ]);
  });

  it('filters by title substring (q)', async () => {
    const res = await fetch(`${base}/api/tasks?q=budget`, { headers: authHeaders() });
    const body = await res.json();
    expect(body.tasks.map((t: { path: string }) => t.path)).toEqual(['Wiki/tasks/deliver-budget.md']);
  });
});

describe('GET /api/v1/tasks (agent API)', () => {
  it('401s without an API key', async () => {
    const res = await fetch(`${base}/api/v1/tasks`);
    expect(res.status).toBe(401);
  });

  it('403s with a key that lacks the read scope', async () => {
    const res = await fetch(`${base}/api/v1/tasks`, { headers: { 'X-API-Key': noScopeKey } });
    expect(res.status).toBe(403);
  });

  it('200s with a read-scoped key, same shape as the web route', async () => {
    const res = await fetch(`${base}/api/v1/tasks`, { headers: { 'X-API-Key': readKey } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toHaveLength(4);
  });

  it('applies the same query filters', async () => {
    // A missing status defaults to 'open' too, so both land in the same column.
    const res = await fetch(`${base}/api/v1/tasks?status=open`, { headers: { 'X-API-Key': readKey } });
    const body = await res.json();
    expect(body.tasks.map((t: { path: string }) => t.path).sort()).toEqual([
      'Wiki/tasks/deliver-budget.md',
      'Wiki/tasks/no-status.md',
    ]);
  });
});

describe('files CAS (GET version / PUT baseVersion)', () => {
  it('GET /api/files/content returns a version for a text file', async () => {
    const res = await fetch(`${base}/api/files/content?path=${encodeURIComponent('Wiki/tasks/deliver-budget.md')}`, {
      headers: authHeaders(),
    });
    const body = await res.json();
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
  });

  it('PUT with a stale baseVersion is rejected with 409 and leaves the file unchanged', async () => {
    const before = await fsp.readFile(path.join(vaultDir, 'Wiki/tasks/deliver-budget.md'), 'utf8');
    const res = await fetch(`${base}/api/files/content`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'Wiki/tasks/deliver-budget.md', content: 'clobbered', baseVersion: 'stale0000000000' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('version_conflict');
    const after = await fsp.readFile(path.join(vaultDir, 'Wiki/tasks/deliver-budget.md'), 'utf8');
    expect(after).toBe(before);
  });

  it('PUT with the current baseVersion succeeds', async () => {
    const getRes = await fetch(`${base}/api/files/content?path=${encodeURIComponent('Wiki/tasks/deliver-budget.md')}`, {
      headers: authHeaders(),
    });
    const { version } = await getRes.json();
    const putRes = await fetch(`${base}/api/files/content`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'Wiki/tasks/deliver-budget.md', content: 'status: open\nupdated content', baseVersion: version }),
    });
    expect(putRes.status).toBe(200);
    const after = await fsp.readFile(path.join(vaultDir, 'Wiki/tasks/deliver-budget.md'), 'utf8');
    expect(after).toBe('status: open\nupdated content');
  });

  it('PUT without baseVersion keeps the old last-writer-wins behaviour', async () => {
    const res = await fetch(`${base}/api/files/content`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'Wiki/tasks/no-status.md', content: 'no version supplied' }),
    });
    expect(res.status).toBe(200);
    const after = await fsp.readFile(path.join(vaultDir, 'Wiki/tasks/no-status.md'), 'utf8');
    expect(after).toBe('no version supplied');
  });

  // A card move racing a delete: the note is gone, but the client's baseVersion
  // still names the version it last read. Silently recreating the file would
  // lose the fact that it was deleted — same contract as the Agent API's PUT
  // /notes/* (see routes/agent.ts, base_version + baseVersion !== '').
  it('PUT with a non-empty baseVersion for a file that does not exist is rejected with 409 and does not create it', async () => {
    const missingPath = 'Wiki/tasks/never-existed.md';
    const res = await fetch(`${base}/api/files/content`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: missingPath, content: 'recreated!', baseVersion: 'deadbeef00000000' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'version_conflict', currentVersion: '' });
    await expect(fsp.access(path.join(vaultDir, missingPath))).rejects.toThrow();
  });

  it('PUT with baseVersion === "" for a file that does not exist creates it (unchanged create-if-absent behaviour)', async () => {
    const newPath = 'Wiki/tasks/brand-new.md';
    const res = await fetch(`${base}/api/files/content`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: newPath, content: 'fresh note', baseVersion: '' }),
    });
    expect(res.status).toBe(200);
    const after = await fsp.readFile(path.join(vaultDir, newPath), 'utf8');
    expect(after).toBe('fresh note');
  });
});
