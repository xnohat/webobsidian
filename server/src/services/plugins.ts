import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getSettings, updateSettings } from './settings.js';
import { assertPluginId, pluginContext, storagePath, readBounded, atomicWrite, serializePlugin, pluginError, digest, type PluginContext } from './pluginStorage.js';
import { compilePluginModule } from './pluginModule.js';
export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    minAppVersion?: string;
    description?: string;
    author?: string;
    authorUrl?: string;
    isDesktopOnly?: boolean;
}
export interface InstalledPlugin extends PluginManifest {
    enabled: boolean;
    hasStyles: boolean;
    dir: string;
    source: 'desktop' | 'web';
    contentVersion: string;
    runtimeUrl: string;
    vaultIdentity: string;
    availabilityError?: {
        kind: 'http' | 'syntax' | 'runtime';
        message: string;
        status: number;
    };
}
interface Bundle {
    manifest: PluginManifest;
    main: string;
    css?: string;
    source: 'desktop' | 'web';
    dir: string;
    contentVersion: string;
}
function manifest(value: unknown, id?: string): PluginManifest {
    const m = value as PluginManifest;
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || typeof m.name !== 'string' || !m.name || m.name.length > 200 || typeof m.version !== 'string' || !m.version || m.version.length > 100)
        pluginError(422, 'Invalid plugin manifest');
    assertPluginId(m.id);
    if (id && m.id !== id)
        pluginError(422, 'Plugin manifest id does not match directory');
    return { id: m.id, name: m.name, version: m.version, minAppVersion: typeof m.minAppVersion === 'string' ? m.minAppVersion : undefined, description: typeof m.description === 'string' ? m.description.slice(0, 4096) : undefined, author: typeof m.author === 'string' ? m.author : undefined, authorUrl: typeof m.authorUrl === 'string' ? m.authorUrl : undefined, isDesktopOnly: m.isDesktopOnly === true };
}
async function safeDesktopFile(ctx: PluginContext, dir: string, asset: string): Promise<string> {
    const file = path.join(dir, asset);
    const real = await fs.realpath(file);
    const roots = await Promise.all(ctx.allowedRoots.map(r => fs.realpath(r).catch(() => path.resolve(r))));
    if (!roots.some(root => { const rel = path.relative(root, real); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); }))
        pluginError(403, 'Plugin asset outside allowed roots');
    return file;
}
async function bundle(ctx: PluginContext, id: string): Promise<Bundle> {
    assertPluginId(id);
    let dir: string;
    let source: 'desktop' | 'web' = 'desktop';
    const pointer = await storagePath(ctx, 'installed', id, 'current.json');
    try {
        const current = JSON.parse(await readBounded(pointer, 4096));
        if (!/^[a-f0-9]{64}$/.test(current.version))
            pluginError(422, 'Invalid plugin version pointer');
        dir = await storagePath(ctx, 'installed', id, 'versions', current.version);
        source = 'web';
    }
    catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
            throw e;
        dir = path.join(ctx.root, '.obsidian', 'plugins', id);
    }
    const file = async (a: string) => source === 'desktop' ? safeDesktopFile(ctx, dir, a) : storagePath(ctx, 'installed', id, 'versions', path.basename(dir), a);
    for (let attempt = 0; attempt < 2; attempt++) {
        const mf = await file('manifest.json'), mainFile = await file('main.js');
        const before = await Promise.all([fs.stat(mf), fs.stat(mainFile)]);
        let cssFile: string | undefined;
        let cssBefore: Awaited<ReturnType<typeof fs.stat>> | undefined;
        try {
            cssFile = await file('styles.css');
            cssBefore = await fs.stat(cssFile);
        }
        catch (e) {
            cssFile = undefined;
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
                throw e;
        }
        const raw = await readBounded(mf, 65536), main = await readBounded(mainFile, 16 * 1024 * 1024);
        let css: string | undefined;
        if (cssFile)
            css = await readBounded(cssFile, 4 * 1024 * 1024);
        let cssAfter: Awaited<ReturnType<typeof fs.stat>> | undefined;
        try {
            cssAfter = await fs.stat(await file('styles.css'));
        }
        catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
                throw e;
        }
        const cssChanged = Boolean(cssBefore) !== Boolean(cssAfter) || (cssBefore && cssAfter && (cssBefore.size !== cssAfter.size || cssBefore.mtimeMs !== cssAfter.mtimeMs || cssBefore.ctimeMs !== cssAfter.ctimeMs));
        const after = await Promise.all([fs.stat(mf), fs.stat(mainFile)]);
        if (cssChanged || before.some((s, i) => s.size !== after[i].size || s.mtimeMs !== after[i].mtimeMs || s.ctimeMs !== after[i].ctimeMs)) {
            if (attempt === 0)
                continue;
            pluginError(409, 'PLUGIN_ASSET_CHANGED');
        }
        const m = manifest(JSON.parse(raw), id);
        const contentVersion = digest(JSON.stringify([1, ctx.vaultIdentity, id, raw, main, css ?? null]));
        return { manifest: m, main, css, source, dir: source === 'desktop' ? '.obsidian/plugins/' + id : 'web:' + id, contentVersion };
    }
    return pluginError(409, 'PLUGIN_ASSET_CHANGED');
}
function installed(ctx: PluginContext, b: Bundle): InstalledPlugin { const id = b.manifest.id; return { ...b.manifest, enabled: ctx.enabled.includes(id), hasStyles: b.css !== undefined, dir: b.dir, source: b.source, contentVersion: b.contentVersion, vaultIdentity: ctx.vaultIdentity, runtimeUrl: `/api/plugins/${encodeURIComponent(id)}/runtime.mjs?version=${b.contentVersion}` }; }
export async function listInstalled(provided?: PluginContext): Promise<InstalledPlugin[]> {
    const ctx = provided ?? await pluginContext();
    const ids = new Set<string>(ctx.enabled);
    const sources = new Map<string, 'desktop' | 'web'>();
    for (const dir of [path.join(ctx.root, '.obsidian/plugins'), await storagePath(ctx, 'installed')]) {
        try {
            for (const e of await fs.readdir(dir, { withFileTypes: true }))
                if (e.isDirectory()) {
                    ids.add(e.name);
                    sources.set(e.name, dir === path.join(ctx.root, '.obsidian/plugins') ? 'desktop' : 'web');
                }
        }
        catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
                throw e;
        }
    }
    const out: InstalledPlugin[] = [];
    for (const id of ids) {
        try {
            out.push(installed(ctx, await bundle(ctx, id)));
        }
        catch (error) {
            try {
                assertPluginId(id);
            }
            catch {
                continue;
            }
            const invalid = error instanceof SyntaxError || (error as {
                status?: number;
            }).status === 422;
            const contentVersion = digest(JSON.stringify([1, ctx.vaultIdentity, id, 'unavailable']));
            out.push({ id, name: id, version: 'unavailable', enabled: ctx.enabled.includes(id), hasStyles: false, dir: 'unavailable:' + id, source: sources.get(id) ?? 'desktop', vaultIdentity: ctx.vaultIdentity, contentVersion, runtimeUrl: `/api/plugins/${encodeURIComponent(id)}/runtime.mjs?version=${contentVersion}`, availabilityError: { kind: invalid ? 'syntax' : 'http', status: invalid ? 422 : ((error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 503), message: invalid ? 'Plugin manifest or assets are invalid.' : 'Plugin files are missing or unavailable.' } });
        }
    }
    return out;
}
export async function getPluginAsset(id: string, asset: 'main.js' | 'styles.css' | 'manifest.json', version?: string): Promise<string> {
    const ctx = await pluginContext();
    const b = await bundle(ctx, id);
    if (version && version !== b.contentVersion)
        pluginError(409, 'PLUGIN_VERSION_CHANGED');
    if (asset === 'manifest.json')
        return JSON.stringify(b.manifest);
    if (asset === 'main.js')
        return b.main;
    if (b.css === undefined)
        pluginError(404, 'Plugin styles not found');
    return b.css;
}
export async function getRuntimeModule(id: string, version: string): Promise<string> {
    const ctx = await pluginContext();
    assertPluginId(id);
    if (!ctx.enabled.includes(id))
        pluginError(403, 'PLUGIN_DISABLED');
    const b = await bundle(ctx, id);
    if (version !== b.contentVersion)
        pluginError(409, 'PLUGIN_VERSION_CHANGED');
    return compilePluginModule(b.main);
}
export async function setEnabled(id: string, enabled: boolean): Promise<void> {
    assertPluginId(id);
    const ctx = await pluginContext();
    if (enabled)
        await bundle(ctx, id);
    await serializePlugin('plugin-enabled-settings', async () => {
        await updateSettings(d => {
            if (path.resolve(d.vault.path) !== ctx.settingsRoot)
                pluginError(409, 'PLUGIN_VAULT_CHANGED');
            const set = new Set(d.plugins.enabled);
            if (enabled)
                set.add(id);
            else
                set.delete(id);
            d.plugins.enabled = [...set];
        });
    });
}
async function download(url: string, limit: number): Promise<string> {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !['github.com', 'api.github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'].includes(target.hostname))
        pluginError(400, 'Invalid plugin download URL');
    const response = await fetch(url, { headers: { 'User-Agent': 'WebObsidian' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok)
        pluginError(502, 'Plugin download failed: HTTP ' + response.status);
    if (response.headers.get('content-type')?.includes('text/html'))
        pluginError(502, 'Unexpected plugin asset HTML');
    if (!response.body)
        pluginError(502, 'Empty plugin download');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > limit)
                pluginError(413, 'Plugin download exceeds allowed size');
            chunks.push(value);
        }
    }
    finally {
        await reader.cancel().catch(() => { });
    }
    return Buffer.concat(chunks).toString('utf8');
}
export async function installFromGithub(repo: string): Promise<InstalledPlugin> {
    const clean = repo.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '').trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(clean))
        pluginError(400, 'Use GitHub owner/repository');
    const ctx = await pluginContext();
    const release = JSON.parse(await download(`https://api.github.com/repos/${clean}/releases/latest`, 1048576));
    if (!Array.isArray(release.assets))
        pluginError(422, 'Invalid GitHub release');
    const assets = new Map(release.assets.map((a: {
        name: string;
        browser_download_url: string;
    }) => [a.name, a.browser_download_url]));
    if (!assets.has('manifest.json') || !assets.has('main.js'))
        pluginError(422, 'Release missing manifest.json or main.js');
    const raw = await download(String(assets.get('manifest.json')), 65536);
    const m = manifest(JSON.parse(raw));
    return serializePlugin(ctx.vaultIdentity + ':install:' + m.id, async () => {
        const main = await download(String(assets.get('main.js')), 16 * 1024 * 1024);
        const css = assets.has('styles.css') ? await download(String(assets.get('styles.css')), 4 * 1024 * 1024) : undefined;
        await compilePluginModule(main);
        const version = digest(JSON.stringify([raw, main, css ?? null]));
        const versionDir = await storagePath(ctx, 'installed', m.id, 'versions', version);
        await fs.mkdir(versionDir, { recursive: true });
        await atomicWrite(await storagePath(ctx, 'installed', m.id, 'versions', version, 'manifest.json'), raw);
        await atomicWrite(await storagePath(ctx, 'installed', m.id, 'versions', version, 'main.js'), main);
        if (css !== undefined)
            await atomicWrite(await storagePath(ctx, 'installed', m.id, 'versions', version, 'styles.css'), css);
        // The active pointer changes only after every asset is complete; previous versions remain intact.
        await atomicWrite(await storagePath(ctx, 'installed', m.id, 'current.json'), JSON.stringify({ version }));
        return installed(ctx, await bundle(ctx, m.id));
    });
}
export { pluginContext };
