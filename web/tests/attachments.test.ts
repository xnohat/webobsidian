import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayChildren } from '../src/lib/attachments';
import type { TreeNode } from '../src/lib/api';
import { api } from '../src/lib/api';
import {defaultVaultPreferences} from '../src/lib/vaultPreferences';

test('default vault preferences hide unsupported files but explicit show-all keeps them',()=>{
  const children:TreeNode[]=['note.md','photo.png','Thumbs.db','Thumbs.db@SynoEAStream','custom.unknown'].map(name=>({name,path:name,type:'file'}));
  assert.deepEqual(displayChildren(children,true,defaultVaultPreferences.showUnsupportedFiles).map(n=>n.path),['note.md','photo.png']);
  assert.deepEqual(displayChildren(children,true,true),children);
});

test('editor uploads send the source document instead of forcing a destination folder', async (t) => {
  let fields: FormData | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    fields = options.body as FormData;
    return Response.json({ ok: true, path: 'Media/photo.png', relativePath: '../Media/photo.png', size: 5 });
  });
  const result = await api.upload(new File(['photo'], 'photo.png'), undefined, 'Notes/note.md');
  assert.equal(fields?.get('sourcePath'), 'Notes/note.md');
  assert.equal(fields?.has('dir'), false);
  assert.equal(result.relativePath, '../Media/photo.png');
});

test('visibility covers configured and existing attachment folders and protects note folders', () => {
  const folders: TreeNode[] = [
    { name: 'Media', path: 'Media', type: 'folder', attachmentFolder: true, children: [] },
    { name: 'attachments', path: 'attachments', type: 'folder', attachmentFolder: false, children: [] },
    { name: ' attachments', path: ' attachments', type: 'folder', attachmentFolder: false, children: [] },
    { name: ' Attachments ', path: ' Attachments ', type: 'folder', attachmentFolder: false, children: [] },
    { name: 'Notes', path: 'Notes', type: 'folder', attachmentFolder: true, children: [
      { name: 'note.md', path: 'Notes/note.md', type: 'file' },
    ] },
  ];
  assert.deepEqual(displayChildren(folders, false).map(n => n.path), ['Notes']);
  assert.deepEqual(displayChildren(folders, true), folders);
});

test('unsupported visibility preserves supported web documents and all folders in the render copy', () => {
  const children: TreeNode[] = ['notes.md','board.canvas','report.docx','sheet.xlsx','archive.zip','custom.unknown'].map(name=>({name,path:name,type:'file'}));
  children.push({name:'Folder',path:'Folder',type:'folder',children:[]});
  assert.deepEqual(displayChildren(children,true,false).map(n=>n.path), ['notes.md','board.canvas','report.docx','sheet.xlsx','archive.zip','Folder']);
  assert.equal(children.length,7);
  assert.deepEqual(displayChildren(children,true,true),children);
});
