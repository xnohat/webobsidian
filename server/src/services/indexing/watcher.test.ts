import {EventEmitter} from 'node:events';
import {expect,it,vi} from 'vitest';
const handles=vi.hoisted(()=>[] as (EventEmitter&{close:ReturnType<typeof vi.fn>})[]);
vi.mock('chokidar',()=>({default:{watch:vi.fn(()=>{const h=Object.assign(new EventEmitter(),{close:vi.fn(async()=>{})});handles.push(h);return h;})}}));
import {watchVault} from './watcher.js';
it('owns polling replacement and closes it rather than the original watcher',async()=>{
  const mode=vi.fn(),change=vi.fn(),fail=vi.fn();const watcher=watchVault('C:/vault',false,change,mode,fail);
  handles[0].emit('ready');await watcher.ready;
  handles[0].emit('error',Object.assign(new Error('limit'),{code:'ENOSPC'}));
  handles[0].emit('error',Object.assign(new Error('limit again'),{code:'EMFILE'}));
  await Promise.resolve();await Promise.resolve();
  expect(handles).toHaveLength(2);expect(handles[0].close).toHaveBeenCalledTimes(1);
  handles[1].emit('ready');expect(mode).toHaveBeenLastCalledWith(true);
  await watcher.close();expect(handles[1].close).toHaveBeenCalledTimes(1);
});
