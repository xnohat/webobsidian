import {test,expect,vi,beforeAll,afterAll} from 'vitest';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const state=vi.hoisted(()=>({root:''}));
vi.mock('./vault.js',()=>({resolveInVault:async(p:string)=>{if(p.includes('..'))throw new Error('outside');return path.join(state.root,p);}}));
import {readCodeFile,MAX_CODE_FILE_BYTES} from './codeFileReader.js';
beforeAll(async()=>{state.root=await fs.mkdtemp(path.join(os.tmpdir(),'code-reader-'));});
afterAll(async()=>{await fs.rm(state.root,{recursive:true,force:true});});
test('reads UTF-8 without losing BOM/CRLF and limits highlighting',async()=>{
 await fs.writeFile(path.join(state.root,'a.py'),'\uFEFFprint("Привет")\r\n');
 expect(await readCodeFile('a.py')).toMatchObject({kind:'text',content:'\uFEFFprint("Привет")\r\n',highlightAllowed:true});
 await fs.writeFile(path.join(state.root,'big.py'),'x'.repeat(1_000_001));
 expect(await readCodeFile('big.py')).toMatchObject({kind:'text',highlightAllowed:false});
});
test('rejects binary, invalid UTF-8, directories, absent and escaping paths',async()=>{
 for(const [name,data,reason] of [['nul.py',Buffer.from([0]),'binary'],['bad.py',Buffer.from([255]),'encoding']] as const){await fs.writeFile(path.join(state.root,name),data);expect(await readCodeFile(name)).toMatchObject({kind:'unavailable',reason});}
 await expect(readCodeFile('absent')).rejects.toBeDefined();await expect(readCodeFile('../escape')).rejects.toBeDefined();await expect(readCodeFile('')).rejects.toBeDefined();
});
test('bounds actual reading at 10 MiB',async()=>{
 await fs.writeFile(path.join(state.root,'limit.py'),Buffer.alloc(MAX_CODE_FILE_BYTES,120));
 expect((await readCodeFile('limit.py')).kind).toBe('text');
 await fs.appendFile(path.join(state.root,'limit.py'),'x');
 expect(await readCodeFile('limit.py')).toMatchObject({kind:'unavailable',reason:'too-large'});
});
