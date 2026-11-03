/**
 * End-to-end test for the MCP server: spawns the built stdio server and drives a real
 * MCP handshake against a running WebObsidian instance.
 *
 * Needs WEBOBSIDIAN_BASE_URL and WEBOBSIDIAN_API_KEY; `scripts/smoke-test.sh` sets both
 * after booting a throwaway server, and CI runs that script.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.WEBOBSIDIAN_BASE_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.WEBOBSIDIAN_API_KEY ?? '';
const ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.js');

const NOTE = 'Testing/mcp-e2e.md';
const BODY = ['# MCP e2e', '', 'first line', 'the marker is here', 'last line', ''].join('\n');

/** Minimal newline-delimited JSON-RPC client for the stdio transport. */
class McpClient {
  constructor() {
    this.child = spawn(process.execPath, [ENTRY], {
      env: { ...process.env, WEBOBSIDIAN_BASE_URL: BASE, WEBOBSIDIAN_API_KEY: KEY },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.buf = '';
    this.pending = new Map();
    this.stderr = '';
    this.child.stdout.on('data', (chunk) => {
      this.buf += chunk.toString();
      let nl;
      while ((nl = this.buf.indexOf('\n')) !== -1) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        const resolve = this.pending.get(msg.id);
        if (resolve) {
          this.pending.delete(msg.id);
          resolve(msg);
        }
      }
    });
    this.child.stderr.on('data', (c) => (this.stderr += c.toString()));
  }

  request(id, method, params = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}; stderr=${this.stderr}`)), 20000);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  notify(method, params = {}) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async callTool(id, name, args) {
    const res = await this.request(id, 'tools/call', { name, arguments: args });
    assert.ok(!res.error, `tools/call ${name} returned a protocol error: ${JSON.stringify(res.error)}`);
    const text = res.result.content.map((c) => c.text).join('\n');
    return { isError: res.result.isError === true, text, json: res.result.isError ? undefined : JSON.parse(text) };
  }

  stop() {
    this.child.kill();
  }
}

async function rest(method, urlPath, body) {
  const res = await fetch(`${BASE}/api/v1${urlPath}`, {
    method,
    headers: { 'X-API-Key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => undefined) };
}

test('MCP server exposes the vault as tools over stdio', { skip: !BASE || !KEY }, async (t) => {
  const client = new McpClient();
  t.after(async () => {
    await rest('DELETE', `/notes/${NOTE}`).catch(() => {});
    client.stop();
  });

  const init = await client.request(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'webobsidian-smoke', version: '1.0.0' },
  });
  assert.equal(init.result.serverInfo.name, 'webobsidian', JSON.stringify(init.error));
  client.notify('notifications/initialized');

  const tools = await client.request(2, 'tools/list');
  const names = tools.result.tools.map((x) => x.name);
  const readSchema = tools.result.tools.find((tool) => tool.name === 'read_note')?.inputSchema;
  const listSchema = tools.result.tools.find((tool) => tool.name === 'list_notes')?.inputSchema;
  assert.equal(readSchema?.properties?.path?.minLength, 1);
  assert.equal(listSchema?.properties?.limit?.maximum, 500);
  for (const expected of [
    'list_notes',
    'read_note',
    'write_note',
    'append_note',
    'edit_note',
    'grep_note',
    'delete_note',
    'search_notes',
    'get_backlinks',
    'list_tags',
  ]) {
    assert.ok(names.includes(expected), `tool ${expected} missing (got ${names.join(', ')})`);
  }

  // Seed a note through the REST API (base_version "" = must not exist yet).
  const seeded = await rest('PUT', `/notes/${NOTE}`, { content: BODY, base_version: '' });
  assert.equal(seeded.status, 200, JSON.stringify(seeded.json));
  const version = seeded.json.version;

  const read = await client.callTool(3, 'read_note', { path: NOTE });
  assert.equal(read.json.version, version);
  assert.match(read.json.content, /the marker is here/);

  // Segmented read: lines 2-3 of the note, plus the paging metadata.
  const page = await client.callTool(4, 'read_note', { path: NOTE, offset: 2, limit: 2 });
  assert.equal(page.json.content, 'first line\nthe marker is here');
  assert.equal(page.json.offset, 2);
  assert.equal(page.json.totalLines, 6);
  assert.equal(page.json.hasMore, true);

  const grep = await client.callTool(5, 'grep_note', { path: NOTE, q: 'marker', context: 1 });
  assert.equal(grep.json.count, 1);
  assert.equal(grep.json.matches[0].line, 4);
  assert.equal(grep.json.matches[0].pre, 'first line');

  const edit = await client.callTool(6, 'edit_note', { path: NOTE, find: 'the marker is here', replace: 'edited via MCP' });
  assert.equal(edit.json.replaced, 1);
  assert.notEqual(edit.json.version, version);

  const after = await client.callTool(7, 'read_note', { path: NOTE });
  assert.match(after.json.content, /edited via MCP/);
  assert.doesNotMatch(after.json.content, /the marker is here/);

  // A stale base_version must surface as a tool error, not a silent overwrite.
  const conflict = await client.callTool(8, 'write_note', { path: NOTE, content: 'clobber', base_version: version });
  assert.equal(conflict.isError, true);
  assert.match(conflict.text, /version_conflict/);
  const untouched = await client.callTool(9, 'read_note', { path: NOTE });
  assert.match(untouched.json.content, /edited via MCP/);

  const search = await client.callTool(10, 'search_notes', { query: 'marker' });
  assert.ok(Array.isArray(search.json.hits));
  for (const [id, name, args] of [[11, 'read_note', { path: '' }], [12, 'list_notes', { limit: 501 }]]) {
    const invalid = await client.request(id, 'tools/call', { name, arguments: args });
    assert.ok(invalid.error || invalid.result?.isError, `invalid ${name} arguments must be rejected`);
  }
});
