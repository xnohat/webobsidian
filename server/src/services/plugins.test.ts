import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const state = vi.hoisted(() => ({ settings: { vault: { path: '', allowedRoots: [] as string[] }, plugins: { enabled: ['fixture'], installed: [] as string[] } }, dataDir: '' }));
vi.mock('./settings.js', () => ({ getSettings: async () => state.settings, updateSettings: async (fn: any) => { await fn(state.settings); return state.settings; } }));
vi.mock('../config.js', () => ({ config: { get dataDir() { return state.dataDir; } } }));
let dir: string;
let plugins: typeof import('./plugins.js');
beforeAll(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'webo-plugin-')); state.dataDir = path.join(dir, 'data'); state.settings.vault.path = path.join(dir, 'vault'); await fs.mkdir(path.join(state.settings.vault.path, '.obsidian/plugins/fixture'), { recursive: true }); await fs.writeFile(path.join(state.settings.vault.path, '.obsidian/plugins/fixture/manifest.json'), JSON.stringify({ id: 'fixture', name: 'Fixture', version: '1' })); await fs.writeFile(path.join(state.settings.vault.path, '.obsidian/plugins/fixture/main.js'), 'module.exports=class {};'); plugins = await import('./plugins.js'); });
afterAll(async () => {
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    if (dir)
        await fs.rm(dir, { recursive: true, force: true });
});
it('catalog identifies desktop content and versions its runtime URL', async () => { const [p] = await plugins.listInstalled(); expect(p.source).toBe('desktop'); expect(p.contentVersion).toMatch(/^[a-f0-9]{64}$/); expect(p.runtimeUrl).toContain(p.contentVersion); });
it('requires enabled and matching content version for compilation without executing code', async () => { const [p] = await plugins.listInstalled(); const js = await plugins.getRuntimeModule('fixture', p.contentVersion); expect(js).toContain('export'); await expect(plugins.getRuntimeModule('fixture', 'old')).rejects.toMatchObject({ status: 409 }); state.settings.plugins.enabled = []; await expect(plugins.getRuntimeModule('fixture', p.contentVersion)).rejects.toMatchObject({ status: 403 }); state.settings.plugins.enabled = ['fixture']; });
it('isolates web plugin data and rejects stale vault identity/traversal', async () => { const d = await import('./pluginData.js'); const [p] = await plugins.listInstalled(); await d.writePluginData('fixture', { hello: true }, p.vaultIdentity); expect(await d.readPluginData('fixture', p.vaultIdentity)).toEqual({ hello: true }); await expect(d.writePluginData('../escape', {}, p.vaultIdentity)).rejects.toMatchObject({ status: 400 }); await expect(d.writePluginData('fixture', {}, 'old')).rejects.toMatchObject({ status: 409 }); expect(await fs.access(path.join(state.settings.vault.path, '.obsidian/plugins/fixture/data.json')).then(() => true, () => false)).toBe(false); });
it('failed downloads preserve desktop files and active web version; successful install uses DATA_DIR', async () => {
    const original = await fs.readFile(path.join(state.settings.vault.path, '.obsidian/plugins/fixture/manifest.json'), 'utf8');
    let fail = false;
    let css = true;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url.includes('/releases/latest'))
            return new Response(JSON.stringify({ assets: [{ name: 'manifest.json', browser_download_url: 'https://github.com/x/y/releases/download/v2/manifest.json' }, { name: 'main.js', browser_download_url: 'https://github.com/x/y/releases/download/v2/main.js' }, ...(css ? [{ name: 'styles.css', browser_download_url: 'https://github.com/x/y/releases/download/v2/styles.css' }] : [])] }), { headers: { 'content-type': 'application/json' } });
        if (url.endsWith('manifest.json'))
            return new Response(JSON.stringify({ id: 'fixture', name: 'Fixture', version: '2' }));
        if (url.endsWith('main.js'))
            return new Response(fail ? 'error' : 'module.exports=class {};', { status: fail ? 500 : 200 });
        return new Response('body{}');
    }));
    const installed = await plugins.installFromGithub('x/y');
    expect(installed.source).toBe('web');
    expect(installed.hasStyles).toBe(true);
    fail = true;
    await expect(plugins.installFromGithub('x/y')).rejects.toThrow();
    expect((await plugins.listInstalled())[0].contentVersion).toBe(installed.contentVersion);
    fail = false;
    css = false;
    expect((await plugins.installFromGithub('x/y')).hasStyles).toBe(false);
    expect(await fs.readFile(path.join(state.settings.vault.path, '.obsidian/plugins/fixture/manifest.json'), 'utf8')).toBe(original);
});
it('serializes concurrent saves atomically and keeps vault data separate', async () => {
    const d = await import('./pluginData.js');
    const [p] = await plugins.listInstalled();
    await Promise.all(Array.from({ length: 10 }, (_, i) => d.writePluginData('fixture', { i }, p.vaultIdentity)));
    const final = await d.readPluginData('fixture', p.vaultIdentity) as {
        i: number;
    };
    expect(final.i).toBeGreaterThanOrEqual(0);
    expect(final.i).toBeLessThan(10);
    const root = state.settings.vault.path;
    const next = path.join(dir, 'next-vault');
    await fs.mkdir(next);
    state.settings.vault.path = next;
    try {
        expect(await d.readPluginData('fixture')).toBeNull();
        await expect(d.readPluginData('fixture', p.vaultIdentity)).rejects.toMatchObject({ status: 409 });
    }
    finally {
        state.settings.vault.path = root;
    }
});
it.skipIf(process.platform === 'win32')('rejects symlinked data files instead of reading/writing their targets', async () => { const d = await import('./pluginData.js'); const store = await import('./pluginStorage.js'); const ctx = await store.pluginContext(); const dataFile = await store.storagePath(ctx, 'data', 'link.json'); await fs.mkdir(path.dirname(dataFile), { recursive: true }); const target = path.join(dir, 'private-target.json'); await fs.writeFile(target, '{"unchanged":true}'); await fs.symlink(target, dataFile); await expect(d.readPluginData('link')).rejects.toMatchObject({ status: 400 }); await expect(d.writePluginData('link', {})).rejects.toMatchObject({ status: 400 }); expect(await fs.readFile(target, 'utf8')).toBe('{"unchanged":true}'); });
it('keeps broken and missing enabled plugins visible with sanitized diagnostics and allows disabling them', async () => { const root = state.settings.vault.path; const folder = path.join(root, '.obsidian/plugins/broken'); await fs.mkdir(folder, { recursive: true }); await fs.writeFile(path.join(folder, 'manifest.json'), 'not json'); state.settings.plugins.enabled.push('broken', 'removed'); const entries = await plugins.listInstalled(); for (const id of ['broken', 'removed']) {
    const p = entries.find(p => p.id === id);
    expect(p).toMatchObject({ id, enabled: true });
    expect(p?.availabilityError).toBeDefined();
    expect(JSON.stringify(p?.availabilityError)).not.toContain(root);
} await plugins.setEnabled('removed', false); expect(state.settings.plugins.enabled).not.toContain('removed'); });
