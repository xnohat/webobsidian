import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getDraftScope } from './draftScopes.js';
describe('draft scopes', () => {
    it('persists isolated ids and serializes concurrent registry updates', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'webo-scopes-'));
        try {
            const [a, b] = await Promise.all([getDraftScope(path.join(dir, 'a'), dir), getDraftScope(path.join(dir, 'b'), dir)]);
            expect(a).not.toBe(b);
            expect(await getDraftScope(path.join(dir, 'a'), dir)).toBe(a);
        }
        finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
