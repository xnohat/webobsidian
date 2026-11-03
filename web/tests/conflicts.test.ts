import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConflictResult, canDiff } from '../src/lib/conflicts';
test('Canvas conflicts require valid schema; large text uses bounded fallback', () => {
    assert.throws(() => validateConflictResult('board.canvas', 'not json'));
    assert.throws(() => validateConflictResult('board.canvas', '{}'));
    assert.doesNotThrow(() => validateConflictResult('board.canvas', '{"nodes":[],"edges":[]}'));
    assert.doesNotThrow(() => validateConflictResult('a.md', 'any text'));
    assert.equal(canDiff('a'.repeat(1024 * 1024 + 1)), false);
    assert.equal(canDiff('a\n'.repeat(20001)), false);
});
