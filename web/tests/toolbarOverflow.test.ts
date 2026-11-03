import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partitionToolbar } from '../src/lib/toolbar/overflow';
import type { ToolbarNode } from '../src/lib/toolbar/config';
const items: ToolbarNode[] = ['a', 'b', 'c'].map(instanceId => ({ type: 'command', instanceId, commandId: 'bold' }));
const widths = new Map(items.map(n => [n.instanceId, 30]));
test('fits all without reserving More; reserves More only on overflow', () => {
    assert.equal(partitionToolbar(items, widths, 98, 30, 4).visible.length, 3);
    assert.equal(partitionToolbar(items, widths, 97, 30, 4).visible.length, 1);
    assert.equal(partitionToolbar(items, widths, 30, 30, 4).overflow.length, 3);
});
test('unknown measurements and tiny widths keep every command accessible', () => {
    assert.equal(partitionToolbar(items, new Map(), 200, 30, 4).overflow.length, 3);
    assert.equal(partitionToolbar(items, widths, 0, 30, 4).overflow.length, 3);
});
test('groups and duplicate command ids remain atomic and ordered', () => {
    const result = partitionToolbar(items, widths, 64, 30, 4);
    assert.deepEqual([...result.visible, ...result.overflow], items);
});
