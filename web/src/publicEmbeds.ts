/** Read-only enhancement of SSR shares. No store, authenticated API or SPA boot. */
import {mountPdfEmbeds} from './lib/pdfEmbeds';
import {createCanvasPreview,destroyCanvasEmbed} from './lib/canvasEmbedView';
import {findRenderedNoteFragment} from './lib/noteFragments';

const root=document.querySelector<HTMLElement>('.public-page[data-public-share]');
if(root){
  // Only renderer-generated note containers retain this attribute. Raw note
  // HTML loses data-public-share in the shared sanitizer.
  const scopeOf=(link:HTMLElement)=>link.closest<HTMLElement>('[data-public-share]')?.dataset.publicShare;
  const scopedFile=(link:HTMLAnchorElement)=>{
    try{
      const url=new URL(link.href,location.href);
      const id=scopeOf(link);
      return id&&url.origin===location.origin&&url.pathname===`/public/shares/${encodeURIComponent(id)}/file`?url:null;
    }catch{return null}
  };
  // Raw note HTML can carry look-alike classes. Only its own share's file endpoint
  // may supply viewer bytes; it checks the attachment allowlist on every read.
  const links=[...root.querySelectorAll<HTMLAnchorElement>('a.pdf-embed[data-href],a.canvas-embed[data-href]')];
  for(const link of links)if(!scopedFile(link)){link.classList.remove('pdf-embed','canvas-embed');link.removeAttribute('data-href')}
  const disposePdfs=mountPdfEmbeds(root,'');
  const canvases:HTMLElement[]=[];
  for(const link of links){
    if(!link.isConnected||!link.classList.contains('canvas-embed'))continue;
    const url=scopedFile(link),target=link.dataset.href;if(!url||!target)continue;
    const viewer=new URL(`/share/${encodeURIComponent(scopeOf(link)!)}/canvas`,location.origin);
    viewer.searchParams.set('path',url.searchParams.get('path')??'');
    let displayName:string|undefined;
    if(link.dataset.linkKind==='markdown')try{displayName=decodeURIComponent(target).split('/').pop()?.replace(/\.canvas$/i,'')}catch{}
    const preview=createCanvasPreview(target,async signal=>{
      const response=await fetch(url,{signal,credentials:'same-origin'});
      if(!response.ok)throw Error('Canvas unavailable');
      return response.text();
    },()=>location.assign(viewer),displayName);
    canvases.push(preview);link.replaceWith(preview);
  }
  const scrollToSection=()=>{
    let fragment='';try{fragment=decodeURIComponent(location.hash.slice(1))}catch{return}
    if(!fragment){root.querySelector<HTMLElement>(':scope > .markdown-preview')?.scrollTo({top:0});return}
    findRenderedNoteFragment(root,fragment)?.scrollIntoView({block:'start'});
  };
  requestAnimationFrame(()=>requestAnimationFrame(scrollToSection));
  window.addEventListener('hashchange',scrollToSection);
  window.addEventListener('pagehide',event=>{
    // Back/Forward may restore this exact DOM without executing the module again.
    if(event.persisted)return;
    disposePdfs();canvases.forEach(destroyCanvasEmbed);
  });
}
