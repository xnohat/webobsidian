import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
vi.mock('../middleware/auth.js',()=>({requireAuth:(_req:unknown,_res:unknown,next:()=>void)=>next()}));
vi.mock('../services/indexing/coordinator.js',()=>({indexing:{isStarted:false}}));
import {searchRouter} from './search.js';
import {publishFilePaths} from '../services/fileindex.js';
let server:Server,base:string;
beforeAll(async()=>{publishFilePaths(['Media/shot%20one.md','Media/shot one.md','Media/shot #1.md','Media/shot %231.md']);const app=express();app.use('/api',searchRouter);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;});
afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));});
it('HTTP resolver separates literal wiki percent filenames from encoded Markdown URLs',async()=>{
 for(const [target,kind,expected] of [
  ['shot%20one','wiki','Media/shot%20one.md'],['shot%20one.md','markdown','Media/shot one.md'],
  ['shot%2520one.md','markdown','Media/shot%20one.md'],['shot%20%231.md','markdown','Media/shot #1.md'],
  ['shot %231','wiki','Media/shot %231.md'],['shot%20%25231.md','markdown','Media/shot %231.md'],
 ]){const response=await fetch(base+'/api/resolve?'+new URLSearchParams({target,kind,from:'Notes/Source.md'}));expect(response.status).toBe(200);expect((await response.json()).path,{target,kind}).toBe(expected);}
});
