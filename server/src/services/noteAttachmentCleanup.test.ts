import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({snapshot:{paths:['note.md','other.md','photo.png','linked.md'],documents:new Map([['note.md','![[photo.png]] [[linked]]']])},trash:vi.fn(),references:[] as string[],fail:false}));
vi.mock('./referenceScan.js',()=>({
 referenceSnapshot:async()=>mock.snapshot,
 referencedPaths:(content:string)=>content.includes('photo')?['photo.png','linked.md']:[],
 findFileReferences:async()=>{if(mock.fail)throw Error('unreadable note');return mock.references;},
}));
vi.mock('./vault.js',()=>({exists:async(p:string)=>p!=='note.md'}));
import { collectNoteAttachmentCandidates, cleanupNoteAttachments } from './noteAttachmentCleanup.js';
beforeEach(()=>{mock.trash.mockReset();mock.references=[];mock.fail=false;});
describe('native note deletion attachment policy',()=>{
 it('collects linked attachments before deleting the source and never collects notes',async()=>{
  expect(await collectNoteAttachmentCandidates('note.md')).toEqual(['photo.png']);
 });
 it('always cleans only unreferenced candidates through normal deletion policy',async()=>{
  expect(await cleanupNoteAttachments({sourcePath:'note.md',candidates:['photo.png'],policy:'always',deleteAttachment:mock.trash})).toEqual({deleted:['photo.png'],kept:[],pending:[]});
  expect(mock.trash).toHaveBeenCalledWith('photo.png');
 });
 it('never preserves candidates; ask returns choices without deleting',async()=>{
  expect((await cleanupNoteAttachments({sourcePath:'note.md',candidates:['photo.png'],policy:'never',deleteAttachment:mock.trash})).kept).toEqual(['photo.png']);
  expect((await cleanupNoteAttachments({sourcePath:'note.md',candidates:['photo.png'],policy:'ask',deleteAttachment:mock.trash})).pending).toEqual(['photo.png']);
  expect(mock.trash).not.toHaveBeenCalled();
 });
 it('rechecks shared/excluded references and fails closed on incomplete scans',async()=>{
  mock.references=['Archive/shared.md'];
  expect((await cleanupNoteAttachments({sourcePath:'note.md',candidates:['photo.png'],policy:'always',deleteAttachment:mock.trash})).kept).toEqual(['photo.png']);
  mock.fail=true;
  await expect(cleanupNoteAttachments({sourcePath:'note.md',candidates:['photo.png'],policy:'always',deleteAttachment:mock.trash})).rejects.toThrow('unreadable');
  expect(mock.trash).not.toHaveBeenCalled();
 });
});
