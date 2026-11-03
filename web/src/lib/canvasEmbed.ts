import {api} from './api';
import {createCanvasPreview,destroyCanvasEmbed} from './canvasEmbedView';
export {destroyCanvasEmbed} from './canvasEmbedView';

export function createCanvasEmbed(target:string,origin:string,onOpen:(target:string,origin:string,kind:'wiki'|'markdown')=>void,kind:'wiki'|'markdown'='wiki'):HTMLElement{
  let title=target;if(kind==='markdown')try{title=decodeURIComponent(target)}catch{}
  return createCanvasPreview(title,async signal=>{
    const resolved=await api.resolve(target,origin,kind);
    if(signal.aborted)throw Error('Canvas load cancelled');
    if(!resolved.path)throw Error('Canvas not found');
    const result=await api.read(resolved.path);
    return typeof result==='string'?result:result.content;
  },()=>onOpen(target,origin,kind),kind==='markdown'?title.split('/').pop()?.replace(/\.canvas$/i,''):undefined);
}

export function mountCanvasEmbeds(root:HTMLElement,fallbackOrigin:string,onOpen:(target:string,origin:string,kind:'wiki'|'markdown')=>void):()=>void{
  const embeds:HTMLElement[]=[];
  for(const link of root.querySelectorAll<HTMLAnchorElement>('a.canvas-embed[data-href]')){
    const target=link.dataset.href;if(!target)continue;
    let origin=link.closest<HTMLElement>('[data-embed-source]')?.dataset.embedSource??fallbackOrigin;
    try{const url=new URL(link.href,document.baseURI);if(url.origin===location.origin)origin=url.searchParams.get('from')??origin}catch{}
    const embed=createCanvasEmbed(target,origin,onOpen,link.dataset.linkKind==='markdown'?'markdown':'wiki');embeds.push(embed);link.replaceWith(embed);
  }
  return ()=>embeds.forEach(destroyCanvasEmbed);
}
