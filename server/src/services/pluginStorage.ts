import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getSettings } from './settings.js';
export function pluginError(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
export function assertPluginId(id: string): string {
    if (!/^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,159}$/.test(id) || id === '.' || id === '..')
        pluginError(400, 'Invalid plugin id');
    return id;
}
export const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export interface PluginContext {
    root: string;
    vaultIdentity: string;
    base: string;
    enabled: string[];
    allowedRoots: string[];
    settingsRoot: string;
}
export async function pluginContext(expected?: string): Promise<PluginContext> {
    const s = await getSettings();
    const root = await fs.realpath(s.vault.path);
    const canonical = process.platform === 'win32' ? root.toLowerCase() : root;
    const vaultIdentity = digest(canonical);
    if (expected !== undefined && expected !== vaultIdentity)
        pluginError(409, 'PLUGIN_VAULT_CHANGED');
    return { root, settingsRoot: path.resolve(s.vault.path), vaultIdentity, base: path.join(config.dataDir, 'plugins', vaultIdentity), enabled: [...s.plugins.enabled], allowedRoots: [root, ...s.vault.allowedRoots] };
}
export async function storagePath(context: PluginContext, ...segments: string[]): Promise<string> {
    await fs.mkdir(config.dataDir, { recursive: true });
    const root = await fs.realpath(config.dataDir);
    const rel = path.relative(config.dataDir, path.join(context.base, ...segments));
    if (rel.startsWith('..') || path.isAbsolute(rel))
        pluginError(400, 'Invalid plugin storage path');
    let current = root;
    for (const part of rel.split(path.sep)) {
        current = path.join(current, part);
        try {
            if ((await fs.lstat(current)).isSymbolicLink())
                pluginError(400, 'Plugin storage symlink is not allowed');
        }
        catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
                throw e;
        }
    }
    return current;
}
export async function atomicWrite(file: string, value: string): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = file + '.' + randomUUID() + '.tmp';
    try {
        const h = await fs.open(tmp, 'wx');
        try {
            await h.writeFile(value);
            await h.sync();
        }
        finally {
            await h.close();
        }
        await fs.rename(tmp, file);
    }
    finally {
        await fs.unlink(tmp).catch(() => { });
    }
}
export async function readBounded(file: string, limit: number): Promise<string> {
    const h = await fs.open(file, 'r');
    try {
        const before = await h.stat();
        if (!before.isFile() || before.size > limit)
            pluginError(413, 'Plugin asset exceeds allowed size');
        const chunks: Buffer[] = [];
        let size = 0;
        for (;;) {
            const buffer = Buffer.alloc(Math.min(65536, limit - size + 1));
            const { bytesRead } = await h.read(buffer, 0, buffer.length, null);
            if (!bytesRead)
                break;
            size += bytesRead;
            if (size > limit)
                pluginError(413, 'Plugin asset exceeds allowed size');
            chunks.push(buffer.subarray(0, bytesRead));
        }
        const after = await h.stat();
        if (size !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs)
            pluginError(409, 'PLUGIN_ASSET_CHANGED');
        return Buffer.concat(chunks).toString('utf8');
    }
    finally {
        await h.close();
    }
}
const queues = new Map<string, Promise<unknown>>();
export async function serializePlugin<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    const work = previous.catch(() => { }).then(action);
    queues.set(key, work);
    try {
        return await work;
    }
    finally {
        if (queues.get(key) === work)
            queues.delete(key);
    }
}
