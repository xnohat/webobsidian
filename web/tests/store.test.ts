import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { api } from '../src/lib/api';
import { GRAPH_PATH, useStore } from '../src/lib/store';

// Workspace persistence uses browser timers; run them deterministically in Node.
Object.defineProperty(globalThis, 'window', {
  value: {
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  },
  configurable: true,
});

const state = () => useStore.getState();
const paths = () => state().tabs.map((t) => t.path);

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  useStore.setState(useStore.getInitialState(), true);
  mock.method(api, 'read', async (path: string) => ({ content: `# ${path}` }));
  mock.method(api, 'write', async () => ({ ok: true }));
  mock.method(api, 'tree', async () => ({ name: '', path: '', type: 'folder', children: [] }));
  mock.method(api, 'getUiState', async () => ({}));
  mock.method(api, 'putUiState', async () => ({ ok: true }));
});

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
});

test('browsing many notes reuses one preview tab', async () => {
  for (let i = 0; i < 25; i++) await state().openFile(`Note ${i}.md`);
  assert.deepEqual(paths(), ['Note 24.md']);
  assert.equal(state().tabs[0].preview, true);
  assert.equal(state().content, '# Note 24.md');
});

test('keeping a preview open preserves it and reuses the next preview in place', async () => {
  await state().openFile('Keep.md');
  state().keepTab('Keep.md');
  await state().openFile('Preview.md');
  await state().openGraph();
  await state().openFile('Next.md');
  assert.deepEqual(paths(), ['Keep.md', 'Next.md', GRAPH_PATH]);
  assert.equal(state().tabs[0].preview, false);
  assert.equal(state().tabs[1].preview, true);
  assert.equal(state().tabs[2].preview, undefined);

  await state().openFile('Keep.md');
  assert.deepEqual(paths(), ['Keep.md', 'Next.md', GRAPH_PATH]);
  assert.equal(state().tabs[0].preview, false);
  assert.equal(state().activePath, 'Keep.md');
});

test('editing a preview keeps it open even after saving', async () => {
  const writes = mock.method(api, 'write', async () => ({ ok: true }));
  await state().openFile('Edited.md');
  state().setContent('Local edits');
  assert.equal(state().tabs[0].preview, false);
  await state().openFile('Next.md');
  assert.deepEqual(writes.mock.calls[0].arguments, ['Edited.md', 'Local edits']);
  assert.deepEqual(paths(), ['Edited.md', 'Next.md']);
  assert.equal(state().dirty, false);
});

test('creating a note opens it permanently without replacing an existing preview', async () => {
  await state().openFile('Preview.md');
  await state().createNote('New.md', '# New');
  assert.deepEqual(paths(), ['Preview.md', 'New.md']);
  assert.equal(state().tabs[1].preview, false);
});

test('opening a missing note leaves the current preview intact', async () => {
  await state().openFile('Preview.md');
  mock.method(api, 'read', async () => { throw new Error('Not found'); });
  await assert.rejects(state().openFile('Missing.md'), /Not found/);
  assert.deepEqual(paths(), ['Preview.md']);
  assert.equal(state().activePath, 'Preview.md');
  assert.equal(state().content, '# Preview.md');
});

test('out-of-order reads cannot replace the most recently selected note', async () => {
  let finishSlow!: (value: { content: string }) => void;
  mock.method(api, 'read', (path: string) => path === 'Slow.md'
    ? new Promise<{ content: string }>((resolve) => { finishSlow = resolve; })
    : Promise.resolve({ content: '# Fast' }));
  const slow = state().openFile('Slow.md');
  await state().openFile('Fast.md');
  finishSlow({ content: '# Slow' });
  await slow;
  assert.deepEqual(paths(), ['Fast.md']);
  assert.equal(state().activePath, 'Fast.md');
  assert.equal(state().content, '# Fast');
});

test('opening Graph view cancels an older pending note selection', async () => {
  let finishRead!: (value: { content: string }) => void;
  mock.method(api, 'read', () => new Promise<{ content: string }>((resolve) => { finishRead = resolve; }));
  const pending = state().openFile('Slow.md');
  await state().openGraph();
  finishRead({ content: '# Slow' });
  await pending;
  assert.deepEqual(paths(), [GRAPH_PATH]);
  assert.equal(state().activePath, GRAPH_PATH);
});

test('edits made while the next preview loads are saved and kept open', async () => {
  await state().openFile('Edited.md');
  let finishRead!: (value: { content: string }) => void;
  mock.method(api, 'read', () => new Promise<{ content: string }>((resolve) => { finishRead = resolve; }));
  const writes = mock.method(api, 'write', async () => ({ ok: true }));
  const pending = state().openFile('Next.md');
  state().setContent('Typed while loading');
  finishRead({ content: '# Next' });
  await pending;
  assert.deepEqual(writes.mock.calls[0].arguments, ['Edited.md', 'Typed while loading']);
  assert.deepEqual(paths(), ['Edited.md', 'Next.md']);
  assert.equal(state().tabs[0].preview, false);
});

test('back and forward navigation reuse the preview without adding tabs', async () => {
  await state().openFile('First.md');
  await state().openFile('Second.md');
  state().goBack();
  await setImmediate();
  assert.deepEqual(paths(), ['First.md']);
  assert.equal(state().histIndex, 0);
  state().goForward();
  await setImmediate();
  assert.deepEqual(paths(), ['Second.md']);
  assert.deepEqual(state().history, ['First.md', 'Second.md']);
  assert.equal(state().histIndex, 1);
});

test('closing a preview allows a fresh preview without disturbing permanent tabs', async () => {
  await state().openFile('Keep.md', { preview: false });
  await state().openFile('Preview.md');
  state().closeTab('Preview.md');
  await state().openFile('Next.md');
  assert.deepEqual(paths(), ['Keep.md', 'Next.md']);
  assert.equal(state().tabs[0].preview, false);
  assert.equal(state().tabs[1].preview, true);
});

test('workspace reload preserves preview state and treats legacy tabs as permanent', async () => {
  const saved = {
    tabs: [
      { path: 'Legacy.md', title: 'Legacy.md' },
      { path: 'Preview.md', title: 'Preview.md', preview: true },
    ],
    activePath: 'Preview.md',
  };
  mock.method(api, 'getUiState', async () => saved);
  const writes = mock.method(api, 'putUiState', async () => ({ ok: true }));
  await state().loadUiState();
  await state().openFile('Next.md');
  assert.deepEqual(paths(), ['Legacy.md', 'Next.md']);
  assert.equal(state().tabs[0].preview, undefined);
  assert.equal(state().tabs[1].preview, true);
  mock.timers.tick(500);
  assert.deepEqual(writes.mock.calls.at(-1)!.arguments[0].tabs, state().tabs);

  state().keepTab('Next.md');
  mock.timers.tick(500);
  assert.equal(writes.mock.calls.at(-1)!.arguments[0].tabs[1].preview, false);
});
