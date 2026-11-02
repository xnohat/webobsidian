/** Raw web frames are reconstructed after sanitization with an opaque origin. */
import {resolveExternalEmbed,EMBED_SANDBOX} from './embeds.js';
export const WEB_FRAME_SANDBOX='allow-forms allow-scripts allow-presentation';

interface HNode{
 type:string;tagName?:string;properties?:Record<string,unknown>;children?:HNode[];
}

function webUrl(value:unknown):string|null{
 if(typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value))return null;
 const input=value.trim();
 try{
  const url=new URL(input.startsWith('//')?'https:'+input:input);
  return (url.protocol==='https:'||url.protocol==='http:')&&!url.username&&!url.password?url.href:null;
 }catch{return null}
}

function dimension(value:unknown):string|undefined{
 if(typeof value!=='string'&&typeof value!=='number')return;
 const text=String(value).trim();return /^(?:\d{1,6}|\d{1,3}%)$/.test(text)?text:undefined;
}

/** Only inert link metadata crosses rehype-sanitize; raw iframe attributes do not. */
export function rehypePrepareWebFrames(){
 return (tree:HNode)=>{
  const visit=(node:HNode)=>{
   if(!node.children)return;
   node.children=node.children.flatMap(child=>{
    if(child.type==='element'&&child.tagName==='iframe'){
     const p=child.properties??{},src=webUrl(p.src);if(!src)return [];
     return [{type:'element',tagName:'a',properties:{className:['web-embed-placeholder'],href:src,dataWebFrame:'1',
      dataWebFrameWidth:dimension(p.width),dataWebFrameHeight:dimension(p.height),
      dataWebFrameFullscreen:p.allowFullScreen?'1':undefined,title:typeof p.title==='string'?p.title:'Embedded web page'},children:[]}];
    }
    visit(child);return [child];
   });
  };visit(tree);
 };
}

/** Revalidate metadata, and grant no parent origin, popup or top-navigation access. */
export function rehypeRestoreWebFrames(){
 return (tree:HNode)=>{
  const visit=(node:HNode)=>{
   if(!node.children)return;
   node.children=node.children.flatMap(child=>{
    const p=child.properties??{};
    if(child.type==='element'&&child.tagName==='a'&&p.dataWebFrame==='1'){
     const src=webUrl(p.href);if(!src)return [];
     // Rebuild known player URLs from validated IDs, using the same permissions
     // as URL-based YouTube embeds. Arbitrary authored frames stay opaque.
     const resolved=resolveExternalEmbed(src),player=resolved?.provider==='youtube'?resolved:null;
     return [{type:'element',tagName:'iframe',properties:{className:['web-embed'],src:player?.src??src,
      title:typeof p.title==='string'?p.title:'Embedded web page',width:dimension(p.dataWebFrameWidth),height:dimension(p.dataWebFrameHeight),
      sandbox:player?EMBED_SANDBOX:WEB_FRAME_SANDBOX,referrerPolicy:player?'strict-origin-when-cross-origin':'no-referrer',loading:'lazy',
      allowFullScreen:p.dataWebFrameFullscreen==='1'},children:[]}];
    }
    visit(child);return [child];
   });
  };visit(tree);
 };
}
