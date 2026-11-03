import { useSyncExternalStore } from 'react';
export interface PluginCommand {
    id: string;
    title: string;
    run: () => void | Promise<void>;
}
export interface MarkdownProcessor {
    onError?: (error: unknown) => void;
    fn: (el: HTMLElement, ctx: {
        sourcePath: string;
        getSectionInfo: () => null;
        addChild: (c: {
            unload?: () => void;
        }) => void;
    }) => unknown;
}
const commands = new Map<string, PluginCommand>(), processors = new Set<MarkdownProcessor>();
const listeners = new Set<() => void>();
let revision = 0;
function emit() { revision++; for (const fn of listeners)
    fn(); }
export function registerPluginCommand(command: PluginCommand) { commands.set(command.id, command); emit(); return () => { if (commands.get(command.id) === command) {
    commands.delete(command.id);
    emit();
} }; }
export function pluginCommands() { return [...commands.values()]; }
export function usePluginRevision() { return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => revision, () => 0); }
export function registerProcessor(fn: MarkdownProcessor['fn'], onError?: MarkdownProcessor['onError']) { const p = { fn, onError }; processors.add(p); emit(); return () => { processors.delete(p); emit(); }; }
export function processPluginMarkdown(el: HTMLElement, sourcePath: string) {
    let live = true;
    const children: {
        unload?: () => void;
    }[] = [];
    for (const p of processors)
        Promise.resolve().then(() => { if (live && processors.has(p))
            return p.fn(el, { sourcePath, getSectionInfo: () => null, addChild: c => { children.push(c); } }); }).catch(error => { processors.delete(p); p.onError?.(error); });
    return () => { live = false; for (const c of children)
        c.unload?.(); };
}
