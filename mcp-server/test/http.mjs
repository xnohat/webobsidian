import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('real server: HTTP and unchanged stdio share tools, versions and scoped keys', { timeout: 60000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'webo-mcp-'));
  const vault = path.join(root, 'vault');
  await mkdir(vault);
  const socket = net.createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [process.env.MCP_TEST_SERVER_ENTRY ?? 'server/dist/index.js'], {
    cwd: new URL('../../', import.meta.url), windowsHide: true,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: path.join(root, 'data'),
      VAULT_PATH: vault, ALLOWED_ROOTS: vault, WEBOBSIDIAN_PASSWORD: 'mcp-test-only-password',
      WEBOBSIDIAN_MCP_ENABLED: 'true', WEBOBSIDIAN_MCP_PUBLIC_URL: `${base}/mcp`,
      WEBOBSIDIAN_MCP_ALLOWED_ORIGINS: '', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', b => { output += b; });
  child.stderr.on('data', b => { output += b; });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
    await rm(root, { recursive: true, force: true });
  });
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`server failed: ${output}`);
    try { if ((await fetch(`${base}/healthz`)).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, output);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'mcp-test-only-password' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const makeKey = async scopes => {
    const response = await fetch(`${base}/api/keys`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'mcp-fixture', scopes }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const full = await makeKey(['read', 'write', 'search']);
  const ro = await makeKey(['read', 'search']);
  const connect = async key => {
    const client = new Client({ name: 'integration', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    }));
    t.after(() => client.close());
    return client;
  };
  const http = await connect(full.key);
  const readonly = await connect(ro.key);
  const stdio = new Client({ name: 'local-integration', version: '1.0' });
  await stdio.connect(new StdioClientTransport({ command: process.execPath, args: ['mcp-server/dist/index.js'],
    env: { ...process.env, WEBOBSIDIAN_BASE_URL: base, WEBOBSIDIAN_API_KEY: full.key } }));
  t.after(() => stdio.close());
  assert.deepEqual((await http.listTools()).tools, (await stdio.listTools()).tools);
  const call = (client, name, args = {}) => client.callTool({ name, arguments: args });
  const data = result => JSON.parse(result.content[0].text);
  const note = 'Работа/ЭЦП 100%.md';
  assert.ok(!(await call(http, 'write_note', { path: note, content: '# Marker\noriginal', base_version: '' })).isError);
  const read = data(await call(stdio, 'read_note', { path: note }));
  assert.equal(read.content, '# Marker\noriginal');
  await call(http, 'edit_note', { path: note, find: 'original', replace: 'updated', base_version: read.version });
  const conflict = await call(stdio, 'write_note', { path: note, content: 'clobber', base_version: read.version });
  assert.equal(conflict.isError, true);
  assert.match(conflict.content[0].text, /version_conflict/);
  await Promise.all([call(http, 'append_note', { path: note, content: 'one' }), call(stdio, 'append_note', { path: note, content: 'two' })]);
  const denied = await call(readonly, 'delete_note', { path: note });
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /403/);
  assert.match(await readFile(path.join(vault, note), 'utf8'), /updated\none\ntwo|updated\ntwo\none/);
  for (const client of [http, stdio]) {
    assert.ok(data(await call(client, 'list_notes')).notes.includes(note));
    assert.equal(data(await call(client, 'grep_note', { path: note, q: 'updated' })).count, 1);
    assert.ok(Array.isArray(data(await call(client, 'search_notes', { query: 'Marker' })).hits));
    assert.ok(data(await call(client, 'get_backlinks', { path: note })));
    assert.ok(data(await call(client, 'list_tags')));
    assert.equal((await call(client, 'read_note', { path: '../outside.md' })).isError, true);
  }
  assert.ok(!(await call(http, 'delete_note', { path: note })).isError);
  assert.equal((await call(stdio, 'read_note', { path: note })).isError, true);
  assert.equal((await fetch(`${base}/api/keys/${ro.record.id}`, { method: 'DELETE', headers: { cookie } })).status, 200);
  await assert.rejects(() => call(readonly, 'list_tags'), error => error.code === 401);
});
