import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { api } from '../src/lib/api';
import { useStore,resetDraftScope } from '../src/lib/store';
import { useConfirm } from '../src/lib/confirm';
import { deleteEmbeddedImage } from '../src/lib/imageDelete';

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true);
  resetDraftScope();
  useStore.setState({ activePath: 'docs/note.md', viewMode: 'live', locked: false });
  mock.method(api,'draftScope',async()=>({scopeId:'test-image-scope'}));
  mock.method(api, 'resolveAttachment', async () => ({ path: 'docs/attachments/image.png' }));
  mock.method(api, 'references', async () => ({ references: [] }));
  mock.method(api,'read',async()=>({content:'',version:'saved'}));
  mock.method(api,'deleteAttachment',async()=>({outcome:'trashed' as const,path:'docs/attachments/image.png'}));
  mock.method(api, 'remove', async () => ({ ok: true as const }));
  useStore.setState({ loadTree: async () => {}, notify: () => {} });
});
afterEach(() => {
  useConfirm.getState().req?.resolve(false);
  mock.restoreAll();
});
const request = (readonly = false) => ({
  target: 'attachments/image.png',
  view: { state: EditorState.create({ doc: '![[attachments/image.png]]', extensions: EditorState.readOnly.of(readonly) }) } as EditorView,
  remove: mock.fn(),
});
const settleDialog = async () => {
  for (let i = 0; i < 40 && !useConfirm.getState().req; i++) await Promise.resolve();
};

test('Markdown image deletion resolves encoded names once using Markdown semantics',async()=>{
 const resolve=mock.method(api,'resolve',async()=>({path:'docs/photo%20#one.png'}));
 mock.method(api,'references',async()=>({references:['other.md']}));
 const r={...request(),target:'photo%2520%23one.png',kind:'markdown' as const};
 const operation=deleteEmbeddedImage(r);await settleDialog();
 useConfirm.getState().req?.resolve(false);await operation;
 assert.deepEqual(resolve.mock.calls[0].arguments,['photo%2520%23one.png','docs/note.md','markdown']);
 assert.equal((api.resolveAttachment as any).mock.callCount(),0);assert.equal(r.remove.mock.callCount(),0);
});

test('locked note cannot delete its unlocked attachment', async () => {
  useStore.setState({ locked: true });
  const r = request();
  const operation = deleteEmbeddedImage(r);
  await settleDialog();
  useConfirm.getState().req?.resolve(true);
  await operation;
  assert.equal(r.remove.mock.callCount(), 0);
  assert.equal((api.remove as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 0);
});

test('reading view cannot delete an image programmatically', async () => {
  useStore.setState({ viewMode: 'reading' });
  const r = request(true);
  const operation = deleteEmbeddedImage(r);
  await settleDialog();
  useConfirm.getState().req?.resolve(true);
  await operation;
  assert.equal(r.remove.mock.callCount(), 0);
});

test('locking or navigating during the confirmation cancels image deletion', async () => {
  for (const change of [{ locked: true }, { activePath: 'other.md' }]) {
    useStore.setState({ locked: false, activePath: 'docs/note.md' });
    const r = request();
    const operation = deleteEmbeddedImage(r);
    await settleDialog();
    assert.ok(useConfirm.getState().req);
    useStore.setState(change);
    useConfirm.getState().req!.resolve(true);
    await operation;
    assert.equal(r.remove.mock.callCount(), 0);
  }
});

test('editable note still supports confirmed image removal', async () => {
  const r = request();
  r.remove.mock.mockImplementation(()=>{r.view.state=EditorState.create({doc:''});});
  const operation = deleteEmbeddedImage(r);
  await settleDialog();
  useConfirm.getState().req!.resolve(true);
  await operation;
  assert.equal(r.remove.mock.callCount(), 1);
  assert.equal((api.deleteAttachment as unknown as ReturnType<typeof mock.fn>).mock.callCount(),1);
  assert.deepEqual((api.deleteAttachment as unknown as ReturnType<typeof mock.fn>).mock.calls[0].arguments,
    ['docs/note.md','docs/attachments/image.png','saved','test-image-scope','trash']);
});

test('switching vault during confirmation cancels deletion even for the same note path and document',async()=>{
 const r=request();const operation=deleteEmbeddedImage(r);await settleDialog();
 assert.ok(useConfirm.getState().req,'confirmation is open in the original vault');
 resetDraftScope();
 useStore.setState({activePath:'docs/note.md',viewMode:'live',locked:false});
 useConfirm.getState().req!.resolve(true);await operation;
 assert.equal(r.remove.mock.callCount(),0);
 assert.equal((api.deleteAttachment as unknown as ReturnType<typeof mock.fn>).mock.callCount(),0);
 assert.equal((api.remove as unknown as ReturnType<typeof mock.fn>).mock.callCount(),0);
});

 test('failed reference lookup never permits file deletion',async()=>{
 mock.method(api,'references',async()=>{throw Error('offline')});const r=request();await deleteEmbeddedImage(r);
 assert.equal(r.remove.mock.callCount(),0);assert.equal((api.deleteAttachment as unknown as ReturnType<typeof mock.fn>).mock.callCount(),0);
 });
 test('failed note save keeps attachment after removing embed',async()=>{
 useStore.setState({save:async()=>{throw Error('conflict')}});const r=request();const operation=deleteEmbeddedImage(r);await settleDialog();useConfirm.getState().req!.resolve(true);await operation;
 assert.equal((api.deleteAttachment as unknown as ReturnType<typeof mock.fn>).mock.callCount(),0);
 });
