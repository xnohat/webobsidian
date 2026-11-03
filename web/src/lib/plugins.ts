import { api } from './api';
import { useStore, loadDraftScope } from './store';
import { useSyncExternalStore } from 'react';
import { PluginManager, type PluginDescriptor } from './plugins/manager';
import { createObsidianModule } from './plugins/obsidianApi';
import { PluginLoadError } from './plugins/diagnostics';
export { PluginManager } from './plugins/manager';
export * from './plugins/diagnostics';
let catalogRequest = 0;
let session = 0;
let readiness: Promise<unknown> = Promise.resolve();
let summary = '';
export const pluginManager = new PluginManager(async (p, ctx) => {
    if (p.availabilityError) {
        ctx.stage('catalog');
        const error = p.availabilityError as {
            kind: 'http' | 'syntax' | 'runtime';
            message: string;
            status: number;
        };
        throw new PluginLoadError(error.kind, error.message, error.status);
    }
    const scope = await loadDraftScope();
    if (!ctx.active())
        throw new Error('Plugin stopped');
    ctx.stage('fetch');
    const url = p.runtimeUrl;
    if (!url)
        throw new PluginLoadError('http', 'Plugin runtime URL is missing');
    const parsed = new URL(url, location.origin);
    if (parsed.origin !== location.origin || !parsed.pathname.startsWith('/api/plugins/'))
        throw new PluginLoadError('http', 'Invalid runtime origin');
    const response = await fetch(parsed.href, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
        let kind = 'http';
        try {
            const data = await response.json();
            if (data.kind === 'syntax' || String(data.error ?? '').startsWith('PLUGIN_COMPILE_ERROR'))
                kind = 'syntax';
        }
        catch { }
        throw new PluginLoadError(kind as 'http' | 'syntax', `Plugin module request failed (HTTP ${response.status}).`, response.status);
    }
    if (!/javascript|ecmascript/.test(response.headers.get('Content-Type') ?? ''))
        throw new PluginLoadError('http', 'Plugin module response is not JavaScript');
    const runtime = createObsidianModule({ id: p.id, vaultIdentity: p.vaultIdentity ?? '', draftScope: scope, active: ctx.active, fail: (error, stage) => { if (ctx.active())
            void pluginManager.reportFailure(p.id, p.contentVersion, error, stage); } });
    let instance: any;
    let stopped = false;
    let style: HTMLLinkElement | undefined;
    const handle = { async unload() { if (stopped)
            return; stopped = true; try {
            await instance?.unload();
        }
        finally {
            runtime.dispose();
            style?.remove();
        } } };
    ctx.own(handle);
    ctx.stage('compile');
    const imported = await import(/* @vite-ignore */ parsed.href);
    if (!ctx.active())
        return handle;
    const module = { exports: {} as any };
    const require = (name: string) => { if (name === 'obsidian')
        return runtime.module; throw new PluginLoadError('unsupported-module', `Unsupported web module: ${String(name).replace(/[^@a-zA-Z0-9_./-]/g, '').slice(0, 100)}`); };
    ctx.stage('instantiate');
    imported.default(module, module.exports, require);
    const PluginClass = module.exports.default ?? module.exports;
    instance = new PluginClass(runtime.app, p);
    if (!ctx.active()) {
        await instance.unload?.();
        return handle;
    }
    ctx.stage('onload');
    await instance.onload?.();
    if (!ctx.active())
        return handle;
    if (p.hasStyles) {
        style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = `/api/plugins/${encodeURIComponent(p.id)}/styles.css?version=${encodeURIComponent(p.contentVersion)}`;
        document.head.appendChild(style);
    }
    return handle;
});
export function usePluginStates() { useSyncExternalStore(pluginManager.subscribe, pluginManager.getRevision, pluginManager.getRevision); return pluginManager.getStates(); }
export async function loadPlugins(ready?: Promise<unknown>): Promise<void> {
    const current = session;
    const ticket = ++catalogRequest;
    if (ready)
        readiness = ready;
    try {
        await readiness;
        if (current !== session || ticket !== catalogRequest)
            return;
        const catalog = await api.listPlugins();
        if (current !== session || ticket !== catalogRequest)
            return;
        const identity = catalog.vaultIdentity ?? '';
        await pluginManager.reconcile(identity, catalog.plugins as PluginDescriptor[]);
        if (current !== session || ticket !== catalogRequest)
            return;
        const failures = pluginManager.getStates().filter(p => p.failure);
        const key = identity + failures.map(p => `${p.id}:${p.failure?.kind}`).join('|');
        if (failures.length && key !== summary) {
            summary = key;
            useStore.getState().notify(`${failures.length} plugin(s) could not start. See Settings → Community Plugins.`);
        }
    }
    catch (e) {
        if (current === session && ticket === catalogRequest)
            pluginManager.catalogFailed(e);
    }
}
export async function stopPlugins() { session++; catalogRequest++; readiness = Promise.resolve(); summary = ''; await pluginManager.stop(); }
