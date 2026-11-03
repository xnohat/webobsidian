import { promises as fs } from 'node:fs';
import { assertPluginId, pluginContext, storagePath, readBounded, atomicWrite, serializePlugin, pluginError } from './pluginStorage.js';
export async function readPluginData(id: string, identity?: string): Promise<unknown | null> {
    assertPluginId(id);
    const ctx = await pluginContext(identity);
    try {
        return JSON.parse(await readBounded(await storagePath(ctx, 'data', id + '.json'), 1048576));
    }
    catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT')
            return null;
        throw e;
    }
}
export async function writePluginData(id: string, value: unknown, identity?: string): Promise<void> {
    assertPluginId(id);
    const ctx = await pluginContext(identity);
    const data = JSON.stringify(value);
    if (data === undefined)
        pluginError(400, 'Invalid plugin data');
    if (Buffer.byteLength(data) > 1048576)
        pluginError(413, 'Plugin data exceeds 1 MiB');
    await serializePlugin(ctx.vaultIdentity + ':data:' + id, async () => { await atomicWrite(await storagePath(ctx, 'data', id + '.json'), data); });
}
