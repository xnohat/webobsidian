import {createPdfViewer,destroyPdfViewer} from './pdfViewer';
import type {PdfMenuItem} from './pdfMenu';

/** Hydrate PDFs in rendered Markdown, including those inside transcluded notes. */
export function mountPdfEmbeds(root:HTMLElement,fallbackOrigin:string,onOpen?:(target:string,origin:string,kind:'wiki'|'markdown')=>void,fileActions?:(target:string,origin:string,kind:'wiki'|'markdown')=>()=>Promise<PdfMenuItem[]>):()=>void{
  const readers:HTMLElement[]=[];
  for(const link of root.querySelectorAll<HTMLAnchorElement>('a.pdf-embed[data-href]')){
    const target=link.dataset.href,src=link.getAttribute('href');
    if(!target||!src)continue;
    let origin=fallbackOrigin;
    try{
      const url=new URL(src,document.baseURI);
      if(url.origin===location.origin)origin=url.searchParams.get('from')??origin;
    }catch{/* Keep the supplied note context for a non-URL fallback. */}
    const wrap=document.createElement('div');wrap.className='pdf-embed-wrap';
    const kind=link.dataset.linkKind==='markdown'?'markdown':'wiki';
    let name=target.split('/').pop()??target;if(kind==='markdown')try{name=decodeURIComponent(name)}catch{}
    const fullTarget=target+(target.includes('#')?'':src.includes('#')?src.slice(src.indexOf('#')):'');
    const reader=createPdfViewer(src,name,onOpen?()=>onOpen(fullTarget,origin,kind):undefined,undefined,{fixedHeightIncludesToolbar:false,fillContainer:!!link.closest('.public-canvas .canvas-pdf-card'),fileActions:fileActions?.(fullTarget,origin,kind),missingLabel:fullTarget});
    readers.push(reader);wrap.append(reader);link.replaceWith(wrap);
  }
  return ()=>readers.forEach(destroyPdfViewer);
}
