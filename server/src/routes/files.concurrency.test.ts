import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
const { settings } = vi.hoisted(() => ({ settings: { vault: { path: '', allowedRoots: [] as string[], trash: '.trash' } } }));
vi.mock('../services/draftScopes.js',()=>({getDraftScope:async(root:string)=>'scope:'+root}));
vi.mock('../services/settings.js', () => ({ getSettings: async () => settings }));
vi.mock('../middleware/auth.js', () => ({ requireAuth: (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../middleware/apikey.js', () => ({ requireApiKey: () => (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../services/git.js', () => ({ scheduleAutoCommitOnSave: () => {} }));
vi.mock('../services/search.js', () => ({ qmd: { upsert: async () => {} } }));
vi.mock('../services/links.js', () => ({ updateLinkGraphForFile: async () => {}, buildLinkGraph: async () => {} }));
let server: Server;
let base: string;
beforeAll(async () => {
  settings.vault.path = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-cas-'));
  const { filesRouter } = await import('./files.js');
  const { agentRouter } = await import('./agent.js');
  const { errorHandler } = await import('../middleware/error.js');
  const app = express(); app.use(express.json());
  app.use('/api/files', filesRouter); app.use('/api/v1', agentRouter); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await fs.rm(settings.vault.path, { recursive: true, force: true });
});
const write = (url: string, body: unknown, method = 'PUT') => fetch(base + url, {method, headers: {'content-type':'application/json'},body:JSON.stringify(body)});
it('serializes mixed browser/agent CAS requests and create-only writes', async () => {
  const responses = await Promise.all([
    write('/api/files/content', {path:'race.md',content:'browser',baseVersion:''}),
    write('/api/v1/notes/race.md', {content:'agent',base_version:''}),
  ]);
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
  const current = await (await fetch(base+'/api/files/content?path=race.md')).json();
  const updated = await Promise.all([
    write('/api/files/content',{path:'race.md',content:'one',baseVersion:current.version}),
    write('/api/v1/notes/race.md',{content:'two',base_version:current.version}),
  ]);
  expect(updated.map(r=>r.status).sort()).toEqual([200,409]);
});
it('preserves all parallel agent appends', async () => {
  const responses = await Promise.all(Array.from({length:8},(_,i)=>write('/api/v1/notes/append.md',{append:`line-${i}\n`},'PATCH')));
  expect(responses.map(r=>r.status)).toEqual(Array(8).fill(200));
  const text = await fs.readFile(path.join(settings.vault.path,'append.md'),'utf8');
  for(let i=0;i<8;i++) expect(text).toContain(`line-${i}\n`);
});
it('serializes find/replace with versioned browser writes', async () => {
  await write('/api/files/content',{path:'edit.md',content:'original'});
  const current = await (await fetch(base+'/api/files/content?path=edit.md')).json();
  const responses = await Promise.all([
    write('/api/v1/notes/edit.md',{find:'original',replace:'agent',base_version:current.version},'PATCH'),
    write('/api/files/content',{path:'edit.md',content:'browser',baseVersion:current.version}),
  ]);
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
});
it('does not recreate a missing file with an obsolete version', async () => {
  const response = await write('/api/files/content',{path:'missing.md',content:'bad',baseVersion:'obsolete'});
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({error:'version_conflict',currentVersion:''});
  await expect(fs.stat(path.join(settings.vault.path,'missing.md'))).rejects.toMatchObject({code:'ENOENT'});
});
it('shares the transaction for two paths resolving to the same note', async () => {
  await fs.mkdir(path.join(settings.vault.path,'real'));
  await fs.symlink(path.join(settings.vault.path,'real'), path.join(settings.vault.path,'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  await write('/api/files/content',{path:'real/note.md',content:'initial'});
  const current = await (await fetch(base+'/api/files/content?path=real/note.md')).json();
  const responses = await Promise.all([
    write('/api/files/content',{path:'real/note.md',content:'one',baseVersion:current.version}),
    write('/api/v1/notes/alias/note.md',{content:'two',base_version:current.version}),
  ]);
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
});

it('refuses recovery reads and writes from a previous vault even when versions match',async()=>{
 const original=settings.vault.path;const other=path.join(original,'other-vault');await fs.mkdir(other);await fs.writeFile(path.join(other,'same.md'),'unchanged');settings.vault.path=other;
 try{const stale='scope:'+original;const {contentVersion}=await import('../services/noteversion.js');
 const response=await write('/api/files/content',{path:'same.md',content:'wrong vault',baseVersion:contentVersion('unchanged'),draftScopeId:stale});expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:'draft_scope_changed'});
 expect((await fetch(base+'/api/files/content?path=same.md&draftScopeId='+encodeURIComponent(stale))).status).toBe(409);
 expect(await fs.readFile(path.join(other,'same.md'),'utf8')).toBe('unchanged');
 }finally{settings.vault.path=original;}
});
