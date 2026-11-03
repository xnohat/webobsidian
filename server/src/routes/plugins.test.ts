import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Server } from 'node:http';
const state = vi.hoisted(() => ({ settings: { vault: { path: '', allowedRoots: [] as string[] }, plugins: { enabled: ['fixture'], installed: [] as string[] } }, dataDir: '' }));
vi.mock('../services/settings.js', () => ({ getSettings: async () => state.settings, updateSettings: async (fn: any) => { await fn(state.settings); return state.settings; } }));
vi.mock('../config.js', () => ({ config: { get dataDir() { return state.dataDir; } } }));
vi.mock('../middleware/auth.js', () => ({ requireAuth: (req: any, res: any, next: () => void) => req.headers.authorization === 'test' ? next() : res.status(401).json({ error: 'Unauthorized' }) }));
let server: Server, base: string, dir: string;
beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'webo-plugin-routes-'));
    state.dataDir = path.join(dir, 'data');
    state.settings.vault.path = path.join(dir, 'vault');
    const folder = path.join(state.settings.vault.path, '.obsidian/plugins/fixture');
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'manifest.json'), JSON.stringify({ id: 'fixture', name: 'Fixture', version: '1' }));
    await fs.writeFile(path.join(folder, 'main.js'), 'globalThis.__PLUGIN_SERVER_EXECUTED=true;module.exports=class {};');
    const { pluginsRouter } = await import('./plugins.js');
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/plugins', pluginsRouter);
    app.use((e: any, _req: any, res: any, _next: any) => res.status(e.status ?? 500).json({ error: e.message }));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as {
        port: number;
    }).port}/api/plugins`;
});
afterAll(async () => { await new Promise<void>(r => server.close(() => r())); await fs.rm(dir, { recursive: true, force: true }); });
const headers = { authorization: 'test' };
it('gates all plugin endpoints behind authentication', async () => {
    for (const route of ['/', '/fixture/runtime.mjs?version=x', '/fixture/data', '/fixture/main.js'])
        expect((await fetch(base + route)).status).toBe(401);
});
it('delivers a syntax-checked ESM factory only for matching enabled version', async () => { const catalog = await (await fetch(base + '/', { headers })).json(); const p = catalog.plugins[0]; expect(p.vaultIdentity).toBe(catalog.vaultIdentity); const response = await fetch(new URL(p.runtimeUrl, base).href, { headers }); expect(response.status).toBe(200); expect(response.headers.get('content-type')).toContain('javascript'); expect(response.headers.get('cache-control')).toContain('no-store'); expect(await response.text()).toContain('export default function'); expect((globalThis as any).__PLUGIN_SERVER_EXECUTED).toBeUndefined(); expect((await fetch(base + '/fixture/runtime.mjs?version=old', { headers })).status).toBe(409); await fetch(base + '/fixture/enabled', { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: '{"enabled":false}' }); expect((await fetch(new URL(p.runtimeUrl, base).href, { headers })).status).toBe(403); state.settings.plugins.enabled = ['fixture']; });
it('persists only web data and rejects stale vault writes/oversized data', async () => { const catalog = await (await fetch(base + '/', { headers })).json(); const h = { ...headers, 'content-type': 'application/json', 'X-Plugin-Vault': catalog.vaultIdentity }; expect((await fetch(base + '/fixture/data', { method: 'PUT', headers: h, body: '{"data":{"saved":true}}' })).status).toBe(200); expect(await (await fetch(base + '/fixture/data', { headers: h })).json()).toEqual({ data: { saved: true } }); expect((await fetch(base + '/fixture/data', { method: 'PUT', headers: { ...h, 'X-Plugin-Vault': 'stale' }, body: '{"data":null}' })).status).toBe(409); expect((await fetch(base + '/fixture/data', { method: 'PUT', headers: h, body: JSON.stringify({ data: 'x'.repeat(1048576) }) })).status).toBe(413); });
