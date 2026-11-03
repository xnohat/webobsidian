import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';
test('browser runtime imports under strict CSP, classifies errors, and ignores stale catalog/readiness', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'webo-plugin-runtime-'));
    try {
        await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts', contents: `
import {loadPlugins,stopPlugins,pluginManager} from './src/lib/plugins';import {api} from './src/lib/api';import {resetDraftScope} from './src/lib/store';
window.run=async()=>{
 const check=(v,m)=>{if(!v)throw Error(m)};const violations=[];document.addEventListener('securitypolicyviolation',e=>violations.push(e.blockedURI));
 api.draftScope=async()=>({scopeId:'test-scope'});resetDraftScope();
 const catalog=(version='ok',enabled=true)=>({vaultIdentity:'test-vault',plugins:[{id:'synthetic',name:'Synthetic',enabled,contentVersion:version,vaultIdentity:'test-vault',runtimeUrl:'/api/plugins/synthetic/runtime.mjs?version='+version}]});
 api.listPlugins=async()=>catalog();let ready;const gate=new Promise(r=>ready=r);const pending=loadPlugins(gate);await Promise.resolve();check(!window.fixtureLoads,'readiness blocks startup');ready();await pending;
 check(pluginManager.getStates()[0].state==='loaded','strict CSP module started');check(window.fixtureLoads===1,'one onload');check(violations.length===0,'no CSP violations');
 await stopPlugins();check(window.fixtureStops===1,'stop cleans runtime');
 for(const [version,kind,stage]of [['http','http','fetch'],['syntax','syntax','fetch'],['unsupported','unsupported-module','instantiate'],['crash','runtime','onload']]){
  api.listPlugins=async()=>catalog(version);await loadPlugins();const failed=pluginManager.getStates()[0];check(failed.failure?.kind===kind,version+' kind '+JSON.stringify(failed));check(failed.failure?.stage===stage,version+' stage');await stopPlugins();
 }
 let old;api.listPlugins=()=>new Promise(r=>old=r);const oldLoad=loadPlugins();await Promise.resolve();await Promise.resolve();
 api.listPlugins=async()=>catalog('new');await loadPlugins();old(catalog('ok',false));await oldLoad;
 check(pluginManager.getStates()[0].state==='loaded','old catalog cannot disable newer runtime');
 await stopPlugins();return true;
};` }, bundle: true, format: 'iife', platform: 'browser', define: { 'import.meta.env.DEV': 'false' }, outfile: path.join(dir, 'fixture.js'), logLevel: 'silent' });
        await writeFile(path.join(dir, 'runner.cjs'), `const {app,BrowserWindow}=require('electron'),http=require('node:http'),fs=require('node:fs');app.setPath('userData',${JSON.stringify(path.join(dir, 'profile'))});app.whenReady().then(async()=>{const server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(${JSON.stringify(path.join(dir, 'fixture.js'))}));}if(req.url.startsWith('/api/plugins/')){const version=new URL(req.url,'http://localhost').searchParams.get('version');if(version==='http'){res.statusCode=401;res.setHeader('Content-Type','text/html');return res.end('<html>unauthorized</html>');}if(version==='syntax'){res.statusCode=422;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({error:'PLUGIN_COMPILE_ERROR: invalid JavaScript'}));}res.setHeader('Content-Type','application/javascript');let body=version==='unsupported'?"require('child_process');":'module.exports=class extends require("obsidian").Plugin{onload(){'+(version==='crash'?'throw new Error("private data must not be displayed");':'globalThis.fixtureLoads=(globalThis.fixtureLoads||0)+1;this.register(()=>globalThis.fixtureStops=(globalThis.fixtureStops||0)+1);')+'}}';return res.end('export default function(module,exports,require){\\n'+body+'\\n}');}res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline'");res.end('<div id="root"></div><script src="/fixture.js"></script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const w=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true}});await w.loadURL('http://127.0.0.1:'+server.address().port);await w.webContents.executeJavaScript('window.run()');console.log('PLUGIN_RUNTIME_PASS');w.destroy();server.close();app.quit();}).catch(e=>{console.error(e);app.exit(1)});`);
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        const { stdout } = await promisify(execFile)(createRequire(import.meta.url)('electron'), [...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []), path.join(dir, 'runner.cjs')], { env, windowsHide: true, timeout: 30000 });
        assert.match(stdout, /PLUGIN_RUNTIME_PASS/);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
