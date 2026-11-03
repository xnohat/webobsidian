import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { ApiError, api } from '../src/lib/api';
import { useStore, resetDraftScope } from '../src/lib/store';

Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
  clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
} });
const state = () => useStore.getState();
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  resetDraftScope();
  mock.method(api,'draftScope',async()=>({scopeId:'test-scope'}));
  useStore.setState(useStore.getInitialState(), true);
  mock.method(api, 'read', async (path: string) => ({ version:'v1', content: `original ${path}` }));
  mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  mock.method(api, 'rename', async () => ({ ok: true, version:'v1' }));
  mock.method(api, 'remove', async () => ({ ok: true, version:'v1' }));
});
afterEach(() => { mock.restoreAll(); mock.timers.reset(); });

for (const path of ['note.md', 'board.canvas']) {
  test(`closing dirty ${path} saves immediately before removing the tab`, async () => {
    await state().openFile(path);
    state().setContent('latest');
    const gate = deferred();
    const writes = mock.method(api, 'write', async () => { await gate.promise; return { ok: true, version:'v1' }; });
    const closing = state().closeTab(path);
    await setImmediate();
    assert.equal(state().activePath, path);
    assert.equal(state().content, 'latest');
    gate.resolve();
    assert.equal(await closing, true);
    assert.deepEqual(writes.mock.calls[0].arguments, [path, 'latest', 'v1','test-scope']);
    assert.deepEqual(state().tabs, []);
  });
}
for (const error of [new ApiError('unauthorized', 401), new ApiError('locked', 423), new Error('offline')]) {
  test(`failed close preserves text and dirty: ${error.message}`, async () => {
    await state().openFile('note.md');
    state().setContent('unsaved');
    mock.method(api, 'write', async () => { throw error; });
    assert.equal(await state().closeTab('note.md'), false);
    assert.equal(state().content, 'unsaved');
    assert.equal(state().dirty, true);
    assert.equal(state().activePath, 'note.md');
    assert.ok(state().toast);
  });
}
test('concurrent saves and repeated closes serialize and drain edits typed during a request', async () => {
  await state().openFile('note.md');
  state().setContent('first');
  const gates = [deferred(), deferred()];
  let inFlight = 0;
  let maximum = 0;
  let nextWrite = 0;
  const writes = mock.method(api, 'write', async () => {
    maximum = Math.max(maximum, ++inFlight);
    await gates[nextWrite++].promise;
    inFlight--;
    return { ok: true, version:'v1' };
  });
  const saving = state().save();
  await setImmediate();
  state().setContent('second');
  const savingAgain = state().save();
  const closing = state().closeTab('note.md');
  const closingAgain = state().closeTab('note.md');
  gates[0].resolve();
  await setImmediate();
  assert.equal(state().content, 'second');
  gates[1].resolve();
  await Promise.all([saving, savingAgain]);
  assert.deepEqual(await Promise.all([closing, closingAgain]), [true, true]);
  assert.equal(maximum, 1);
  assert.deepEqual(writes.mock.calls.map((call) => call.arguments[1]), ['first', 'second']);
});
test('closing inactive and several tabs preserves the current dirty draft', async () => {
  await state().openFile('a.md', { preview: false });
  await state().openFile('b.md', { preview: false });
  await state().openFile('c.md', { preview: false });
  state().setContent('C edits');
  assert.equal(await state().closeTab('a.md'), true);
  assert.equal(state().content, 'C edits');
  assert.equal(state().dirty, true);
  for (const tab of [...state().tabs]) assert.equal(await state().closeTab(tab.path), true);
  assert.deepEqual(state().tabs, []);
});
test('switching during a save drains the old draft and leaves the new draft intact', async () => {
  await state().openFile('a.md');
  state().setContent('A');
  const gate = deferred();
  mock.method(api, 'write', async () => { await gate.promise; return { ok: true, version:'v1' }; });
  const saving = state().save();
  const opening = state().openFile('b.md');
  gate.resolve();
  await opening;
  state().setContent('B');
  await saving;
  assert.equal(state().activePath, 'b.md');
  assert.equal(state().content, 'B');
  assert.equal(state().dirty, true);
});
test('rename saves before changing the path and remaps folder descendants and split pane', async () => {
  await state().openFile('dir/a.md', { preview: false });
  await state().openFile('dir/b.md', { preview: false });
  useStore.setState({ splitPath: 'dir/a.md', splitContent: 'side' });
  state().setContent('B edits');
  const events: string[] = [];
  mock.method(api, 'write', async (path: string) => { events.push(`write:${path}`); return { ok: true, version:'v1' }; });
  mock.method(api, 'rename', async () => { events.push('rename'); return { ok: true, version:'v1' }; });
  await state().renamePath('dir', 'moved');
  assert.deepEqual(events, ['write:dir/b.md', 'rename']);
  assert.deepEqual(state().tabs.map((tab) => tab.path), ['moved/a.md', 'moved/b.md']);
  assert.equal(state().activePath, 'moved/b.md');
  assert.equal(state().splitPath, 'moved/a.md');
  await state().save();
  assert.deepEqual(events, ['write:dir/b.md', 'rename']);
});
test('edits and autosaves during rename use the new path after success', async () => {
  await state().openFile('old.md');
  const gate = deferred();
  mock.method(api, 'rename', async () => { await gate.promise; return { ok: true, version:'v1' }; });
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  const moving = state().renamePath('old.md', 'new.md');
  await setImmediate();
  state().setContent('typed during rename');
  const saving = state().save();
  gate.resolve();
  await Promise.all([moving, saving]);
  assert.deepEqual(writes.mock.calls.map((call) => call.arguments), [['new.md', 'typed during rename','v1','test-scope']]);
});
test('save failure cancels rename and rename failure preserves the original state', async () => {
  await state().openFile('old.md');
  state().setContent('unsaved');
  const renames = mock.method(api, 'rename', async () => { throw new Error('destination_exists'); });
  const writes = mock.method(api, 'write', async () => { throw new Error('offline'); });
  await assert.rejects(state().renamePath('old.md', 'new.md'), /offline/);
  assert.equal(renames.mock.callCount(), 0);
  assert.equal(state().dirty, true);
  writes.mock.restore();
  await assert.rejects(state().renamePath('old.md', 'new.md'), /destination_exists/);
  assert.equal(state().activePath, 'old.md');
  assert.equal(state().content, 'unsaved');
});
test('confirmed deletion drains existing saves and suppresses queued autosaves without recreating the file', async () => {
  await state().openFile('dir/a.md');
  state().setContent('first');
  const saveGate = deferred();
  const deleteGate = deferred();
  const writes = mock.method(api, 'write', async () => { await saveGate.promise; return { ok: true, version:'v1' }; });
  const removes = mock.method(api, 'remove', async () => { await deleteGate.promise; return { ok: true, version:'v1' }; });
  const saving = state().save();
  await setImmediate();
  const deleting = state().deletePath('dir');
  saveGate.resolve();
  await setImmediate();
  assert.equal(removes.mock.callCount(), 1);
  state().setContent('edit during deletion');
  const lateSave = state().save();
  deleteGate.resolve();
  await Promise.all([saving, deleting, lateSave]);
  assert.equal(writes.mock.callCount(), 1);
  assert.deepEqual(state().tabs, []);
  assert.equal(state().dirty, false);
});
test('forgetting a deleted folder removes descendants and split state without writing', async () => {
  await state().openFile('dir/a.md', { preview: false });
  await state().openFile('other.md', { preview: false });
  await state().openFile('dir/b.md', { preview: false });
  useStore.setState({ splitPath: 'dir/a.md', splitContent: 'side' });
  state().setContent('discarded');
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  state().forgetDeletedPath('dir');
  await setImmediate();
  assert.deepEqual(state().tabs.map((tab) => tab.path), ['other.md']);
  assert.equal(state().splitPath, null);
  assert.equal(state().dirty, false);
  assert.equal(writes.mock.callCount(), 0);
});

test('failed deletion preserves edits made while the request is pending', async () => {
  await state().openFile('note.md');
  state().setContent('original edit');
  const gate = deferred();
  mock.method(api, 'remove', async () => { await gate.promise; throw new Error('offline'); });
  const deleting = state().deletePath('note.md');
  const failed = assert.rejects(deleting, /offline/);
  await setImmediate();
  state().setContent('new edit');
  gate.resolve();
  await failed;
  assert.equal(state().activePath, 'note.md');
  assert.equal(state().content, 'new edit');
  assert.equal(state().dirty, true);
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  await state().save();
  assert.deepEqual(writes.mock.calls[0].arguments, ['note.md', 'new edit','v1','test-scope']);
});

test('successful close stays successful when loading the next tab fails', async () => {
  await state().openFile('next.md', { preview: false });
  await state().openFile('current.md', { preview: false });
  state().setContent('saved');
  mock.method(api, 'read', async () => { throw new Error('offline'); });
  assert.equal(await state().closeTab('current.md'), true);
  assert.deepEqual(state().tabs.map((tab) => tab.path), ['next.md']);
  assert.ok(state().toast);
});

for (const view of ['openGraph', 'openTasks'] as const) {
  test(`${view} rechecks the draft after awaiting the save`, async () => {
    await state().openFile('note.md');
    state().setContent('first');
    let edited = false;
    const unsubscribe = useStore.subscribe((next, previous) => {
      if (!edited && previous.dirty && !next.dirty) {
        edited = true;
        queueMicrotask(() => state().setContent('last keystroke'));
      }
    });
    const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
    try {
      await state()[view]();
      assert.deepEqual(writes.mock.calls.map((call) => call.arguments[1]), ['first', 'last keystroke']);
    } finally { unsubscribe(); }
  });
}

for (const path of ['debug.unsupported', 'README']) {
  test(`saving dirty unsupported ${path} reports failure and keeps the draft`, async () => {
    await state().openFile(path);
    state().setContent('keep this draft');
    await assert.rejects(state().save(), /cannot save/i);
    assert.equal(state().dirty, true);
    assert.equal(state().content, 'keep this draft');
    assert.ok(state().toast);
  });
  test(`dirty unsupported ${path} refuses closing without retrying or discarding text`, async () => {
    await state().openFile(path);
    state().setContent('keep this draft');
    let attempts = 0;
    // Bound the old retry loop so this regression reports a failure instead of hanging.
    const saving = mock.method(state(), 'save', async () => {
      if (++attempts > 3) throw new Error('unbounded save retry');
    });
    assert.equal(await state().closeTab(path), false);
    assert.equal(saving.mock.callCount(), 0);
    assert.equal(state().activePath, path);
    assert.equal(state().content, 'keep this draft');
    assert.equal(state().dirty, true);
    assert.ok(state().toast);
  });
}

for (const path of ['image.png', 'report.pdf', 'folder/report.pdf']) {
  test(`clean attachment ${path} can be saved as a no-op and renamed`, async () => {
    await state().openFile(path);
    const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
    const renames = mock.method(api, 'rename', async () => ({ ok: true, version:'v1' }));
    await state().save();
    assert.equal(writes.mock.callCount(), 0);
    const from = path.startsWith('folder/') ? 'folder' : path;
    const to = path.startsWith('folder/') ? 'moved' : `renamed-${path}`;
    await state().renamePath(from, to);
    assert.equal(renames.mock.callCount(), 1);
    assert.equal(state().activePath, path.startsWith('folder/') ? 'moved/report.pdf' : to);
    assert.equal(state().toast, '');
  });
}

test('normal editor sends the version read with its base text',async()=>{
 mock.method(api,'read',async()=>({content:'base',version:'v1'}));
 const write=mock.method(api,'write',async()=>({ok:true,version:'v2'}));
 await state().openFile('versioned.md');state().setContent('mine');await state().save();
 assert.deepEqual(write.mock.calls[0].arguments,['versioned.md','mine','v1','test-scope']);
});

test('restored workspace initializes the version before the first edit',async()=>{
 useStore.setState({tabs:[{path:'restored.md',title:'restored.md'}],activePath:'restored.md'});
 const writes=mock.method(api,'write',async()=>({ok:true,version:'v2'}));
 await state().hydrate();state().setContent('after restart');await state().save();
 assert.deepEqual(writes.mock.calls[0].arguments,['restored.md','after restart','v1','test-scope']);
});

test('reopening a document uses a fresh journal identity after a leftover record',async()=>{
 await state().openFile('reopened.md');const {documentSessions}=await import('../src/lib/store');const previous=documentSessions.get('reopened.md')!.key.writerId;
 await state().openFile('reopened.md');assert.notEqual(documentSessions.get('reopened.md')!.key.writerId,previous);
});

test('ordinary reads are bound to the captured draft scope',async()=>{
 const reads=mock.method(api,'read',async()=>({content:'base',version:'v1'}));await state().openFile('bound.md');assert.deepEqual(reads.mock.calls[0].arguments,['bound.md','test-scope']);
});

test('a scope lookup failure never falls back to an unscoped editor read',async()=>{
 mock.method(api,'draftScope',async()=>{throw Error('scope unavailable')});const reads=mock.method(api,'read',async()=>({content:'base',version:'v1'}));
 await assert.rejects(state().openFile('uncertain.md'),/scope unavailable/);assert.equal(reads.mock.callCount(),0);
});
