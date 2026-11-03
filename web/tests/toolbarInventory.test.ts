import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getCommand} from '../src/lib/toolbar/registry';
test('all pinned standard commands resolve to native executable commands',()=>{
 const rows=JSON.parse(readFileSync(new URL('./fixtures/editingToolbarCommands.json',import.meta.url),'utf8')) as {upstreamId:string;nativeId:string}[];
 assert.equal(rows.length,64);assert.equal(new Set(rows.map(x=>x.upstreamId)).size,64);
 for(const row of rows){assert.ok(getCommand(row.nativeId),row.upstreamId);assert.equal(typeof getCommand(row.nativeId)?.run,'function');}
});
