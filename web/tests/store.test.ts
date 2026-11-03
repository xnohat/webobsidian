import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { ApiError, api, setUnlock, type TreeNode } from '../src/lib/api';
import { GRAPH_PATH, TASKS_PATH, isViewPath, resetDraftScope, useStore } from '../src/lib/store';
import {getCachedVaultPreferences} from '../src/lib/vaultPreferences';

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

test('PDF links preserve fragments separately from canonical filenames across tab activation',async()=>{
 mock.method(api,'resolve',async()=>({path:'Folder/report#one.pdf'}));
 await state().openWikilink('report%23one.pdf#page=2&selection=0,0,0,6','markdown','Folder/Host.md');
 assert.equal(state().activePath,'Folder/report#one.pdf');
 assert.equal((state().tabs[0] as any).pdfFragment,'page=2&selection=0,0,0,6');
 await state().openFile('other.pdf',{preview:false});await state().openFile('Folder/report#one.pdf');
 assert.equal((state().tabs.find(t=>t.path==='Folder/report#one.pdf') as any).pdfFragment,'page=2&selection=0,0,0,6');
 mock.method(api,'resolveAttachment',async()=>({path:'Folder/report#one.pdf'}));
 await state().openAttachment('report.pdf#page=2&annotation=8R','Folder/Host.md');
 assert.equal((state().tabs.find(t=>t.path==='Folder/report#one.pdf') as any).pdfFragment,'page=2&annotation=8R');
});

test('PDF can open and restore in a split without reading binary bytes as note text',async()=>{
 const reads=(api.read as any).mock.callCount();
 await state().openToSide('Folder/sample.pdf');
 assert.equal(state().splitPath,'Folder/sample.pdf');assert.equal(state().splitContent,'');
 assert.equal((api.read as any).mock.callCount(),reads);
 await state().hydrate();assert.equal(state().splitPath,'Folder/sample.pdf');
 state().closeSplit();assert.equal(state().splitPath,null);
});

test('PDF split navigation preserves a fragment through hydration and clears it on close',async()=>{
 await (state().openToSide as any)('Folder/report#one.pdf','right',{pdfFragment:'page=2&annotation=8R'});
 assert.equal((state() as any).splitPdfFragment,'page=2&annotation=8R');
 await state().hydrate();assert.equal((state() as any).splitPdfFragment,'page=2&annotation=8R');
 state().closeSplit();assert.equal((state() as any).splitPdfFragment,'');
});

test('code viewer reads without a writer, refuses edits and supports split and restore',async()=>{
 const read=mock.method(api,'readCode',async(path:string)=>({kind:'text' as const,path,content:'print(1)',highlightAllowed:true}));
 await state().openFile('a.py');assert.equal(state().codeFileResult?.kind,'text');
 state().setContent('bad');await state().save();assert.equal(state().dirty,false);assert.equal(state().content,'print(1)');
 assert.equal((api.write as any).mock.callCount(),0);
 await state().openToSide('a.py');assert.equal(state().splitCodeFileResult?.kind,'text');
 await state().hydrate();assert.ok(read.mock.callCount()>=3);
});

test('late code reads cannot replace a newer tab',async()=>{
 let finish!:(r:any)=>void;mock.method(api,'readCode',(path:string)=>path==='a.py'?new Promise(r=>{finish=r;}):Promise.resolve({kind:'text',path,content:'B',highlightAllowed:true}));
 const a=state().openFile('a.py');await setImmediate();await state().openFile('b.py');finish({kind:'text',path:'a.py',content:'A',highlightAllowed:true});await a;
 assert.equal(state().activePath,'b.py');assert.equal(state().content,'B');
});

test('renaming viewed code keeps both panes read only',async()=>{
 mock.method(api,'readCode',async(path:string)=>({kind:'text' as const,path,content:'code',highlightAllowed:true}));
 mock.method(api,'rename',async()=>({ok:true}));await state().openFile('a.py');await state().openToSide('a.py');await state().renamePath('a.py','b.py');
 assert.equal(state().codeFileResult?.path,'b.py');assert.equal(state().splitCodeFileResult?.path,'b.py');state().setContent('bad');assert.equal(state().dirty,false);
});

test('code settings do not persist or hide text after a failed save',async()=>{
 await state().openFile('a.md');state().setContent('local text');
 mock.method(api,'write',async()=>{throw new Error('offline');});const put=mock.method(api,'putSettings',async()=>({}));
 await assert.rejects(state().applyCodeFileViewerSettings({...state().codeFileViewer,enabled:false}),/offline/);
 assert.equal(put.mock.callCount(),0);assert.equal(state().content,'local text');assert.equal(state().dirty,true);
});

test('a missing code wikilink never creates a markdown file',async()=>{
 mock.method(api,'resolve',async()=>({path:null}));await state().openWikilink('missing.py');assert.equal((api.write as any).mock.callCount(),0);
});

test('closing a split or switching vault invalidates pending code reads',async()=>{
 let finish!:(r:any)=>void;mock.method(api,'readCode',(path:string)=>new Promise(r=>{finish=r;}));
 const opening=state().openToSide('a.py');state().closeSplit();finish({kind:'text',path:'a.py',content:'stale',highlightAllowed:true});await opening;assert.equal(state().splitPath,null);
 const main=state().openFile('a.py');await setImmediate();resetDraftScope();finish({kind:'text',path:'a.py',content:'stale',highlightAllowed:true});await main;assert.equal(state().activePath,null);
});

test('removing support for a split file closes its preview instead of rendering markdown',async()=>{
 mock.method(api,'readCode',async(path:string)=>({kind:'text' as const,path,content:'# literal code',highlightAllowed:true}));
 await state().openToSide('a.py');useStore.setState({codeFileViewer:{...state().codeFileViewer,enabled:false}});await state().openToSide('a.py');assert.equal(state().splitPath,null);
});

test('passive code refresh preserves an explicit pending main or split navigation',async()=>{
 const result=(path:string)=>({kind:'text' as const,path,content:path,highlightAllowed:true});
 let finish!:(r:any)=>void;mock.method(api,'readCode',async(path:string)=>path==='b.py'?await new Promise<any>(r=>{finish=r;}):result(path));
 await state().openFile('a.py');const opening=state().openFile('b.py');await setImmediate();await state().refreshCodeFile('a.py','main');finish(result('b.py'));await opening;assert.equal(state().activePath,'b.py');
 await state().openToSide('a.py');const split=state().openToSide('b.py');await state().refreshCodeFile('a.py','split');finish(result('b.py'));await split;assert.equal(state().splitPath,'b.py');
});

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  resetDraftScope();
  mock.method(api,'draftScope',async()=>({scopeId:'test-scope'}));
  mock.method(api,'vaultPreferences',async()=>getCachedVaultPreferences());
  useStore.setState(useStore.getInitialState(), true);
  mock.method(api, 'read', async (path: string) => ({ version:'v1', content: `# ${path}` }));
  mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  mock.method(api, 'tree', async () => ({ name: '', path: '', type: 'folder', children: [] }));
  mock.method(api, 'getUiState', async () => ({}));
  mock.method(api, 'putUiState', async () => ({ ok: true, version:'v1' }));
});

afterEach(() => {
  setUnlock({ active: false });
  mock.restoreAll();
  mock.timers.reset();
});

test('rename hook preserves manual sorting alongside preview tabs and unlock headers', async () => {
  await state().openFile('Preview.md');
  useStore.setState({ manualOrder: { '': ['folder', 'Preview.md'], folder: ['folder/a.md'] } });
  const tabs = state().tabs;
  setUnlock({ active: true, password: 'test-only' });
  const request = mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get('x-unlock-locked'), '1');
    assert.equal(new Headers(init?.headers).get('x-unlock-password'), 'test-only');
    return new Response(JSON.stringify({ ok: true, version:'v1' }), { headers: { 'content-type': 'application/json' } });
  });
  await api.rename('folder', 'renamed');
  assert.equal(request.mock.callCount(), 1);
  assert.deepEqual(state().manualOrder, { '': ['renamed', 'Preview.md'], renamed: ['renamed/a.md'] });
  assert.deepEqual(state().tabs, tabs);
  assert.equal(state().activePath, 'Preview.md');
});

test('a locked rename leaves manual sorting and preview tabs intact', async () => {
  await state().openFile('Preview.md');
  const order = { '': ['locked.md', 'Preview.md'] };
  useStore.setState({ manualOrder: order });
  const tabs = state().tabs;
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'locked' }), {
    status: 423, headers: { 'content-type': 'application/json' },
  }));
  await assert.rejects(api.rename('locked.md', 'new.md'), (err: unknown) => err instanceof ApiError && err.status === 423);
  assert.deepEqual(state().manualOrder, order);
  assert.deepEqual(state().tabs, tabs);
});

test('opening an embedded PDF resolves note-relative collisions before storing its tab path', async () => {
  const resolve = mock.method(api, 'resolveAttachment', async (target: string, from: string) => {
    assert.equal(target, 'attachments/report.pdf');
    assert.equal(from, 'docs/note.md');
    return { path: 'docs/attachments/report.pdf' };
  });
  await state().openAttachment('attachments/report.pdf', 'docs/note.md');
  assert.equal(resolve.mock.callCount(), 1);
  assert.equal(state().activePath, 'docs/attachments/report.pdf');
  assert.deepEqual(paths(), ['docs/attachments/report.pdf']);
});

for (const kind of ['note', 'canvas'] as const) {
  test(`inline creation of a ${kind} opens a permanent tab and preserves the previous preview`, async () => {
    await state().openFile('Preview.md');
    await (kind === 'note' ? state().newNote('') : state().newCanvas(''));
    const created = state().newNotePath!;
    assert.ok(created);
    await state().openCreatedFile(created);
    assert.deepEqual(paths(), ['Preview.md', created]);
    assert.equal(state().tabs.find((tab) => tab.path === created)?.preview, false);
    await state().openFile('Another.md');
    assert.ok(paths().includes(created));
    assert.ok(!paths().includes('Preview.md'));
  });
}

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
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  await state().openFile('Edited.md');
  state().setContent('Local edits');
  assert.equal(state().tabs[0].preview, false);
  await state().openFile('Next.md');
  assert.deepEqual(writes.mock.calls[0].arguments, ['Edited.md', 'Local edits', 'v1','test-scope']);
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
  let finishSlow!: (value: { version:'v1', content: string }) => void;
  mock.method(api, 'read', (path: string) => path === 'Slow.md'
    ? new Promise<{ version:'v1', content: string }>((resolve) => { finishSlow = resolve; })
    : Promise.resolve({ version:'v1', content: '# Fast' }));
  const slow = state().openFile('Slow.md');
  await setImmediate();
  await state().openFile('Fast.md');
  finishSlow({ version:'v1', content: '# Slow' });
  await slow;
  assert.deepEqual(paths(), ['Fast.md']);
  assert.equal(state().activePath, 'Fast.md');
  assert.equal(state().content, '# Fast');
});

test('openTasks() opens one "Tasks" tab at TASKS_PATH, and openFile(TASKS_PATH) routes to it', async () => {
  await state().openTasks();
  assert.deepEqual(paths(), [TASKS_PATH]);
  assert.equal(state().tabs[0].title, 'Tasks');
  assert.equal(state().activePath, TASKS_PATH);

  await state().openFile('Note.md');
  await state().openFile(TASKS_PATH);
  assert.deepEqual(paths(), [TASKS_PATH, 'Note.md']); // reuses the existing Tasks tab, doesn't duplicate it
  assert.equal(state().activePath, TASKS_PATH);
});

test('isViewPath is true only for the Graph/Tasks sentinel tab paths', () => {
  assert.equal(isViewPath(GRAPH_PATH), true);
  assert.equal(isViewPath(TASKS_PATH), true);
  assert.equal(isViewPath('Wiki/Note.md'), false);
  assert.equal(isViewPath(null), false);
});

test('opening Graph view cancels an older pending note selection', async () => {
  let finishRead!: (value: { version:'v1', content: string }) => void;
  mock.method(api, 'read', () => new Promise<{ version:'v1', content: string }>((resolve) => { finishRead = resolve; }));
  const pending = state().openFile('Slow.md');
  await setImmediate();
  await state().openGraph();
  finishRead({ version:'v1', content: '# Slow' });
  await pending;
  assert.deepEqual(paths(), [GRAPH_PATH]);
  assert.equal(state().activePath, GRAPH_PATH);
});

test('edits made while the next preview loads are saved and kept open', async () => {
  await state().openFile('Edited.md');
  let finishRead!: (value: { version:'v1', content: string }) => void;
  mock.method(api, 'read', () => new Promise<{ version:'v1', content: string }>((resolve) => { finishRead = resolve; }));
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  const pending = state().openFile('Next.md');
  await setImmediate();
  state().setContent('Typed while loading');
  finishRead({ version:'v1', content: '# Next' });
  await pending;
  assert.deepEqual(writes.mock.calls[0].arguments, ['Edited.md', 'Typed while loading', 'v1','test-scope']);
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
  const writes = mock.method(api, 'putUiState', async () => ({ ok: true, version:'v1' }));
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

// ---- New note from template (FR-17) --------------------------------------

/** The vault shape the command resolves folders against. */
const VAULT_TREE: TreeNode = {
  name: '',
  path: '',
  type: 'folder',
  children: [
    {
      name: 'Wiki',
      path: 'Wiki',
      type: 'folder',
      children: [
        {
          name: 'templates',
          path: 'Wiki/templates',
          type: 'folder',
          children: [
            { name: 'meeting.md', path: 'Wiki/templates/meeting.md', type: 'file', ext: 'md' },
          ],
        },
        { name: 'meetings', path: 'Wiki/meetings', type: 'folder', children: [] },
      ],
    },
  ],
};

/** A template in both token and literal form, so both paths are exercised. */
const MEETING_TEMPLATE = [
  '---',
  'title: {{title}}',
  'created: {{date}}',
  'updated: {{date}}',
  'type: meeting',
  'date: {{date}}',
  'tags: [meeting]',
  'sources: [raw/meetings/YYYY-MM-DD-slug.md]',
  '---',
  '',
  '# {{title}}',
  '',
  '<!-- created {{time}} -->',
].join('\n');

/** Pin the clock so the dated path and the filled tokens are exact. */
const freeze = (y: number, m: number, d: number, h: number, min: number) => {
  // The file-level beforeEach already enabled the setTimeout mocks; swap in a
  // frozen clock (Date too) so the dated path and times are exact.
  mock.timers.reset();
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  mock.timers.setTime(new Date(y, m - 1, d, h, min).getTime());
};

test('newFromTemplate creates the dated, filled note and opens it', async () => {
  freeze(2026, 9, 26, 7, 30);
  useStore.setState({ tree: VAULT_TREE });
  mock.method(api, 'tree', async () => VAULT_TREE);
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  mock.method(api, 'read', async () => ({ version:'v1', content: MEETING_TEMPLATE }));

  const path = await state().newFromTemplate(
    'Wiki/templates/meeting.md',
    'QMS review with Ban',
    'Wiki/meetings',
  );

  assert.equal(path, 'Wiki/meetings/2026-09-26-qms-review-with-ban.md');
  assert.equal(state().activePath, path, 'the new note is the open tab');
  assert.match(state().toast, /Created from template/);
  assert.deepEqual(writes.mock.calls[0].arguments, [
    path,
    [
      '---',
      'title: QMS review with Ban',
      'created: 2026-09-26',
      'updated: 2026-09-26',
      'type: meeting',
      'date: 2026-09-26',
      'tags: [meeting]',
      'sources: [raw/meetings/2026-09-26-qms-review-with-ban.md]',
      '---',
      '',
      '# QMS review with Ban',
      '',
      '<!-- created 07:30 -->',
    ].join('\n'),
    '', // create-only: the path must not exist yet
  ]);
});

test('newFromTemplate never overwrites — an existing same-day note moves to -2', async () => {
  freeze(2026, 9, 26, 7, 30);
  const taken = 'Wiki/meetings/2026-09-26-qms-review-with-ban.md';
  const tree: TreeNode = {
    ...VAULT_TREE,
    children: [
      {
        ...VAULT_TREE.children![0],
        children: [
          ...(VAULT_TREE.children![0].children ?? []),
          { name: '2026-09-26-qms-review-with-ban.md', path: taken, type: 'file', ext: 'md' },
        ],
      },
    ],
  };
  useStore.setState({ tree });
  mock.method(api, 'tree', async () => tree);
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  mock.method(api, 'read', async () => ({ version:'v1', content: MEETING_TEMPLATE }));

  const path = await state().newFromTemplate('Wiki/templates/meeting.md', 'QMS review with Ban', 'Wiki/meetings');

  assert.equal(path, 'Wiki/meetings/2026-09-26-qms-review-with-ban-2.md');
  assert.equal(writes.mock.calls[0].arguments[0], path);
});

test('newFromTemplate retries the next suffix when a concurrent writer wins the race', async () => {
  freeze(2026, 9, 26, 7, 30);
  useStore.setState({ tree: VAULT_TREE });
  mock.method(api, 'tree', async () => VAULT_TREE);
  mock.method(api, 'read', async () => ({ version:'v1', content: MEETING_TEMPLATE }));
  let first = true;
  const writes = mock.method(api, 'write', async (path: string) => {
    if (first) {
      first = false;
      throw new ApiError('version_conflict', 409);
    }
    return { ok: true, path };
  });

  const path = await state().newFromTemplate('Wiki/templates/meeting.md', 'QMS review with Ban', 'Wiki/meetings');

  assert.equal(path, 'Wiki/meetings/2026-09-26-qms-review-with-ban-2.md');
  assert.deepEqual(
    writes.mock.calls.map((c) => c.arguments[0]),
    ['Wiki/meetings/2026-09-26-qms-review-with-ban.md', path],
  );
});

test('newFromTemplate refuses a title that yields no filename, and writes nothing', async () => {
  useStore.setState({ tree: VAULT_TREE });
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  await assert.rejects(
    () => state().newFromTemplate('Wiki/templates/meeting.md', '   ', 'Wiki/meetings'),
    /title is required/i,
  );
  assert.equal(writes.mock.calls.length, 0);
});

test('newFromTemplate refuses an empty folder — a template note never lands in the vault root', async () => {
  useStore.setState({ tree: VAULT_TREE });
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  mock.method(api, 'read', async () => ({ version:'v1', content: MEETING_TEMPLATE }));
  await assert.rejects(
    () => state().newFromTemplate('Wiki/templates/document.md', 'QMS review', ''),
    /target folder is required/i,
  );
  assert.equal(writes.mock.calls.length, 0);
});

test('newFromTemplate refuses a folder that does not exist, and writes nothing', async () => {
  useStore.setState({ tree: VAULT_TREE });
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  await assert.rejects(
    () => state().newFromTemplate('Wiki/templates/meeting.md', 'QMS review', 'Wiki/nope'),
    /Folder not found: Wiki\/nope/,
  );
  assert.equal(writes.mock.calls.length, 0);
});

test('newFromTemplate lets a failed template read through, writing nothing', async () => {
  useStore.setState({ tree: VAULT_TREE });
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  mock.method(api, 'read', async () => {
    throw new Error('Not found');
  });
  await assert.rejects(
    () => state().newFromTemplate('Wiki/templates/gone.md', 'QMS review', 'Wiki/meetings'),
    /Not found/,
  );
  assert.equal(writes.mock.calls.length, 0);
});

// FR-21: a link to an attachment that is not in the vault must not write a note
// named after the file (`x.pdf` at the vault root) — notify instead. Links to
// notes keep the create-on-click behaviour.
test('an unresolved attachment link creates no note', async () => {
  mock.method(api, 'resolve', async () => ({ path: null }));
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  await state().openWikilink('missing.pdf');
  assert.equal(writes.mock.calls.length, 0);
  assert.deepEqual(paths(), []);
  assert.equal(state().toast, 'File not found: missing.pdf');
});

test('an unresolved note link still offers to create it', async () => {
  mock.method(api, 'resolve', async () => ({ path: null }));
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  await state().openWikilink('Fresh');
  assert.equal(writes.mock.calls.length, 1);
  assert.deepEqual(paths(), ['Fresh.md']);
});

test('a resolved pdf link opens the file itself, not a new note', async () => {
  mock.method(api, 'resolve', async () => ({ path: 'relats/raw/documents/report.pdf' }));
  const writes = mock.method(api, 'write', async () => ({ ok: true, version:'v1' }));
  await state().openWikilink('report.pdf');
  assert.equal(writes.mock.calls.length, 0);
  assert.deepEqual(paths(), ['relats/raw/documents/report.pdf']);
});

test('a link in an embedded note resolves against its own source directory',async()=>{
  useStore.setState({activePath:'Root/Host.md'});
  const resolve=mock.method(api,'resolve',async(_target:string,from?:string)=>({path:from==='Lab/Parent.md'?'Lab/Target.md':'Root/Target.md'}));
  await state().openWikilink('./Target.md','markdown','Lab/Parent.md');
  assert.deepEqual(resolve.mock.calls[0].arguments,['./Target.md','Lab/Parent.md','markdown']);
  assert.equal(state().activePath,'Lab/Target.md');
});


test('note links pass decoded fragments to a request scoped to the opened document',async()=>{
 mock.method(api,'resolve',async()=>({path:'Folder/Target.md'}));
 await state().openWikilink('Target#^item');
 assert.equal((state() as any).noteNavigation?.path,'Folder/Target.md');assert.equal((state() as any).noteNavigation?.fragment,'^item');
 const previous=(state() as any).noteNavigation;
 await state().openWikilink('Target.md#Parent%23Section%2520','markdown');
 assert.equal((state() as any).noteNavigation?.fragment,'Parent#Section%20');assert.notEqual((state() as any).noteNavigation,previous);
 await state().openFile('Other.md');assert.equal((state() as any).noteNavigation,null);
});


test('unresolved note fragments never become part of a newly created filename',async()=>{
 mock.method(api,'resolve',async()=>({path:null}));await state().openWikilink('Fresh#Section');
 assert.equal((api.write as any).mock.calls[0].arguments[0],'Fresh.md');
 const before=(api.write as any).mock.callCount();await state().openWikilink('#Missing');assert.equal((api.write as any).mock.callCount(),before);
});


test('a late note-link resolution cannot replace a newer explicit file opening',async()=>{
 let finish!:(value:{path:string})=>void;mock.method(api,'resolve',()=>new Promise<{path:string}>(r=>{finish=r}));
 const pending=state().openWikilink('Old#Section');await setImmediate();await state().openFile('New.md');finish({path:'Old.md'});await pending;
 assert.equal(state().activePath,'New.md');assert.equal((state() as any).noteNavigation,null);
});
