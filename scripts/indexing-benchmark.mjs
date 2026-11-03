import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {performance} from 'node:perf_hooks';

const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:Number(args[i+1]);};
const count=option('--notes',10000), cycles=option('--cycles',10);
if(!Number.isInteger(count)||count<10||!Number.isInteger(cycles)||cycles<0)throw Error('Use --notes >=10 and --cycles >=0');
const base=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const body=(id,bytes,round=0)=>{
 const header=`---\ntags: [benchmark]\n---\n# Note ${id}\n[[note-0]]\ncycle${round} identifier${id}\n`;
 return header+'stable benchmark text with searchable words and repeated content. '.repeat(Math.ceil((bytes-header.length)/66)).slice(0,bytes-header.length);
};

if(args.includes('--worker')){
 const fixture=process.env.INDEXING_BENCHMARK_DIR;
 if(!fixture)throw Error('Missing isolated fixture');
 const vault=path.join(fixture,'vault');
 process.env.DATA_DIR=path.join(fixture,'data');process.env.VAULT_PATH=vault;process.env.ALLOWED_ROOTS=fixture;
 const {IndexCoordinator}=await import(args.includes('--compiled')?'../server/dist/services/indexing/coordinator.js':'../server/src/services/indexing/coordinator.ts');
 const searchModule=await import(args.includes('--compiled')?'../server/dist/services/search.js':'../server/src/services/search.ts');
 const coordinator=new IndexCoordinator({watch:false,snapshotPath:path.join(fixture,'snapshot.json'),reconcileMs:3600000,auditMs:3600000});
 let reads=0,peakHeap=0;const open=fs.open;
 fs.open=async function(file,...rest){if(typeof file==='string'&&file.endsWith('.md')&&rest[0]==='r')reads++;return open.call(this,file,...rest)};
 const server=http.createServer((_req,res)=>res.end(JSON.stringify(coordinator.status())));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}`;
 const latencies=[];let probing=true;
 const probe=(async()=>{while(probing){const at=performance.now();await fetch(url).then(r=>r.text());latencies.push(performance.now()-at);peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);await new Promise(r=>setTimeout(r,10));}})();
 const at=performance.now();await coordinator.start(vault);await coordinator.settled();
 const initialMs=performance.now()-at, initialReads=reads;
 if(!coordinator.status().initialScanComplete)throw Error('Initial reconciliation failed');
 if(coordinator.status().indexedNotes!==count+100)throw Error('Published index count differs from the generated fixture');
 if(args.includes('--warm')&&initialReads!==0)throw Error('Warm reconciliation unexpectedly read unchanged Markdown bodies');
 if(coordinator.status().persistenceError)throw Error('Snapshot persistence failed');
 const churn=[];
 if(args.includes('--churn')){
  const changed=Math.ceil(count*.2);
  for(let cycle=0;cycle<cycles;cycle++){
   const began=performance.now();
   for(let i=0;i<changed;i++){
    const rel=`note-${i}.md`,file=path.join(vault,rel);
    await fs.unlink(file);await fs.writeFile(file,body(i,4096,cycle+1));
    coordinator.notify({root:vault,paths:[rel],source:'web'});
   }
   await coordinator.settled();
   const {jobId}=coordinator.requestJob('rebuild');await coordinator.waitForJob(jobId);await coordinator.settled();
   // Reopen between cycles to expose garbage carried across persistent generations.
   await coordinator.close();await coordinator.start(vault);await coordinator.settled();
   if(coordinator.status().indexedNotes!==count+100||!coordinator.status().initialScanComplete||coordinator.status().persistenceError)throw Error('Churn restart lost notes or could not persist/reconcile');
   const mem=process.memoryUsage();churn.push({cycle:cycle+1,ms:performance.now()-began,rssMiB:mem.rss/1048576,heapMiB:mem.heapUsed/1048576,notes:coordinator.status().indexedNotes});
  }
 }
 // Query through the published facade, rather than merely counting inventory entries.
 const hits=await searchModule.qmd.search('benchmark',1);
 if(!hits.length)throw Error('Published search has no expected fixture match');
 await coordinator.close();probing=false;await probe;await new Promise(r=>server.close(r));
 fs.open=open;
 const rssMiB=process.resourceUsage().maxRSS/1024;
 console.log(JSON.stringify({mode:args.includes('--churn')?'churn':args.includes('--warm')?'warm':'cold',initialMs,initialReads,notes:coordinator.status().indexedNotes,peakRssMiB:rssMiB,peakObservedHeapMiB:peakHeap/1048576,httpProbeCount:latencies.length,httpMaxMs:Math.max(...latencies),httpP95Ms:latencies.sort((a,b)=>a-b)[Math.floor(latencies.length*.95)],churn,within384MiB:rssMiB<=384}));
 if(rssMiB>384)process.exitCode=2;
}else{
 const fixture=await fs.mkdtemp(path.join(tmpdir(),'webo-index-benchmark-'));
 try{
  const vault=path.join(fixture,'vault');await fs.mkdir(vault);
  for(let start=0;start<count;start+=100)await Promise.all(Array.from({length:Math.min(100,count-start)},(_,j)=>fs.writeFile(path.join(vault,`note-${start+j}.md`),body(start+j,4096))));
  for(let i=0;i<100;i++)await fs.writeFile(path.join(vault,`large-${i}.md`),body(`large${i}`,131072));
  console.log(JSON.stringify({node:process.version,platform:process.platform,notes:count,largeNotes:100,cycles,heapLimitMiB:256,storage:'local temporary directory; repeat on target NAS',httpProbe:'in-process minimal HTTP endpoint; not the full application'}));
  for(const mode of ['cold','warm',...(cycles?['churn']:[])]){
   const result=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--max-old-space-size=256',...(args.includes('--compiled')?[]:['--import','tsx']),fileURLToPath(import.meta.url),'--worker',`--${mode}`,...(args.includes('--compiled')?['--compiled']:[]),'--notes',String(count),'--cycles',String(cycles)],{cwd:base,windowsHide:true,env:{...process.env,INDEXING_BENCHMARK_DIR:fixture}});
    let out='',err='';child.stdout.on('data',b=>{out+=b});child.stderr.on('data',b=>{err+=b});child.on('error',reject);child.on('exit',code=>resolve({code,out,err}));
   });
   process.stdout.write(result.out);if(result.err)process.stderr.write(result.err);
   if(result.code!==0){process.exitCode=result.code||1;break;}
  }
 }finally{await fs.rm(fixture,{recursive:true,force:true});}
}
