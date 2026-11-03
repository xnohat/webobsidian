import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentSession } from '../src/lib/drafts/session';
test('save uses base version and does not acknowledge newer edits', async () => {
    let release!: (value: {
        version: string;
    }) => void;
    const calls: unknown[][] = [];
    const journal: unknown[] = [];
    const session = new DocumentSession({ scopeId: 'scope', path: 'a.md', writerId: 'tab', content: 'base', version: 'v1' }, { put: async (r) => { journal.push(r); }, remove: async () => true, write: async (...args) => { calls.push(args); return new Promise(r => { release = r; }); } });
    session.edit('first');
    const pending = session.save();
    await new Promise(r => setImmediate(r));
    session.edit('second');
    release({ version: 'v2' });
    await pending;
    assert.deepEqual(calls, [['a.md', 'first', 'v1']]);
    assert.equal(session.content, 'second');
    assert.equal(session.baseContent, 'first');
    assert.equal(session.baseVersion, 'v2');
    assert.notEqual(session.state, 'saved');
});
test('conflict preserves local text and blocks automatic retry', async () => {
    const session = new DocumentSession({ scopeId: 'scope', path: 'a.md', writerId: 'tab', content: 'base', version: 'v1' }, { put: async () => { }, remove: async () => true, write: async () => { throw Object.assign(new Error('conflict'), { status: 409 }); } });
    session.edit('mine');
    await assert.rejects(session.save());
    assert.equal(session.state, 'conflict');
    assert.equal(session.content, 'mine');
    await assert.rejects(session.save(), /conflict/i);
});
test('local quota failure is visible but does not prohibit explicit server save', async () => {
    const session = new DocumentSession({ scopeId: 'scope', path: 'a.md', writerId: 'tab', content: 'base', version: 'v1' }, { put: async () => { throw new Error('quota'); }, remove: async () => true, write: async () => ({ version: 'v2' }) });
    session.edit('mine');
    await assert.rejects(session.flush(), /quota/);
    assert.match(session.localError, /quota/);
    await session.save();
    assert.equal(session.baseContent, 'mine');
    assert.equal(session.state, 'saved');
});

test('editing while acknowledgement cleanup awaits never reports the newer text as saved',async()=>{
 let release!:()=>void;let removing=false;const stored:string[]=[];
 const s=new DocumentSession({scopeId:'scope',path:'race.md',writerId:'tab',content:'base',version:'v1'},{put:async r=>{stored.push(r.content)},remove:async()=>{removing=true;await new Promise<void>(r=>{release=r});return true},write:async()=>({version:'v2'})});
 s.edit('first');const pending=s.save();while(!removing)await new Promise(r=>setImmediate(r));s.edit('second');release();await pending;
 assert.notEqual(s.state,'saved');assert.equal(stored.at(-1),'second');s.dispose();
});

test('a delayed old save receipt cannot replace a newer conflict acknowledgement',async()=>{
 let release!:(value:{version:string})=>void;let writing=false;
 const s=new DocumentSession({scopeId:'scope',path:'late.md',writerId:'tab',content:'base',version:'v1'},{put:async()=>{},remove:async()=>true,write:async()=>{writing=true;return new Promise(r=>{release=r})}});
 s.edit('local');const pending=s.save();while(!writing)await new Promise(r=>setImmediate(r));s.acceptServerResult('merged','v3');release({version:'v2'});await pending;
 assert.equal(s.baseVersion,'v3');assert.equal(s.baseContent,'merged');assert.equal(s.state,'saved');s.dispose();
});

test('acknowledgement while local flush is pending cancels the obsolete server request',async()=>{
 let release!:()=>void;let flushing=false,writes=0;
 const s=new DocumentSession({scopeId:'scope',path:'flush.md',writerId:'tab',content:'base',version:'v1'},{put:async()=>{flushing=true;await new Promise<void>(r=>{release=r})},remove:async()=>true,write:async()=>{writes++;return {version:'v2'}}});
 s.edit('local');const pending=s.save();while(!flushing)await new Promise(r=>setImmediate(r));s.acceptServerResult('merged','v3');release();await pending;
 assert.equal(writes,0);assert.equal(s.state,'saved');assert.equal(s.baseVersion,'v3');s.dispose();
});
