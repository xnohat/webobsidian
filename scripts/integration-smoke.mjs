// Cross-platform smoke test for the merged forks. Uses only a throwaway local vault.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import { deflateSync, gzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const repo = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webobsidian-merged-smoke-'));
const vault = path.join(root, 'vault');
const socket = net.createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
let server;
let output = '';
try {
  await fs.mkdir(path.join(vault, 'notes', 'attachments'), { recursive: true });
  await fs.mkdir(path.join(vault, 'attachments'), { recursive: true });
  await fs.mkdir(path.join(vault, '_system'), { recursive: true });
  await fs.writeFile(path.join(vault, '_system', 'locks.json'), JSON.stringify({
    locked: [{ glob: 'notes/locked.md', reason: 'integration fixture' },
      { glob: 'notes/protected/**', reason: 'upload fixture' }], unlock: 'confirm',
  }));
  await fs.writeFile(path.join(vault, 'notes', 'locked.md'), '# Locked');
  await fs.writeFile(path.join(vault, 'notes', 'editable.md'), '# Editable');
  await fs.writeFile(path.join(vault, 'notes', 'neighbor.md'), '# Nearby');
  await fs.writeFile(path.join(vault, 'neighbor.md'), '# Root collision');
  await fs.mkdir(path.join(vault, 'second'));
  await fs.writeFile(path.join(vault, 'second', 'neighbor.md'), '# Second collision');
  const pdf = Buffer.from('%PDF-1.4\n% smoke-test fixture\n%%EOF\n');
  await fs.writeFile(path.join(vault, 'notes', 'attachments', 'document.pdf'), pdf);
  await fs.writeFile(path.join(vault, 'attachments', 'document.pdf'), '%PDF-root-collision');
  server = spawn(process.execPath, ['server/dist/index.js'], {
    cwd: repo,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'production',
      DATA_DIR: path.join(root, 'data'), VAULT_PATH: vault, ALLOWED_ROOTS: vault,
      WEBOBSIDIAN_PASSWORD: 'smoke-test-only-password', TRUST_PROXY: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  server.stdout.on('data', (data) => { output += data; });
  server.stderr.on('data', (data) => { output += data; });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`server exited: ${output}`);
    try { if ((await fetch(`${base}/healthz`)).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, `server did not start: ${output}`);
  assert.equal((await fetch(`${base}/api/files/tree`)).status, 401);
  const login = await fetch(`${base}/auth/login`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'smoke-test-only-password' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const request = (url, options = {}) => fetch(`${base}${url}`, {
    ...options, headers: { cookie, 'content-type': 'application/json', ...options.headers },
  });
  // /healthz means the process is listening. Resolver assertions require the
  // asynchronous initial index scan to finish before a missing file is a 404.
  let indexStatus;
  const indexDeadline = Date.now() + 10_000;
  do {
    const response = await request('/api/index/status');
    assert.equal(response.status, 200);
    indexStatus = await response.json();
    if (indexStatus.initialScanComplete && indexStatus.available) break;
    if (server.exitCode !== null) throw new Error(`server exited during indexing: ${output}`);
    await delay(25);
  } while (Date.now() < indexDeadline);
  assert.ok(indexStatus?.initialScanComplete && indexStatus.available,
    `initial index did not become ready: ${JSON.stringify(indexStatus)}\n${output}`);
  const settings = await (await request('/api/settings')).json();
  assert.equal(settings.vault.trashRetentionDays, 0);
  const locked = await (await request('/api/files/content?path=notes/locked.md')).json();
  assert.equal(locked.locked, true);
  assert.ok(locked.version);
  assert.equal((await request('/api/files/content?path=missing.md')).status, 404);
  const relative = '/api/files/content?path=attachments/document.pdf&from=notes/editable.md';
  const resolved = await (await request('/api/files/resolve?path=attachments/document.pdf&from=notes/editable.md')).json();
  assert.equal(resolved.path, 'notes/attachments/document.pdf');
  const localNote = await (await request('/api/resolve?target=neighbor&from=notes/editable.md')).json();
  assert.equal(localNote.path, 'notes/neighbor.md', 'note embeds resolve beside their source before basename fallback');
  for(const target of ['#^quote-block-target','#11. Section']){
    const self=await(await request('/api/resolve?target='+encodeURIComponent(target)+'&from=notes/editable.md')).json();
    assert.equal(self.path,'notes/editable.md','fragment-only links retain the actual current note identity');
  }
  const secondNote = await (await request('/api/resolve?target=neighbor&from=second/root.md')).json();
  assert.equal(secondNote.path, 'second/neighbor.md');
  const document = await request(relative);
  assert.equal(document.status, 200);
  assert.match(document.headers.get('content-type'), /application\/pdf/);
  assert.deepEqual(Buffer.from(await document.arrayBuffer()), pdf);
  const range = await request(relative, { headers: { range: 'bytes=0-3' } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), '%PDF');
  const download = await request(`${relative}&download=1`);
  assert.match(download.headers.get('content-disposition'), /document\.pdf/);
  for (const [method, url, body] of [
    ['PUT', '/api/files/content', { path: 'notes/locked.md', content: 'bad' }],
    ['PATCH', '/api/files/rename', { from: 'notes/locked.md', to: 'notes/moved.md' }],
    ['POST', '/api/files/copy', { from: 'notes/editable.md', to: 'notes/locked.md' }],
    ['DELETE', '/api/files/?path=notes/locked.md&permanent=1', undefined],
  ]) assert.equal((await request(url, { method, body: body && JSON.stringify(body) })).status, 423);
  await fs.writeFile(path.join(vault,'sample.py'),'print("Привет")\r\n');
  assert.equal((await fetch(`${base}/api/files/code-content?path=sample.py`)).status,401);
  const code=await (await request('/api/files/code-content?path=sample.py')).json();
  assert.equal(code.kind,'text');assert.equal(code.content,'print("Привет")\r\n');
  assert.equal((await request('/api/files/code-content?path=missing.py')).status,404);
  assert.equal((await request('/api/files/code-content?path=../outside')).status,400);
  assert.equal((await request('/api/settings/',{method:'PUT',body:JSON.stringify({ui:{codeFileViewer:{enabled:true,lineNumbers:true,extensionMap:{md:'python'}}}})})).status,400);
  assert.equal(await fs.readFile(path.join(vault,'sample.py'),'utf8'),'print("Привет")\r\n');
  const original = await (await request('/api/files/content?path=notes/editable.md')).json();
  const write = (baseVersion, content) => request('/api/files/content', { method: 'PUT',
    body: JSON.stringify({ path: 'notes/editable.md', content, baseVersion }) });
  assert.equal((await write(original.version, '# Updated')).status, 200);
  assert.equal((await write(original.version, '# Stale')).status, 409);
  assert.equal(await fs.readFile(path.join(vault, 'notes', 'locked.md'), 'utf8'), '# Locked');
  assert.equal(await fs.readFile(path.join(vault, 'notes', 'editable.md'), 'utf8'), '# Updated');
  const staging = path.join(vault, '.webobsidian-copy-smoke', 'payload');
  await fs.mkdir(staging, { recursive: true });
  await fs.writeFile(path.join(staging, 'partial.md'), '# reviewstagingsecret');
  await delay(1200); // Longer than the watcher's 300ms stability window.
  const stagedSearch = await (await request('/api/search?q=reviewstagingsecret')).json();
  assert.equal(stagedSearch.hits.length, 0, 'unfinished copy must not enter search indexes');
  const parallelCas = await Promise.all(['one', 'two'].map(content => request('/api/files/content', {
    method: 'PUT', body: JSON.stringify({ path: 'notes/concurrent.md', content, baseVersion: '' }),
  })));
  assert.deepEqual(parallelCas.map(response => response.status).sort(), [200, 409]);
  const collision = await request('/api/files/rename', { method: 'PATCH',
    body: JSON.stringify({ from: 'notes/concurrent.md', to: 'notes/editable.md' }) });
  assert.equal(collision.status, 409);
  assert.equal((await collision.json()).error, 'destination_exists');
  assert.equal(await fs.readFile(path.join(vault, 'notes', 'editable.md'), 'utf8'), '# Updated');
  assert.equal((await request('/')).status, 200);
  const uploadFile = async (dir, name = 'upload.txt') => {
    const body = new FormData();
    body.append('dir', dir);
    body.append('file', new Blob(['upload fixture']), name);
    return fetch(`${base}/api/files/upload`, { method: 'POST', headers: { cookie }, body });
  };
  for (const expected of ['upload.txt', 'upload-1.txt']) {
    const upload = await uploadFile('notes/attachments');
    assert.equal(upload.status, 200);
    assert.equal((await upload.json()).path, `notes/attachments/${expected}`);
    assert.equal(await fs.readFile(path.join(vault, 'notes', 'attachments', expected), 'utf8'), 'upload fixture');
  }
  assert.equal((await uploadFile('notes/protected')).status, 423);
  // Editor uploads must follow Obsidian rather than invent a local attachments folder.
  await fs.mkdir(path.join(vault, '.obsidian'), { recursive: true });
  await fs.mkdir(path.join(vault, 'Media', 'Existing'), { recursive: true });
  const appConfig = path.join(vault, '.obsidian', 'app.json');
  const uploadAttachment = async (sourcePath = 'second/deep/note.md', name = 'shot #1 (a).png') => {
    const body = new FormData();
    body.append('sourcePath', sourcePath);
    body.append('file', new Blob(['attachment fixture']), name);
    return fetch(`${base}/api/files/upload`, { method: 'POST', headers: { cookie }, body });
  };
  for (const [config, expected, relativePath] of [
    [{ attachmentFolderPath: 'media/existing' }, 'Media/Existing/shot #1 (a).png', '../../Media/Existing/shot%20%231%20%28a%29.png'],
    [{ attachmentFolderPath: '/' }, 'shot #1 (a).png', '../../shot%20%231%20%28a%29.png'],
    [{ attachmentFolderPath: './' }, 'second/deep/shot #1 (a).png', 'shot%20%231%20%28a%29.png'],
    [{ attachmentFolderPath: './Pictures/Nested' }, 'second/deep/Pictures/Nested/shot #1 (a).png', 'Pictures/Nested/shot%20%231%20%28a%29.png'],
    [{}, 'shot #1 (a)-1.png', '../../shot%20%231%20%28a%29-1.png'],
    [{ attachmentFolderPath: '' }, 'shot #1 (a)-2.png', '../../shot%20%231%20%28a%29-2.png'],
  ]) {
    await fs.writeFile(appConfig, JSON.stringify(config));
    const response = await uploadAttachment();
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.path, expected);
    assert.equal(result.relativePath, relativePath);
    assert.equal(await fs.readFile(path.join(vault, expected), 'utf8'), 'attachment fixture');
    const linked = await request(`/api/files/content?path=${encodeURIComponent(decodeURIComponent(result.relativePath))}&from=second/deep/note.md`);
    assert.equal(linked.status, 200, 'the inserted relative URL must resolve back to the uploaded file');
    assert.equal(await linked.text(), 'attachment fixture');
    if (config.attachmentFolderPath === 'media/existing') {
      const tree = await (await request('/api/files/')).json();
      const find = (node, target) => node.path === target ? node : (node.children ?? []).map(c => find(c, target)).find(Boolean);
      assert.equal(find(tree, 'Media/Existing').attachmentFolder, true);
      assert.equal(find(tree, 'notes/attachments').attachmentFolder, false);
      const encoded='Media/Existing/shot%20%231%20%28a%29.png';
      await fs.writeFile(path.join(vault,'encoded-reference.md'),'![]('+encoded+')');
      const refs=await (await request('/api/files/references?path='+encodeURIComponent(expected))).json();
      assert.ok(refs.references.includes('encoded-reference.md'));
      const repeated=await (await request('/api/files/references',{method:'POST',body:JSON.stringify({path:expected,exclude:'source.md',sourceContent:'![]('+encoded+') ![]('+encoded+')'})})).json();
      assert.equal(repeated.sourceReferences,2);
    }
  }
  assert.equal(await fs.stat(path.join(vault, 'second/deep/attachments')).then(() => true, () => false), false);
  await fs.writeFile(appConfig, JSON.stringify({ attachmentFolderPath: 'notes/protected' }));
  assert.equal((await uploadAttachment()).status, 423);
  for (const attachmentFolderPath of ['../outside', '/absolute', 'C:\\outside', 42]) {
    await fs.writeFile(appConfig, JSON.stringify({ attachmentFolderPath }));
    assert.equal((await uploadAttachment()).status, 400);
  }
  await fs.writeFile(appConfig, '{broken');
  assert.equal((await uploadAttachment()).status, 400);
  await fs.writeFile(appConfig, JSON.stringify({ attachmentFolderPath: 'Media/Existing' }));
  assert.equal((await uploadAttachment('../outside.md')).status, 400);
  const canvasUpload = await uploadAttachment('second/board.canvas', 'canvas.png');
  assert.equal(canvasUpload.status, 200);
  assert.equal((await canvasUpload.json()).path, 'Media/Existing/canvas.png');
  await fs.unlink(appConfig);
  const legacy = await uploadAttachment('second/legacy.md', 'legacy.png');
  assert.equal(legacy.status, 200);
  assert.equal((await legacy.json()).path, 'second/attachments/legacy.png');
  // Settings / rename / safe cleanup policies use a synthetic vault only.
  for(const path of ['', '   ']) assert.equal((await request('/api/settings',{method:'PUT',body:JSON.stringify({vault:{path}})})).status,400);
  await fs.writeFile(appConfig,JSON.stringify({attachmentFolderPath:'./',alwaysUpdateLinks:true,deleteUnlinkedAttachments:'ask'}));
  await fs.writeFile(path.join(vault,'rename-target.md'),'# Target');
  await fs.writeFile(path.join(vault,'rename-source.md'),'[[rename-target]] [Target](rename-target.md)');
  const renamed=await request('/api/files/rename',{method:'PATCH',body:JSON.stringify({from:'rename-target.md',to:'rename-after.md'})});
  assert.equal(renamed.status,200);assert.match(await fs.readFile(path.join(vault,'rename-source.md'),'utf8'),/rename-after/);
  await fs.writeFile(path.join(vault,'cleanup-source.md'),'removed');
  await fs.writeFile(path.join(vault,'cleanup #1.png'),'image');
  const source=await (await request('/api/files/content?path=cleanup-source.md')).json();
  const deletionScope=await (await request('/api/files/draft-scope')).json();
  const clean=async(version)=>request('/api/files/attachments/delete',{method:'POST',body:JSON.stringify({sourcePath:'cleanup-source.md',targetPath:'cleanup #1.png',sourceVersion:version,draftScopeId:deletionScope.scopeId,confirmedMode:'trash'})});
  assert.equal((await clean('stale')).status,409);
  const cleaned=await clean(source.version);assert.equal(cleaned.status,200);assert.equal((await cleaned.json()).outcome,'trashed');
  assert.equal(await fs.readFile(path.join(vault,'.trash','cleanup #1.png'),'utf8'),'image');
  await fs.writeFile(path.join(vault,'unused.png'),'unused');
  await fs.writeFile(path.join(vault,'ask-note.md'),'![](unused.png)');
  const ask=await request('/api/files/?path=ask-note.md',{method:'DELETE'});assert.equal(ask.status,200);const receipt=await ask.json();
  assert.deepEqual(receipt.pendingAttachments,['unused.png']);assert.ok(receipt.cleanupReceipt);
  const select=async(token)=>request('/api/files/attachments/cleanup',{method:'POST',body:JSON.stringify({sourcePath:'ask-note.md',selected:['unused.png'],receipt:token})});
  assert.equal((await select('invalid')).status,409);assert.equal((await select(receipt.cleanupReceipt)).status,200);
  assert.equal(await fs.readFile(path.join(vault,'.trash','unused.png'),'utf8'),'unused');
  // A confirmed recoverable deletion also caps automatic cleanup if policy changed.
  assert.equal((await request('/api/settings',{method:'PUT',body:JSON.stringify({vault:{followObsidianDeletion:true}})})).status,200);
  await fs.writeFile(appConfig,JSON.stringify({trashOption:'none',deleteUnlinkedAttachments:'always'}));
  await fs.writeFile(path.join(vault,'cap.png'),'recoverable');
  await fs.writeFile(path.join(vault,'cap-note.md'),'![](cap.png)');
  const capped=await request('/api/files/?path=cap-note.md&confirmedMode=trash',{method:'DELETE'});assert.equal(capped.status,200);
  assert.equal((await capped.json()).trashed,'.trash/cap-note.md');
  assert.equal(await fs.readFile(path.join(vault,'.trash','cap.png'),'utf8'),'recoverable');
  assert.equal((await request('/api/settings',{method:'PUT',body:JSON.stringify({vault:{followObsidianDeletion:false}})})).status,200);
  const malformed = await fetch(`${base}/api/files/upload`, { method: 'POST',
    headers: { cookie, 'content-type': 'multipart/form-data; boundary=fixture' },
    body: '--fixture\r\nContent-Disposition: form-data; name="file"; filename="broken.txt"\r\n\r\nunfinished',
  });
  assert.ok(malformed.status >= 400);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  for (const [encoding, compress] of [['gzip', gzipSync], ['deflate', deflateSync]]) {
    const compressed = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'content-encoding': encoding },
      body: compress(JSON.stringify({ password: 'smoke-test-only-password' })),
    });
    assert.equal(compressed.status, 200, `${encoding} JSON remains supported`);
  }
  // Split the request so late bytes reach the decoder after it has produced a response.
  // The former body-parser left a piped decoder without an error listener and crashed.
  await new Promise((resolve, reject) => {
    const first = Buffer.concat([deflateSync('{"password":"smoke-test-only-password"}'), Buffer.from([0])]);
    const trailing = Buffer.alloc(1024);
    const req = http.request(`${base}/auth/login`, { method: 'POST', agent: false,
      headers: { 'content-type': 'application/json', 'content-encoding': 'deflate',
        'content-length': first.length + trailing.length },
    }, (res) => {
      res.resume();
      res.on('end', () => { req.end(trailing); resolve(); });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Compressed-body probe timed out')));
    req.write(first);
  });
  await delay(100);
  assert.equal(server.exitCode, null, `late compressed bytes terminated the server: ${output}`);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  console.log('PASS: auth, retention, PDF/downloads, locks/CAS, SPA, uploads, compressed JSON and late-byte survival');
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
  await fs.rm(root, { recursive: true, force: true });
}
