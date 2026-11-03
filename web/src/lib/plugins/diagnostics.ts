export type FailureStage = 'catalog' | 'fetch' | 'compile' | 'instantiate' | 'onload' | 'unload' | 'processor' | 'command';
export type FailureKind = 'http' | 'csp' | 'syntax' | 'unsupported-module' | 'unsupported-api' | 'runtime';
export interface PluginFailure {
    pluginId: string;
    stage: FailureStage;
    kind: FailureKind;
    message: string;
    status?: number;
}
export interface PluginState {
    id: string;
    enabled: boolean;
    state: 'disabled' | 'loading' | 'loaded' | 'failed' | 'unsupported';
    failure?: PluginFailure;
}
export class PluginLoadError extends Error {
    constructor(public kind: FailureKind, message: string, public status?: number) { super(message); }
}
export class UnsupportedPluginApiError extends PluginLoadError {
    constructor(capability: string) { super('unsupported-api', `Unsupported web API: ${capability}`); }
}
export function failureFor(pluginId: string, stage: FailureStage, e: unknown): PluginFailure {
    const known = e instanceof PluginLoadError;
    const kind = known ? e.kind : e instanceof EvalError ? 'csp' : e instanceof SyntaxError ? 'syntax' : 'runtime';
    return { pluginId, stage, kind, message: known ? e.message.slice(0, 200) : kind === 'csp' ? 'The browser blocked dynamic code execution.' : kind === 'syntax' ? 'The plugin contains invalid JavaScript.' : `Plugin ${stage} failed (${e instanceof Error ? e.name : 'error'}).`, ...(known && e.status ? { status: e.status } : {}) };
}
