import { describe, it, expect, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withVaultMutation, pendingVaultMutationQueues } from './vaultmutations.js';

describe('vault mutation queue', () => {
  it('serializes operations, recovers after rejection and removes settled queues', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-queue-'));
    try {
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => { release = resolve; });
      let entered!: () => void;
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const first = withVaultMutation(root, async () => { entered(); await blocked; throw new Error('controlled'); });
      const rejected = expect(first).rejects.toThrow('controlled');
      await started;
      const next = vi.fn(async () => 'next');
      const second = withVaultMutation(root, next);
      expect(next).not.toHaveBeenCalled();
      expect(pendingVaultMutationQueues()).toBe(1);
      release();
      await rejected;
      expect(await second).toBe('next');
      expect(pendingVaultMutationQueues()).toBe(0);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it('reuses an active queue for nested actions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-queue-'));
    try {
      expect(await withVaultMutation(root, () => withVaultMutation(root, async () => 'nested'))).toBe('nested');
      expect(pendingVaultMutationQueues()).toBe(0);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it('uses the same queue for canonical root aliases', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-queue-'));
    const alias = `${root}-alias`;
    try {
      await fs.symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => { release = resolve; });
      let entered!: () => void;
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const order: string[] = [];
      const first = withVaultMutation(root, async () => { entered(); await blocked; order.push('first'); });
      await started;
      const second = withVaultMutation(alias, async () => { order.push('second'); });
      release();
      await Promise.all([first, second]);
      expect(order).toEqual(['first', 'second']);
      expect(pendingVaultMutationQueues()).toBe(0);
    } finally {
      await fs.rm(alias, { force: true, recursive: true });
      await fs.rm(root, { force: true, recursive: true });
    }
  });
});
