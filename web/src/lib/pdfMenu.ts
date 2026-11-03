export interface PdfMenuItem{
 label:string;run?:()=>void|Promise<void>;disabled?:boolean;checked?:boolean;
 children?:PdfMenuItem[];hint?:string;icon?:string;separatorBefore?:boolean;radio?:boolean;
}

const icons:Record<string,string>={
 width:'<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>',height:'<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>',
 single:'<rect x="6" y="3" width="12" height="18" rx="1"/>',spread:'<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>',
 theme:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
 thumbnails:'<rect x="3" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><path d="M13 5h8M13 9h5M13 17h8M13 21h5"/>',
 outline:'<path d="M4 5h16M8 10h12M8 15h12M4 20h16"/>',reveal:'<circle cx="12" cy="12" r="7"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
 tab:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M12 11v6M9 14h6"/>',split:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M13 4v16"/>',
 window:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M14 2h8v8"/>',rename:'<path d="m4 16 11-11 4 4L8 20H4zM13 7l4 4"/>',
 folder:'<path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3"/>',bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',link:'<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
};

/** A local top-layer menu: PDF vendor styles and editor events cannot own it. */
export function openPdfMenu(anchor:HTMLButtonElement,label:string,items:PdfMenuItem[],onError:(error:unknown)=>void):()=>void{
 const host=document.createElement('div');host.className='pdf-menu-host';host.popover='manual';
 const owner=anchor.closest('.pdf-reader')!;owner.append(host);
 const panels:HTMLElement[]=[];let closed=false;
 anchor.setAttribute('aria-expanded','true');
 const close=(restore=true)=>{
  if(closed)return;closed=true;
  document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keys,true);
  window.removeEventListener('resize',dismiss);host.remove();anchor.setAttribute('aria-expanded','false');
  if(restore&&anchor.isConnected)anchor.focus({preventScroll:true});
 };
 const dismiss=()=>close(false);
 const outside=(e:Event)=>{if(!host.contains(e.target as Node)&&!anchor.contains(e.target as Node))close(false)};
 const buttons=(panel:HTMLElement)=>[...panel.querySelectorAll<HTMLButtonElement>(':scope > button')].filter(b=>!b.disabled);
 const show=(entries:PdfMenuItem[],rect:DOMRect,depth=0)=>{
  while(panels.length>depth)panels.pop()!.remove();
  const panel=document.createElement('div');panel.className='pdf-menu-panel';panel.setAttribute('role','menu');panel.setAttribute('aria-label',label);host.append(panel);panels.push(panel);
  for(const item of entries){
   if(item.separatorBefore){const separator=document.createElement('div');separator.className='pdf-menu-separator';separator.setAttribute('role','separator');panel.append(separator)}
   const button=document.createElement('button');button.type='button';button.dataset.label=item.label;button.disabled=!!item.disabled;
   button.setAttribute('role',item.checked===undefined?'menuitem':item.radio?'menuitemradio':'menuitemcheckbox');
   if(item.checked!==undefined)button.setAttribute('aria-checked',String(item.checked));
   const mark=document.createElement('span');mark.className='pdf-menu-check';mark.setAttribute('aria-hidden','true');mark.dataset.checked=String(!!item.checked);
   const icon=document.createElement('span');icon.className='pdf-menu-icon';icon.setAttribute('aria-hidden','true');
   if(item.icon&&icons[item.icon])icon.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${icons[item.icon]}</svg>`;
   const text=document.createElement('span');text.textContent=item.label;button.append(icon,text,mark);
   if(item.hint)button.title=item.hint;
   if(item.children){button.setAttribute('aria-haspopup','menu');const arrow=document.createElement('span');arrow.className='pdf-menu-arrow';arrow.textContent='›';button.append(arrow)}
   const enter=()=>{if(item.children&&!button.disabled)show(item.children,button.getBoundingClientRect(),depth+1);else while(panels.length>depth+1)panels.pop()!.remove()};
   button.onmouseenter=enter;
   button.onclick=()=>{
    if(item.children){enter();buttons(panels[depth+1])[0]?.focus();return}
    close();try{void Promise.resolve(item.run?.()).catch(onError)}catch(error){onError(error)}
   };
   button.onkeydown=e=>{if(e.key==='ArrowRight'&&item.children){e.preventDefault();enter();buttons(panels[depth+1])[0]?.focus()}};
   panel.append(button);
  }
  const bounds=panel.getBoundingClientRect(),margin=8;
  const x=depth?(rect.right+bounds.width<=innerWidth-margin?rect.right:rect.left-bounds.width):rect.left;
  panel.style.left=Math.max(margin,Math.min(x,innerWidth-bounds.width-margin))+'px';
  panel.style.top=Math.max(margin,Math.min(depth?rect.top:rect.bottom,innerHeight-bounds.height-margin))+'px';
  return panel;
 };
 const keys=(e:KeyboardEvent)=>{
  if(e.key==='Escape'||e.key==='Tab'){if(e.key==='Escape')e.preventDefault();e.stopPropagation();close();return}
  const current=panels.find(p=>p.contains(document.activeElement))??panels.at(-1)!;
  const enabled=buttons(current),index=enabled.indexOf(document.activeElement as HTMLButtonElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   e.preventDefault();e.stopPropagation();
   const next=e.key==='Home'?0:e.key==='End'?enabled.length-1:(index+(e.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length;
   enabled[next]?.focus();
  }else if(e.key==='ArrowLeft'&&panels.length>1){e.preventDefault();panels.pop()!.remove();buttons(panels.at(-1)!)[0]?.focus()}
 };
 if(typeof host.showPopover==='function')host.showPopover();
 const panel=show(items,anchor.getBoundingClientRect());buttons(panel)[0]?.focus({preventScroll:true});
 document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keys,true);window.addEventListener('resize',dismiss);
 return ()=>close(false);
}
