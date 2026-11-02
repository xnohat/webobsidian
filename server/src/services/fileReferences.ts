import path from 'node:path';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
export interface FileReference {target:string;from:number;to:number;kind:'wiki'|'markdown'|'canvas'|'html'}
type Node={type:string;url?:string;children?:Node[];position?:{start:{offset?:number};end:{offset?:number}}};
export function parseFileReferences(content:string,canvas=false):FileReference[]{
 const refs:FileReference[]=[];
 if(canvas){for(const m of content.matchAll(/"file"\s*:\s*"((?:\\.|[^"\\])*)"/g)){const start=m.index!+m[0].indexOf('"',m[0].indexOf(':'))+1;refs.push({target:JSON.parse('"'+m[1]+'"'),from:start,to:start+m[1].length,kind:'canvas'});}return refs;}
 const tree=unified().use(remarkParse).parse(content) as Node;const blocked:[number,number][]=[];
 const walk=(n:Node)=>{const from=n.position?.start.offset,to=n.position?.end.offset;
  if(from!==undefined&&to!==undefined){
   if(n.type==='code'||n.type==='inlineCode'||n.type==='html')blocked.push([from,to]);
   if(n.type==='html'){
    const chunk=content.slice(from,to);
    for(const m of chunk.matchAll(/\b(?:srcset|src|href|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)){
     const value=m[1]??m[2]??m[3];const offset=m[0].indexOf('=')+1;const start=m.index!+offset+m[0].slice(offset).indexOf(value);
     const target=value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,e=>{const names:Record<string,string>={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};return names[e.toLowerCase()]??String.fromCodePoint(parseInt(e.slice(2,-1).replace(/^x/i,''),/^&#x/i.test(e)?16:10));});
     if(/^srcset/i.test(m[0])){let offset=0;for(const part of value.split(',')){const url=part.trim().split(/\s+/)[0];if(url){const at=part.indexOf(url);refs.push({target:url,from:from+start+offset+at,to:from+start+offset+at+url.length,kind:'html'});}offset+=part.length+1;}}else refs.push({target,from:from+start,to:from+start+value.length,kind:'html'});
    }
   }
   if(n.url!==undefined){const chunk=content.slice(from,to);let at=n.type==='definition'?chunk.indexOf(']:')+2:chunk.indexOf('](')+2;
    if(at>0){while(/\s/.test(chunk[at]??'')&&at<chunk.length)at++;let end=at;
     if(chunk[at]==='<'){at++;end=chunk.indexOf('>',at);}else{let depth=0;while(end<chunk.length){const c=chunk[end];if(c==='\\'){end+=2;continue;}if(c==='(')depth++;if(c===')'){if(!depth)break;depth--;}if(!depth&&/\s/.test(c))break;end++;}}
     if(end>at)refs.push({target:n.url,from:from+at,to:from+end,kind:'markdown'});
    }
   }
  }n.children?.forEach(walk);
 };walk(tree);
 for(const m of content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)){if(blocked.some(([a,b])=>m.index!>=a&&m.index!<b))continue;refs.push({target:m[1],from:m.index!+2,to:m.index!+2+m[1].length,kind:'wiki'});}
 return refs.sort((a,b)=>a.from-b.from);
}
export function resolveReference(target:string,sourcePath:string,paths:string[],kind:FileReference['kind']='markdown'):string|null{
 const raw=target.split('#')[0];
 if(!raw)return target.startsWith('#')&&paths.includes(sourcePath)?sourcePath:null;
 if(/^[a-z][a-z\d+.-]*:/i.test(raw)||raw.startsWith('//'))return null;
 if(kind==='wiki'){const literal=resolveReference(raw.split('/').map(s=>encodeURIComponent(s)).join('/'),sourcePath,paths,'markdown');if(literal)return literal;}
 let decoded:string;try{decoded=decodeURIComponent(raw);}catch{decoded=raw;}
 const candidates=[...(decoded.startsWith('/')?[]:[path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath),decoded))]),path.posix.normalize(decoded.replace(/^\/+/ ,''))];
 for(const c of candidates)for(const value of [c,c+'.md',c+'.markdown']){if(paths.includes(value))return value;const ci=paths.find(p=>p.toLowerCase()===value.toLowerCase());if(ci)return ci;}
 const stem=decoded.replace(/^\/+/, '').toLowerCase().replace(/\.(md|markdown)$/i,'');
 const suffix=paths.filter(p=>p.toLowerCase().replace(/\.(md|markdown)$/i,'').endsWith('/'+stem));if(suffix.length===1)return suffix[0];
 return [...paths].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b)).find(p=>p.toLowerCase().replace(/\.(md|markdown)$/i,'')===stem||path.posix.basename(p).toLowerCase().replace(/\.(md|markdown)$/i,'')===stem)||null;
}
