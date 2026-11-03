import { api, type TreeNode } from '../api';
import { useStore } from '../store';
import { getActiveEditor } from '../activeEditor';
import { themedPopupHost } from '../theme';
import { UnsupportedPluginApiError } from './diagnostics';
import { registerPluginCommand, registerProcessor } from './registry';
export class Events {
    private handlers = new Map<string, Set<Function>>();
    on(name: string, cb: Function, ctx?: unknown) { const fn = Object.assign((...args: unknown[]) => cb.apply(ctx, args), { original: cb }); let set = this.handlers.get(name); if (!set)
        this.handlers.set(name, set = new Set()); set.add(fn); return { off: () => set!.delete(fn) }; }
    offref(ref: {
        off: () => void;
    }) { ref.off(); }
    off(name: string, cb: Function) { const set = this.handlers.get(name); if (set)
        for (const fn of set)
            if (fn === cb || (fn as Function & {
                original?: Function;
            }).original === cb)
                set.delete(fn); }
    trigger(name: string, ...args: unknown[]) { for (const cb of this.handlers.get(name) ?? [])
        cb(...args); }
}
export class Component {
    private disposers: (() => void)[] = [];
    private dead = false;
    register(fn: () => void) { if (this.dead)
        fn();
    else
        this.disposers.push(fn); }
    registerEvent(ref: {
        off?: () => void;
    }) { if (!ref?.off)
        throw new UnsupportedPluginApiError('event reference'); this.register(() => ref.off!()); }
    registerInterval(id: number) { this.register(() => window.clearInterval(id)); return id; }
    addChild<T extends Component>(child: T) { this.register(() => child.unload()); return child; }
    load() { }
    unload() { if (this.dead)
        return; this.dead = true; for (const fn of this.disposers.splice(0).reverse())
        try {
            fn();
        }
        catch { /* finish all cleanup */ } }
}
export class TAbstractFile {
    constructor(public path: string, public name: string) { }
    parent: TFolder | null = null;
}
export class TFile extends TAbstractFile {
    stat = { ctime: 0, mtime: 0, size: 0 };
    get basename() { return this.name.replace(/\.[^.]+$/, ''); }
    get extension() { return this.name.includes('.') ? this.name.split('.').pop()! : ''; }
}
export class TFolder extends TAbstractFile {
    children: TAbstractFile[] = [];
}
export class Notice {
    private el: HTMLElement;
    constructor(message: string, timeout = 4000) { this.el = document.createElement('div'); this.el.className = 'toast'; this.setMessage(message); themedPopupHost().appendChild(this.el); if (timeout > 0)
        setTimeout(() => this.hide(), timeout); }
    setMessage(message: string) { this.el.textContent = String(message); }
    hide() { this.el.remove(); }
}
export interface RuntimeContext {
    id: string;
    vaultIdentity: string;
    draftScope: string;
    active(): boolean;
    fail?: (error: unknown, stage: 'processor' | 'command') => void;
}
export function createObsidianModule(context: RuntimeContext) {
    const check = () => { if (!context.active())
        throw new Error('Plugin is no longer active'); };
    const versions = new WeakMap<TFile, string>();
    function abstract(node: TreeNode, parent: TFolder | null = null): TAbstractFile { const f = node.type === 'folder' ? new TFolder(node.path, node.name) : new TFile(node.path, node.name); f.parent = parent; if (f instanceof TFolder)
        f.children = (node.children ?? []).map(n => abstract(n, f));
    else if (f instanceof TFile)
        f.stat = { size: node.size ?? 0, mtime: node.mtime ?? 0, ctime: node.ctime ?? 0 }; return f; }
    function files() { const all: TAbstractFile[] = []; const visit = (f: TAbstractFile) => { all.push(f); if (f instanceof TFolder)
        f.children.forEach(visit); }; const tree = useStore.getState().tree; if (tree)
        visit(abstract(tree)); return all; }
    class Vault extends Events {
        getName() { return 'WebObsidian'; }
        getFiles() { return files().filter((x): x is TFile => x instanceof TFile); }
        getMarkdownFiles() { return this.getFiles().filter(x => /^(md|markdown)$/i.test(x.extension)); }
        getAbstractFileByPath(path: string) { return files().find(x => x.path === path) ?? null; }
        getRoot() { return files().find(x => x instanceof TFolder) ?? null; }
        async read(file: TFile) { check(); const r = await api.read(file.path, context.draftScope); check(); if (!r.version)
            throw new Error('A file version is required'); const previous = versions.get(file); if (previous !== undefined && previous !== r.version)
            throw new UnsupportedPluginApiError('File changed since this TFile was read; resolve the conflict or read a new TFile'); versions.set(file, r.version); return r.content; }
        async cachedRead(file: TFile) { return this.read(file); }
        async modify(file: TFile, content: string) { check(); const version = versions.get(file); if (version === undefined)
            throw new UnsupportedPluginApiError('modify requires reading this TFile first'); const r = await api.write(file.path, content, version, context.draftScope); check(); if (r.version)
            versions.set(file, r.version); await useStore.getState().loadTree(); }
        async create(path: string, content: string) { check(); const r = await api.write(path, content, '', context.draftScope); check(); const file = new TFile(path, path.split('/').pop()!); if (r.version)
            versions.set(file, r.version); await useStore.getState().loadTree(); return file; }
        delete() { throw new UnsupportedPluginApiError('vault.delete'); }
        rename() { throw new UnsupportedPluginApiError('vault.rename'); }
        get adapter(): never { throw new UnsupportedPluginApiError('vault.adapter'); }
    }
    class Workspace extends Events {
        layoutReady = true;
        getActiveFile() { const p = useStore.getState().activePath; return p ? app.vault.getAbstractFileByPath(p) : null; }
        onLayoutReady(cb: () => void) { check(); cb(); }
        getLeaf(): never { throw new UnsupportedPluginApiError('workspace.getLeaf'); }
        getActiveViewOfType(): never { throw new UnsupportedPluginApiError('workspace.getActiveViewOfType'); }
    }
    class App {
        vault = new Vault();
        workspace = new Workspace();
        metadataCache = new Proxy(new Events(), { get(target, key) { if (key in target)
                return Reflect.get(target, key); throw new UnsupportedPluginApiError(`metadataCache.${String(key)}`); } });
    }
    const app = new App();
    const modals = new Set<{
        close(): void;
    }>();
    class Plugin extends Component {
        app: App;
        manifest: any;
        private unloaded = false;
        constructor(app: App, manifest: any) { super(); this.app = app; this.manifest = manifest; }
        addCommand(cmd: any) { check(); if (!cmd?.id || !cmd?.name)
            throw new UnsupportedPluginApiError('command id/name'); const run = async () => { try {
            check();
            if (cmd.checkCallback)
                return await cmd.checkCallback(false);
            if (cmd.callback)
                return await cmd.callback();
            throw new UnsupportedPluginApiError('editor command callbacks');
        }
        catch (error) {
            if (context.active())
                context.fail?.(error, 'command');
        } }; this.register(registerPluginCommand({ id: `${context.id}:${cmd.id}`, title: `${this.manifest.name ?? context.id}: ${cmd.name}`, run })); }
        addRibbonIcon(icon: string, title: string, cb: (e: MouseEvent) => void) { check(); const button = document.createElement('button'); button.title = title; button.textContent = icon; button.onclick = e => { if (context.active())
            cb(e); }; const host = document.querySelector('.ribbon'); if (!host)
            throw new UnsupportedPluginApiError('ribbon host'); host.appendChild(button); this.register(() => button.remove()); return button; }
        addStatusBarItem() { check(); const el = document.createElement('span'); el.className = 'plugin-status'; const host = document.querySelector('.status-bar'); if (!host)
            throw new UnsupportedPluginApiError('status bar host'); host.appendChild(el); this.register(() => el.remove()); return el; }
        addSettingTab() { throw new UnsupportedPluginApiError('plugin settings tabs'); }
        registerView() { throw new UnsupportedPluginApiError('workspace views'); }
        registerEditorExtension() { throw new UnsupportedPluginApiError('CodeMirror editor extensions'); }
        async loadData() { check(); const r = await api.pluginData(context.id, context.vaultIdentity); check(); return r.data; }
        async saveData(data: unknown) { check(); await api.savePluginData(context.id, data, context.vaultIdentity); check(); }
        registerMarkdownPostProcessor(fn: any) { check(); this.register(registerProcessor(fn, error => { if (context.active())
            context.fail?.(error, 'processor'); })); }
        registerMarkdownCodeBlockProcessor(language: string, fn: any) { this.registerMarkdownPostProcessor(async (el: HTMLElement, ctx: unknown) => { for (const code of el.querySelectorAll<HTMLElement>(`code.language-${CSS.escape(language)}`)) {
            const pre = code.parentElement!;
            const replacement = document.createElement('div');
            pre.replaceWith(replacement);
            await fn(code.textContent ?? '', replacement, ctx);
        } }); }
        onload(): void | Promise<void> { }
        onunload(): void | Promise<void> { }
        override async unload() { if (this.unloaded)
            return; this.unloaded = true; try {
            await this.onunload();
        }
        finally {
            super.unload();
        } }
    }
    class Modal {
        containerEl = document.createElement('div');
        contentEl = document.createElement('div');
        titleEl = document.createElement('h2');
        constructor(public app: App) { this.containerEl.append(this.titleEl, this.contentEl); }
        open() { check(); modals.add(this); themedPopupHost().appendChild(this.containerEl); this.onOpen(); }
        close() { modals.delete(this); try {
            this.onClose();
        }
        finally {
            this.containerEl.remove();
        } }
        onOpen() { }
        onClose() { }
    }
    class PluginSettingTab {
        containerEl = document.createElement('div');
        constructor(public app: App, public plugin: Plugin) { }
        display() { }
        hide() { }
    }
    class Setting {
        settingEl: HTMLElement;
        infoEl: HTMLElement;
        nameEl: HTMLElement;
        descEl: HTMLElement;
        controlEl: HTMLElement;
        constructor(container: HTMLElement) { this.settingEl = document.createElement('div'); this.infoEl = document.createElement('div'); this.nameEl = document.createElement('div'); this.descEl = document.createElement('div'); this.controlEl = document.createElement('div'); this.settingEl.className = 'setting-row'; this.infoEl.append(this.nameEl, this.descEl); this.settingEl.append(this.infoEl, this.controlEl); container.appendChild(this.settingEl); }
        setName(s: string) { this.nameEl.textContent = s; return this; }
        setDesc(s: string) { this.descEl.textContent = s; return this; }
        private input(kind: 'text' | 'checkbox' | 'button' | 'select', cb: Function) { const el = kind === 'select' ? document.createElement('select') : document.createElement('input'); if (el instanceof HTMLInputElement)
            el.type = kind; this.controlEl.appendChild(el); const component: any = { inputEl: el, selectEl: el, buttonEl: el, setValue(v: any) { if (kind === 'checkbox')
                (el as HTMLInputElement).checked = !!v;
            else
                el.value = String(v); return component; }, getValue() { return kind === 'checkbox' ? (el as HTMLInputElement).checked : el.value; }, onChange(fn: Function) { el.addEventListener('change', () => fn(component.getValue())); return component; }, setPlaceholder(v: string) { el.setAttribute('placeholder', v); return component; }, setButtonText(v: string) { el.value = v; return component; }, onClick(fn: Function) { el.addEventListener('click', e => fn(e)); return component; }, setDisabled(v: boolean) { el.disabled = v; return component; }, setCta() { el.classList.add('mod-cta'); return component; }, addOption(value: string, label: string) { if (el instanceof HTMLSelectElement)
                el.add(new Option(label, value)); return component; } }; cb(component); return this; }
        addText(cb: Function) { return this.input('text', cb); }
        addToggle(cb: Function) { return this.input('checkbox', cb); }
        addButton(cb: Function) { return this.input('button', cb); }
        addDropdown(cb: Function) { return this.input('select', cb); }
    }
    const unsubscribe = useStore.subscribe((next, previous) => { if (next.activePath !== previous.activePath && context.active())
        app.workspace.trigger('file-open', app.workspace.getActiveFile()); });
    const fsEvent = (event: Event) => { if (!context.active())
        return; const detail = (event as CustomEvent).detail; const file = app.vault.getAbstractFileByPath(detail?.path ?? ''); const name = detail?.event === 'change' ? 'modify' : detail?.event === 'add' ? 'create' : detail?.event === 'unlink' ? 'delete' : null; if (name)
        app.vault.trigger(name, file); };
    window.addEventListener('wo-fs', fsEvent);
    const module = { __esModule: true, App, Plugin, Component, Events, Notice, TAbstractFile, TFile, TFolder, Vault, Workspace, Setting, Modal, PluginSettingTab, normalizePath: (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/'), MarkdownRenderChild: Component };
    for (const name of ['FuzzySuggestModal', 'SuggestModal', 'Scope', 'MarkdownView', 'ItemView', 'Menu', 'MarkdownRenderer', 'Platform', 'moment'])
        Object.defineProperty(module, name, { enumerable: true, get() { throw new UnsupportedPluginApiError(`obsidian.${name}`); } });
    return { app, module: new Proxy(module, { get(target, key) { if (typeof key === 'symbol')
                return undefined; if (key in target)
                return Reflect.get(target, key); throw new UnsupportedPluginApiError(`obsidian.${String(key)}`); } }), dispose() { unsubscribe(); window.removeEventListener('wo-fs', fsEvent); for (const modal of modals)
            try {
                modal.close();
            }
            catch { } modals.clear(); } };
}
