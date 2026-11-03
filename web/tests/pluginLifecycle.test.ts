import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginManager } from '../src/lib/plugins/manager';
import { failureFor, PluginLoadError } from '../src/lib/plugins/diagnostics';
test('plugin manager deduplicates loads and disposes late completion after disable', async () => {
    let release!: () => void, loads = 0, disposed = 0;
    const gate = new Promise<void>(r => release = r);
    const manager = new PluginManager(async (_p, ctx) => { loads++; const h = { unload() { disposed++; } }; ctx.own(h); await gate; return h; });
    const p = { id: 'p', enabled: true, contentVersion: 'one' };
    const a = manager.reconcile('vault', [p]);
    const b = manager.reconcile('vault', [p]);
    await Promise.resolve();
    await manager.reconcile('vault', []);
    release();
    await Promise.all([a, b]);
    assert.equal(loads, 1);
    assert.equal(disposed, 1);
    assert.equal(manager.getStates().find(x => x.id === 'p')?.state, 'disabled');
});
test('failed startup cleans owned resources and catalog errors remain visible', async () => {
    let disposed = 0;
    const m = new PluginManager(async (_p, c) => { c.own({ unload() { disposed++; } }); throw new Error('private body text'); });
    await m.reconcile('v', [{ id: 'p', enabled: true, contentVersion: '1' }]);
    assert.equal(disposed, 1);
    assert.equal(m.getStates()[0].state, 'failed');
    assert.ok(!m.getStates()[0].failure?.message.includes('private body'));
});
test('diagnostics distinguish fetch status, CSP, modules and syntax', () => {
    assert.equal(failureFor('p', 'fetch', new PluginLoadError('http', 'HTTP 401', 401)).kind, 'http');
    assert.equal(failureFor('p', 'compile', new EvalError('unsafe-eval')).kind, 'csp');
    assert.equal(failureFor('p', 'compile', new SyntaxError('bad')).kind, 'syntax');
});
test('older vault cleanup cannot erase state loaded for a newer vault', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => release = r);
    const m = new PluginManager(async (p, c) => { const h = { async unload() { if (p.id === 'old')
            await gate; } }; c.own(h); return h; });
    await m.reconcile('one', [{ id: 'old', enabled: true, contentVersion: '1' }]);
    const oldSwitch = m.reconcile('two', [{ id: 'middle', enabled: true, contentVersion: '1' }]);
    await m.reconcile('three', [{ id: 'latest', enabled: true, contentVersion: '1' }]);
    release();
    await oldSwitch;
    assert.equal(m.getStates().find(x => x.id === 'latest')?.state, 'loaded');
    assert.ok(!m.getStates().some(x => x.id === 'middle'));
});
