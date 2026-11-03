import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const state = vi.hoisted(() => ({ revoked: false, limit: 120, slow: false, started: false }));
vi.mock('../services/apikeys.js', () => ({ authenticateKey: async (raw: string) => raw === 'valid' && !state.revoked ? { id: 'mcp-test-key', name: 'test', scopes: ['read', 'search'] } : raw === 'writer' ? { id: 'mcp-writer', name: 'writer', scopes: ['read', 'write'] } : raw === 'limited' ? { id: 'mcp-limited', name: 'limited', scopes: ['read'] } : null }));
vi.mock('../services/settings.js', () => ({ getSettings: async () => ({ api: { rateLimitPerMin: state.limit } }) }));
vi.mock('../services/mcpAgentApi.js', () => ({ createScopedAgentApi: (scopes: string[]) => ({
  tags: async () => { state.started = true; if (state.slow) await new Promise(resolve => setTimeout(resolve, 80)); return { tags: [{ tag: 'fixture', count: 1 }] }; },
  writeNote: async () => { if (!scopes.includes('write')) throw new Error('403 Missing scope: write'); return { ok: true }; },
}) }));
import { createMcpRouter } from './mcp.js';
import { readMcpConfig } from '../services/mcpConfig.js';

describe('HTTP MCP', () => {
  let server: http.Server, base: string;
  beforeAll(async () => {
    const app = express();
    app.use('/off', createMcpRouter(readMcpConfig({})));
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    app.use('/mcp', createMcpRouter(readMcpConfig({ WEBOBSIDIAN_MCP_ENABLED: 'true', WEBOBSIDIAN_MCP_PUBLIC_URL: `${base}/mcp` })));
    app.get('*', (_req, res) => res.type('html').send('SPA'));
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const headers = (key = 'valid') => ({ Authorization: `Bearer ${key}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' });
  const rpc = (method: string, params = {}) => JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });

  it('returns 404 while disabled, rather than SPA HTML', async () => {
    for (const method of ['GET', 'POST', 'DELETE']) { const res = await fetch(`${base}/off`, { method }); expect(res.status).toBe(404); expect(res.headers.get('content-type')).not.toMatch(/html/); }
  });
  it('authenticates every request and refuses cookie-only requests', async () => {
    for (const init of [{}, { headers: { Cookie: 'session=valid' } }, { headers: headers('bad') }]) {
      expect((await fetch(`${base}/mcp`, init)).status).toBe(401);
    }
    for (const method of ['GET', 'DELETE']) { const res = await fetch(`${base}/mcp`, { method, headers: headers() }); expect(res.status).toBe(405); expect(res.headers.get('allow')).toBe('POST'); expect(res.headers.get('cache-control')).toBe('no-store'); }
  });
  it('checks raw Host and exact Origin, ignores spoofed forwarded host', async () => {
    expect((await fetch(`${base}/mcp`, { method: 'POST', headers: { ...headers(), Origin: 'https://evil.example' }, body: rpc('tools/list') })).status).toBe(403);
    // fetch controls Host itself; node:http lets this test send the actual spoofed header.
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = http.request(`${base}/mcp`, { method: 'POST', headers: { ...headers(), Host: 'evil.example', 'X-Forwarded-Host': new URL(base).host } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end(rpc('tools/list'));
    });
    expect(status).toBe(403);
    expect((await fetch(`${base}/mcp`, { method: 'POST', headers: { ...headers(), Origin: base }, body: rpc('tools/list') })).status).toBe(200);
  });
  it('uses the official SDK for initialize, notification, list and call with no session', async () => {
    const client = new Client({ name: 'test', version: '1' });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: 'Bearer valid' } } });
    await client.connect(transport);
    expect(transport.sessionId).toBeUndefined();
    expect((await client.listTools()).tools).toHaveLength(10);
    const result = await client.callTool({ name: 'list_tags', arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result)).toContain('fixture');
    await client.close();
  });
  it('keeps concurrent requests and scopes isolated, immediately honours revocation', async () => {
    const request = async (key: string) => (await fetch(`${base}/mcp`, { method: 'POST', headers: headers(key), body: rpc('tools/call', { name: 'write_note', arguments: { path: 'a.md', content: 'hello' } }) })).json();
    const [reader, writer] = await Promise.all([request('valid'), request('writer')]);
    expect(reader.result.isError).toBe(true); expect(writer.result.isError).not.toBe(true);
    state.revoked = true;
    expect((await fetch(`${base}/mcp`, { headers: headers() })).status).toBe(401);
    state.revoked = false;
  });
  it('rejects invalid headers, JSON and protocol versions', async () => {
    const cases = [
      { headers: headers(), body: '{broken', status: 400 },
      { headers: { ...headers(), Accept: 'text/plain' }, body: rpc('tools/list'), status: 406 },
      { headers: { ...headers(), 'Content-Type': 'text/plain' }, body: rpc('tools/list'), status: 415 },
      { headers: { ...headers(), 'MCP-Protocol-Version': 'invalid' }, body: rpc('tools/list'), status: 400 },
    ];
    for (const item of cases) expect((await fetch(`${base}/mcp`, { method: 'POST', headers: item.headers, body: item.body })).status).toBe(item.status);
  });
  it('acknowledges notifications and closes each request server once', async () => {
    const close = vi.spyOn(McpServer.prototype, 'close');
    try {
      const res = await fetch(`${base}/mcp`, { method: 'POST', headers: headers(), body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
      expect(res.status).toBe(202);
      expect(await res.text()).toBe('');
      await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    } finally { close.mockRestore(); }
  });
  it('limits JSON body size and does not reflect request content', async () => {
    const res = await fetch(`${base}/mcp`, { method: 'POST', headers: headers(), body: JSON.stringify({ secret: 's'.repeat(33 * 1024 * 1024) }) });
    expect(res.status).toBe(413);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('{"error":"Request body too large"}');
  });
  it('releases a disconnected request without closing other clients', async () => {
    const close = vi.spyOn(McpServer.prototype, 'close');
    state.slow = true; state.started = false;
    const req = http.request(`${base}/mcp`, { method: 'POST', headers: headers() });
    req.on('error', () => {});
    try {
      req.end(rpc('tools/call', { name: 'list_tags', arguments: {} }));
      await vi.waitFor(() => expect(state.started).toBe(true), { interval: 5 });
      req.destroy();
      await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
      state.slow = false;
      const res = await fetch(`${base}/mcp`, { method: 'POST', headers: headers(), body: rpc('tools/list') });
      expect(res.status).toBe(200); await res.text();
    } finally { req.destroy(); state.slow = false; close.mockRestore(); }
  });
  it('counts a request only once against the per-key limit', async () => {
    state.limit = 1;
    expect((await fetch(`${base}/mcp`, { method: 'POST', headers: headers('limited'), body: rpc('tools/list') })).status).toBe(200);
    expect((await fetch(`${base}/mcp`, { method: 'POST', headers: headers('limited'), body: rpc('tools/list') })).status).toBe(429);
    state.limit = 120;
  });
});
