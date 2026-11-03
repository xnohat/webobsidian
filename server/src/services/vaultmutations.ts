import { AsyncLocalStorage } from 'node:async_hooks';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const queues = new Map<string, Promise<void>>();
const activeMutation = new AsyncLocalStorage<{ root: string; active: boolean }>();

/** Resolve aliases, including when the vault has not been created yet. */
export async function canonicalMutationRoot(root: string): Promise<string> {
  let probe = path.resolve(root);
  const missing: string[] = [];
  for (;;) {
    try {
      const resolved = path.join(await fs.realpath(probe), ...missing);
      return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(probe);
      if (parent === probe) throw error;
      missing.unshift(path.basename(probe));
      probe = parent;
    }
  }
}

/** One in-process mutation at a time per canonical vault root. Reads stay parallel. */
export async function withVaultMutation<T>(root: string, action: () => Promise<T>): Promise<T> {
  const key = await canonicalMutationRoot(root);
  const current = activeMutation.getStore();
  if (current?.active && current.root === key) return action();
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => { release = resolve; });
  queues.set(key, turn);
  await previous;
  const context = { root: key, active: true };
  try {
    return await activeMutation.run(context, action);
  } finally {
    context.active = false;
    release();
    if (queues.get(key) === turn) queues.delete(key);
  }
}

/** Small diagnostic for verifying idle queues are released. */
export function pendingVaultMutationQueues(): number { return queues.size; }
