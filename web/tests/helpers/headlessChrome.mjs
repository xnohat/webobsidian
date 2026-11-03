import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

export const chromePath=[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe',
 '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser',
 '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p=>p&&existsSync(p));

/** Own headless process and fresh profile; never attaches to the user's browser. */
export async function launchChrome(profile,url,{width=1100,height=1600,timeoutMs=15000}={}){
 if(!chromePath)throw Error('Set CHROME_BIN to run the browser test');
 const child=spawn(chromePath,['--headless=new','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check',`--window-size=${width},${height}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket,seq=0;const pending=new Map();
 try{
  let port;for(let i=0;i<100;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]}catch{}if(port)break;if(child.exitCode!==null)break;await delay(100)}
  if(!port)throw Error('Headless Chrome did not start');
  const target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
  socket.addEventListener('message',e=>{const message=JSON.parse(e.data),request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result)}});
  socket.addEventListener('close',()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Browser connection closed'))}pending.clear()});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{if(pending.delete(id))reject(Error('Timeout '+method))},timeoutMs);timer.unref();pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url});
  const close=async()=>{await call('Browser.close').catch(()=>{});socket.close();if(child.exitCode===null){const exited=once(child,'exit');child.kill();await Promise.race([exited,delay(3000)])}};
  return {call,evaluate,close};
 }catch(error){socket?.close();child.kill();throw error}
}
