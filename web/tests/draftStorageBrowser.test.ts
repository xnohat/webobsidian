import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { build } from 'esbuild';
test('browser: IndexedDB revisions and isolation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'webo-drafts-'));
    try {
        await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx', contents: `
 import {putDraft,listDrafts,deleteDraftIfRevision} from './src/lib/drafts/storage';
 window.run=async()=>{
 const check=(v,m)=>{if(!v)throw Error(m)};
 const record={scopeId:'scope',path:'a.md',writerId:'one',schemaVersion:1,revision:2,updatedAt:Date.now(),baseVersion:'hash',baseContent:'base',content:'new',kind:'text',state:'dirty'};
 await putDraft(record);await putDraft({...record,revision:1,content:'old'});
 check((await listDrafts('scope'))[0].content==='new','old write cannot overwrite new');
 check(!await deleteDraftIfRevision(record,1),'old ack cannot delete new');
 await putDraft({...record,writerId:'two'});check((await listDrafts('scope')).length===2,'tabs isolated');
 check((await listDrafts('other')).length===0,'vaults isolated');
 check(await deleteDraftIfRevision(record,2),'matching ack removes snapshot');return true;
 };` }, bundle: true, format: 'iife', platform: 'browser', define: { 'import.meta.env.DEV': 'false' }, outfile: join(dir, 'fixture.js'), logLevel: 'silent' });
        await writeFile(join(dir, 'index.html'), '<script src="fixture.js"></script>');
        await writeFile(join(dir, 'runner.cjs'), `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir, 'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir, 'index.html'))});await w.webContents.executeJavaScript('window.run()');console.log('OVERFLOW_PASS');w.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        const { stdout } = await promisify(execFile)(createRequire(import.meta.url)('electron'), [...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []), join(dir, 'runner.cjs')], { env, windowsHide: true, timeout: 60000 });
        assert.match(stdout, /OVERFLOW_PASS/);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
