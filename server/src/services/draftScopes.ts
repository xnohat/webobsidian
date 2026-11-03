import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { canonicalMutationRoot, withVaultMutation } from './vaultmutations.js';
/** One durable, opaque identity per canonical vault, scoped to this installation. */
export async function getDraftScope(root: string, dataDir = config.dataDir): Promise<string> {
    return withVaultMutation(dataDir, async () => {
        const canonical = await canonicalMutationRoot(root), file = path.join(dataDir, 'draft-scopes.json');
        let registry: Record<string, string> = {};
        try {
            registry = JSON.parse(await fs.readFile(file, 'utf8'));
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error;
        }
        if (typeof registry[canonical] === 'string')
            return registry[canonical];
        const id = randomUUID();
        registry[canonical] = id;
        await fs.mkdir(dataDir, { recursive: true });
        const tmp = file + '.tmp-' + randomUUID();
        try {
            await fs.writeFile(tmp, JSON.stringify(registry), { flag: 'wx', mode: 0o600 });
            await fs.rename(tmp, file);
        }
        finally {
            await fs.rm(tmp, { force: true });
        }
        return id;
    });
}
