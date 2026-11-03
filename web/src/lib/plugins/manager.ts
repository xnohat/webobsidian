import { failureFor, type PluginState, type FailureStage } from './diagnostics';
export interface PluginDescriptor {
    id: string;
    enabled: boolean;
    contentVersion: string;
    runtimeUrl?: string;
    vaultIdentity?: string;
    hasStyles?: boolean;
    name?: string;
    [key: string]: unknown;
}
export interface PluginHandle {
    unload(): void | Promise<void>;
}
export interface LoadContext {
    active(): boolean;
    own(handle: PluginHandle): void;
    stage(stage: FailureStage): void;
}
export class PluginManager {
    private vault = '';
    private generation = 0;
    private request = 0;
    private desired = new Map<string, PluginDescriptor>();
    private entries = new Map<string, {
        version: string;
        handle?: PluginHandle;
        promise: Promise<void>;
        disposed: boolean;
        stage: FailureStage;
    }>();
    private states = new Map<string, PluginState>();
    private listeners = new Set<() => void>();
    constructor(private loader: (p: PluginDescriptor, c: LoadContext) => Promise<PluginHandle>) { }
    subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
    private revision = 0;
    getRevision = () => this.revision;
    private emit() { this.revision++; for (const fn of this.listeners)
        fn(); }
    getStates() { return [...this.states.values()]; }
    private async dispose(entry: {
        handle?: PluginHandle;
        disposed: boolean;
    }) { if (entry.disposed)
        return; entry.disposed = true; await entry.handle?.unload(); }
    async reconcile(vault: string, plugins: PluginDescriptor[]): Promise<void> {
        const request = ++this.request;
        if (this.vault !== vault) {
            this.vault = vault;
            await this.reset();
            if (request !== this.request)
                return;
        }
        const generation = this.generation;
        this.desired = new Map(plugins.filter(p => p.enabled).map(p => [p.id, p]));
        for (const [id, entry] of this.entries) {
            if (!this.desired.has(id) || this.desired.get(id)?.contentVersion !== entry.version) {
                this.entries.delete(id);
                let unloadFailure;
                try {
                    await this.dispose(entry);
                }
                catch (e) {
                    unloadFailure = failureFor(id, 'unload', e);
                }
                if (request !== this.request)
                    return;
                this.states.set(id, unloadFailure ? { id, enabled: false, state: 'failed', failure: unloadFailure } : { id, enabled: false, state: 'disabled' });
            }
        }
        for (const p of plugins)
            if (!p.enabled && !this.entries.has(p.id))
                this.states.set(p.id, { id: p.id, enabled: false, state: 'disabled' });
        const waits: Promise<void>[] = [];
        for (const p of this.desired.values()) {
            const old = this.entries.get(p.id);
            if (old) {
                waits.push(old.promise);
                continue;
            }
            const entry = { version: p.contentVersion, handle: undefined as PluginHandle | undefined, promise: Promise.resolve(), disposed: false, stage: 'fetch' as FailureStage };
            const active = () => generation === this.generation && this.desired.get(p.id)?.contentVersion === p.contentVersion && this.entries.get(p.id) === entry && !entry.disposed;
            this.entries.set(p.id, entry);
            this.states.set(p.id, { id: p.id, enabled: true, state: 'loading' });
            this.emit();
            entry.promise = Promise.resolve().then(async () => {
                try {
                    const handle = await this.loader(p, { active, own: h => { entry.handle = h; if (entry.disposed)
                            void Promise.resolve().then(() => h.unload()).catch(() => { }); }, stage: s => { entry.stage = s; } });
                    entry.handle = handle;
                    if (!active()) {
                        if (!entry.disposed)
                            await this.dispose(entry);
                        return;
                    }
                    this.states.set(p.id, { id: p.id, enabled: true, state: 'loaded' });
                }
                catch (e) {
                    await this.dispose(entry).catch(() => { });
                    if (generation === this.generation && this.desired.has(p.id) && this.entries.get(p.id) === entry) {
                        const failure = failureFor(p.id, entry.stage, e);
                        this.states.set(p.id, { id: p.id, enabled: true, state: failure.kind.startsWith('unsupported') ? 'unsupported' : 'failed', failure });
                    }
                }
                finally {
                    this.emit();
                }
            });
            waits.push(entry.promise);
        }
        this.emit();
        await Promise.all(waits);
    }
    async stop() { this.request++; this.vault = ''; await this.reset(); }
    private async reset() { this.generation++; this.desired.clear(); const entries = [...this.entries.values()]; this.entries.clear(); this.states.clear(); this.emit(); await Promise.all(entries.map(e => this.dispose(e).catch(() => { }))); }
    async reportFailure(id: string, version: string, e: unknown, stage: FailureStage = 'onload') { const entry = this.entries.get(id); if (!entry || entry.version !== version || entry.disposed)
        return; const failure = failureFor(id, stage, e); this.states.set(id, { id, enabled: true, state: failure.kind.startsWith('unsupported') ? 'unsupported' : 'failed', failure }); this.emit(); await this.dispose(entry).catch(() => { }); }
    catalogFailed(e: unknown) { this.states.set('$catalog', { id: '$catalog', enabled: true, state: 'failed', failure: failureFor('$catalog', 'catalog', e) }); this.emit(); }
}
