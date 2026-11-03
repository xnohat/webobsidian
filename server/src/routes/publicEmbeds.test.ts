import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
import {promises as fs} from 'node:fs';

const fixture=vi.hoisted(()=>({locked:false,enabled:true,children:[] as {id:string;path:string;enabled:boolean;passwordHash?:string;createdAt:string}[],reads:[] as string[],files:new Map<string,string>([
 ['Folder/Host.md','![[Board.canvas]]\n\n![[sample.pdf#page=2]]'],
 ['Folder/Board.canvas',JSON.stringify({nodes:[{id:'a',type:'text',x:0,y:0,width:200,height:100,text:'Public card'},
  {id:'b',type:'file',x:300,y:0,width:200,height:100,file:'Private.md'}],edges:[]})],
 ['Private.md','PRIVATE_NOTE_CANARY'],['Other.canvas','{"nodes":[],"edges":[]}'],['Folder/sample.pdf','PDF fixture'],
])}));
vi.mock('../services/vault.js',()=>({exists:async(p:string)=>fixture.files.has(p),readFileText:async(p:string)=>{fixture.reads.push(p);if(!fixture.files.has(p))throw Error('Missing file');return fixture.files.get(p)!},readFileTextBounded:async(p:string,limit:number)=>{fixture.reads.push(p);const value=fixture.files.get(p);return value!==undefined&&Buffer.byteLength(value)<=limit?value:null}}));
vi.mock('../services/shares.js',()=>({getActiveShare:async(id:string)=>fixture.enabled&&id==='token'?{id,path:'Folder/Host.md',enabled:true,...(fixture.locked?{passwordHash:'protected'}:{})}:fixture.children.find(s=>s.id===id&&s.enabled)??null,listShares:async()=>[{id:'token',path:'Folder/Host.md',enabled:fixture.enabled,createdAt:'fixture',...(fixture.locked?{passwordHash:'protected'}:{})},...fixture.children]}));
vi.mock('../services/fileindex.js',()=>({resolveFile:()=>null,indexedFilePaths:()=>[...fixture.files.keys()]}));
vi.mock('../services/linkpreview.js',()=>({embedLinkPreviews:async(html:string)=>html}));
vi.mock('../services/vaultPreferences.js',()=>({getVaultPreferences:async()=>({values:{baseFontSize:19}})}));
import {sharePageRouter} from './sharepage.js';

let server:Server,base:string;
beforeAll(async()=>{
 const readdir=fs.readdir.bind(fs);
 vi.spyOn(fs,'readdir').mockImplementation((async(...args:Parameters<typeof fs.readdir>)=>[...(await readdir(...args)).filter(f=>!String(f).startsWith('public-embeds-')),'public-embeds-test.js']) as typeof fs.readdir);
 const app=express();app.use((_req,res,next)=>{res.locals.cspNonce='test-nonce';next()});app.use('/share',sharePageRouter);
 server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async()=>{vi.restoreAllMocks();if(server)await new Promise<void>(r=>server.close(()=>r()))});

it('adds a separate read-only module while retaining SSR PDF and Canvas fallback links',async()=>{
 const r=await fetch(base+'/share/token');const html=await r.text();expect(r.status).toBe(200);
 expect(html).toMatch(/type="module"[^>]+src="\/assets\/public-embeds-test.js"/);
 expect(html).toContain('data-public-share="token"');
 expect(html).toContain('--font-text-size:19px');
 expect(html).toContain('class="pdf-embed"');expect(html).toContain('class="canvas-embed"');
 expect(html).not.toContain('/api/files');
});
it('opens only a Canvas already authorized as an attachment of this share',async()=>{
 fixture.reads.length=0;
 const r=await fetch(base+'/share/token/canvas?path=Board.canvas'),html=await r.text();
 expect(r.status).toBe(200);expect(html).toContain('Public card');expect(html).toContain('cv-zin');
 expect(html).not.toContain('PRIVATE_NOTE_CANARY');expect(fixture.reads).not.toContain('Private.md');
 expect((await fetch(base+'/share/token/canvas?path=Other.canvas')).status).toBe(404);
 expect((await fetch(base+'/share/token/canvas?path=sample.pdf')).status).toBe(404);
});

it('renders published Canvas note cards and subpaths without reading private cards',async()=>{
 const original=fixture.files.get('Folder/Board.canvas')!;
 fixture.files.set('Folder/Board.canvas',JSON.stringify({nodes:[{id:'published',type:'file',file:'Shared/Card%20#one.md',subpath:'#Part',x:0,y:0,width:300,height:240},{id:'private',type:'file',file:'Private.md',x:340,y:0,width:200,height:200}],edges:[]}));
 fixture.files.set('Shared/Card%20#one.md','# Card\n\nBEFORE_PART\n\n## Part\n\nPUBLIC_CARD_BODY\n\n![](inside.pdf)\n\n## Other\n\nAFTER_PART');fixture.children=[{id:'card',path:'Shared/Card%20#one.md',enabled:true,createdAt:'fixture'}];fixture.reads.length=0;
 try{
  const html=await(await fetch(base+'/share/token/canvas?path=Board.canvas')).text();expect(html).toContain('PUBLIC_CARD_BODY');expect(html).not.toContain('BEFORE_PART');expect(html).not.toContain('AFTER_PART');
  expect(html).toContain('href="/share/card#Part"');expect(html).toContain('data-public-share="card"');expect(html).toContain('/public/shares/card/file?path=inside.pdf');
  expect(html).not.toContain('PRIVATE_NOTE_CANARY');expect(fixture.reads).not.toContain('Private.md');
 }finally{fixture.files.set('Folder/Board.canvas',original);fixture.files.delete('Shared/Card%20#one.md');fixture.children=[]}
});

it('an independently published Canvas grants its direct media cards, not private note bodies',async()=>{
 const original=fixture.files.get('Folder/Board.canvas')!;
 fixture.files.set('Folder/Board.canvas',JSON.stringify({nodes:[{id:'pdf',type:'file',file:'Folder/report #one.pdf',subpath:'#page=2',x:0,y:0,width:300,height:300},{id:'image',type:'file',file:'Folder/image%20#one.avif',x:340,y:0,width:200,height:200},{id:'private',type:'file',file:'Private.md',x:0,y:340,width:200,height:200}],edges:[]}));
 fixture.files.set('Folder/report #one.pdf','PDF');fixture.files.set('Folder/image%20#one.avif','IMAGE');
 fixture.children=[{id:'board',path:'Folder/Board.canvas',enabled:true,createdAt:'fixture'}];fixture.reads.length=0;
 try{
  let html=await(await fetch(base+'/share/token/canvas?path=Board.canvas')).text();expect(html).toContain('class="pdf-embed"');expect(html).toContain('/public/shares/board/file?path=%2FFolder%2Freport%20%23one.pdf#page=2');expect(html).toContain('/public/shares/board/file?path=%2FFolder%2Fimage%2520%23one.avif');
  expect(html).not.toContain('PRIVATE_NOTE_CANARY');expect(fixture.reads).not.toContain('Private.md');
  fixture.children[0].passwordHash='board-password';html=await(await fetch(base+'/share/token/canvas?path=Board.canvas')).text();expect(html).not.toContain('/public/shares/board/file');expect(html).not.toContain('class="pdf-embed"');
  delete fixture.children[0].passwordHash;html=await(await fetch(base+'/share/board')).text();expect(html).not.toContain('PRIVATE_NOTE_CANARY');expect(fixture.reads).not.toContain('Private.md');
 }finally{fixture.files.set('Folder/Board.canvas',original);fixture.files.delete('Folder/report #one.pdf');fixture.files.delete('Folder/image%20#one.avif');fixture.children=[]}
});
it('protects embedded Canvas with the same password and enabled-state checks',async()=>{
 fixture.locked=true;
 try{
  const locked=await fetch(base+'/share/token');const html=await locked.text();expect(html).toContain('password-protected');
  expect(html).not.toContain('public-embeds-test.js');expect(html).not.toContain('Board.canvas');
  expect((await fetch(base+'/share/token/canvas?path=Board.canvas')).status).toBe(401);
 }finally{fixture.locked=false}
 fixture.enabled=false;
 try{expect((await fetch(base+'/share/token/canvas?path=Board.canvas')).status).toBe(404)}finally{fixture.enabled=true}
});

it('transcludes only a published child, selects its heading and scopes attachments to that child',async()=>{
 const original=fixture.files.get('Folder/Host.md')!;
 fixture.files.set('Folder/Host.md','![[Child#Part]]\n\n![[Private]]');
 fixture.files.set('Folder/Child.md','# Child\n\n## Part\n\nPUBLISHED_CHILD_BODY\n\n![](inside.pdf#page=2)\n\n## Other\n\nOMITTED_SECTION');
 fixture.children=[{id:'child',path:'Folder/Child.md',enabled:true,createdAt:'fixture'}];fixture.reads.length=0;
 try{
  const r=await fetch(base+'/share/token'),html=await r.text();expect(r.status).toBe(200);
  expect(html).toContain('PUBLISHED_CHILD_BODY');expect(html).not.toContain('OMITTED_SECTION');
  expect(html).toContain('data-public-share="child"');expect(html).toContain('class="markdown-embed-link"');expect(html).toContain('href="/share/child#Part"');
  expect(html).toContain('/public/shares/child/file?path=inside.pdf#page=2');
  expect(html).not.toContain('PRIVATE_NOTE_CANARY');expect(fixture.reads).not.toContain('Private.md');
 }finally{fixture.files.set('Folder/Host.md',original);fixture.files.delete('Folder/Child.md');fixture.children=[]}
});

it('never reads unpublished, disabled or independently locked child notes',async()=>{
 const original=fixture.files.get('Folder/Host.md')!;fixture.files.set('Folder/Host.md','![[Child]]');fixture.files.set('Folder/Child.md','CHILD_CANARY');
 try{
  for(const children of [[],[{id:'child',path:'Folder/Child.md',enabled:false,createdAt:'fixture'}],[{id:'child',path:'Folder/Child.md',enabled:true,passwordHash:'child-password',createdAt:'fixture'}]]){
   fixture.children=children;fixture.reads.length=0;
   const html=await(await fetch(base+'/share/token')).text();expect(html).not.toContain('CHILD_CANARY');expect(fixture.reads).not.toContain('Folder/Child.md');
  }
 }finally{fixture.files.set('Folder/Host.md',original);fixture.files.delete('Folder/Child.md');fixture.children=[]}
});

it('resolves the actual target before checking publication, without substituting a public same-named note',async()=>{
 const original=fixture.files.get('Folder/Host.md')!;fixture.files.set('Folder/Host.md','![[Child]]');
 fixture.files.set('Folder/Child.md','PRIVATE_SHADOW');fixture.files.set('Elsewhere/Child.md','WRONG_PUBLIC_CHILD');fixture.children=[{id:'child',path:'Elsewhere/Child.md',enabled:true,createdAt:'fixture'}];fixture.reads.length=0;
 try{
  const html=await(await fetch(base+'/share/token')).text();expect(html).not.toContain('PRIVATE_SHADOW');expect(html).not.toContain('WRONG_PUBLIC_CHILD');expect(fixture.reads).not.toContain('Folder/Child.md');expect(fixture.reads).not.toContain('Elsewhere/Child.md');
 }finally{fixture.files.set('Folder/Host.md',original);fixture.files.delete('Folder/Child.md');fixture.files.delete('Elsewhere/Child.md');fixture.children=[]}
});

it('stops reading further published children after the aggregate embed budget is used',async()=>{
 const original=fixture.files.get('Folder/Host.md')!;
 fixture.files.set('Folder/Host.md','![[BudgetA]]\n\n![[BudgetB]]\n\n![[BudgetC]]');
 for(const name of ['BudgetA','BudgetB','BudgetC'])fixture.files.set('Folder/'+name+'.md','```\n'+'x'.repeat(2*1024*1024-8)+'\n```');
 fixture.children=['BudgetA','BudgetB','BudgetC'].map(id=>({id,path:'Folder/'+id+'.md',enabled:true,createdAt:'fixture'}));fixture.reads.length=0;
 try{await(await fetch(base+'/share/token')).arrayBuffer();expect(fixture.reads.filter(p=>p.includes('Budget'))).toHaveLength(1)}
 finally{fixture.files.set('Folder/Host.md',original);for(const name of ['BudgetA','BudgetB','BudgetC'])fixture.files.delete('Folder/'+name+'.md');fixture.children=[]}
});


it('shares the aggregate note budget across Canvas file cards',async()=>{
 const original=fixture.files.get('Folder/Board.canvas')!;
 const names=['BudgetCardA','BudgetCardB','BudgetCardC'];
 fixture.files.set('Folder/Board.canvas',JSON.stringify({nodes:names.map((name,i)=>({id:name,type:'file',file:'Folder/'+name+'.md',x:i*320,y:0,width:300,height:240})),edges:[]}));
 for(const name of names)fixture.files.set('Folder/'+name+'.md','```\n'+'x'.repeat(2*1024*1024-8)+'\n```');
 fixture.children=names.map(id=>({id,path:'Folder/'+id+'.md',enabled:true,createdAt:'fixture'}));fixture.reads.length=0;
 try{await(await fetch(base+'/share/token/canvas?path=Board.canvas')).arrayBuffer();expect(fixture.reads.filter(p=>p.includes('BudgetCard'))).toHaveLength(1)}
 finally{fixture.files.set('Folder/Board.canvas',original);for(const name of names)fixture.files.delete('Folder/'+name+'.md');fixture.children=[]}
});
