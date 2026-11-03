import type {Mounted,MathResolver} from 'pele';
import {useStore} from './store';

let library:Promise<typeof import('pele')>|undefined;
let mathLibrary:Promise<typeof import('katex')['default']>|undefined;
const loadPele=()=>library??=import('pele');
const loadMath=()=>mathLibrary??=Promise.all([import('katex'),import('katex/dist/katex.min.css')]).then(([k])=>k.default);

export interface DiagramOptions{
 sourcePath?:string;
 onRender?:()=>void;
}

/** One mount owns Pele's resize observer, zoom handlers and async loading. */
export function mountDiagram(element:HTMLElement,source:string,options:DiagramOptions={}):()=>void{
 const content=document.createElement('div');content.className='diagram-content';element.append(content);
 let disposed=false,mounted:Mounted|undefined;
 const navigate=(event:MouseEvent)=>{
  const anchor=(event.target as Element).closest('a');if(!anchor)return;
  event.preventDefault();event.stopPropagation();
  if(anchor.classList.contains('internal-link')){
   const target=anchor.getAttribute('data-href');
   if(target)void useStore.getState().openWikilink(target,'wiki',options.sourcePath);
  }else{
   const href=anchor.getAttribute('href');if(!href)return;
   const url=new URL(href,element.ownerDocument.baseURI);
   if(/^(https?:|mailto:|tel:)$/.test(url.protocol))window.open(url.href,'_blank','noopener,noreferrer');
  }
 };
 content.addEventListener('click',navigate);
 // Measure MathML in the same document/font as the labels. No persistent probe
 // or user-supplied HTML is kept; malformed/unsupported TeX remains plain text.
 const math=(katex:Awaited<ReturnType<typeof loadMath>>):MathResolver=>(tex,size)=>{
  const probe=element.ownerDocument.createElement('div');
  probe.style.cssText='position:fixed;left:-99999px;top:0;visibility:hidden;display:inline-block;white-space:nowrap;pointer-events:none';
  probe.style.fontSize=size+'px';probe.style.fontFamily=getComputedStyle(content).fontFamily;
  try{
   probe.innerHTML=katex.renderToString(tex,{displayMode:true,output:'mathml',throwOnError:true,trust:false});
   element.ownerDocument.body.append(probe);
   const expression=probe.querySelector('math');if(!expression)return null;
   const {width,height}=expression.getBoundingClientRect();
   return width>0&&height>0?{html:expression.outerHTML,width,height}:null;
  }catch{return null}finally{probe.remove()}
 };
 void Promise.all([loadPele(),source.includes('$$')?loadMath():undefined]).then(([pele,katex])=>{
  if(disposed)return;
  mounted=pele.mount(content,source,{
   // Canvas owns panning and zoom; diagram gestures must not compete with it.
   zoom:element.closest('.canvas-view')?false:'auto',
   math:katex?math(katex):undefined,
   onRender:()=>{
    for(const anchor of content.querySelectorAll('a:not(.internal-link)')){
     anchor.classList.add('external-link');anchor.setAttribute('target','_blank');anchor.setAttribute('rel','noopener noreferrer');
    }
    options.onRender?.();
   },
   onError:()=>options.onRender?.(),
  });
 }).catch(error=>{
  if(disposed)return;
  content.classList.add('mod-error');content.textContent=String(error?.message??error);options.onRender?.();
 });
 return()=>{disposed=true;mounted?.destroy();content.removeEventListener('click',navigate)};
}

/** Hydrate sanitized Markdown, including diagrams inside embedded notes. */
export function mountDiagramBlocks(root:HTMLElement,sourcePath?:string):()=>void{
 const disposers:Array<()=>void>=[];
 for(const code of root.querySelectorAll<HTMLElement>('pre > code.language-mermaid')){
  const pre=code.parentElement!,element=document.createElement('div');element.className='mermaid';
  const origin=code.closest<HTMLElement>('[data-embed-source]')?.dataset.embedSource??sourcePath;
  pre.replaceWith(element);
  disposers.push(mountDiagram(element,code.textContent??'',{sourcePath:origin}));
 }
 return()=>{for(const dispose of disposers)dispose()};
}
