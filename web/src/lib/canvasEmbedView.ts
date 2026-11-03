import {parseCanvas,nodesBBox,sideAnchor,autoSides,edgePath,PRESET_COLORS,type CanvasNode,type CanvasSide} from './canvas';

const cleanups=new WeakMap<HTMLElement,()=>void>();
const sides=new Set<CanvasSide>(['left','right','top','bottom']);
const color=(value?:string)=>value&&PRESET_COLORS[value]||value&&/^#[\da-f]{6}$/i.test(value)&&value||'var(--text-muted)';
const svgElement=<K extends keyof SVGElementTagNameMap>(name:K,attrs:Record<string,string|number>)=>{
  const el=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));
  return el;
};

/** Native Canvas embeds are minimaps: geometry only, without card contents. */
function minimap(raw:string):SVGSVGElement{
  const data=parseCanvas(raw);
  const nodes=data.nodes.filter((n):n is CanvasNode=>!!n&&typeof n.id==='string'&&['x','y','width','height'].every(k=>Number.isFinite(n[k as keyof CanvasNode]))&&n.width>0&&n.height>0);
  const bounds=nodesBBox(nodes)??{x:0,y:0,width:500,height:300};
  const pad=Math.max(bounds.width,bounds.height)*.05;
  const svg=svgElement('svg',{class:'canvas-minimap',viewBox:`${bounds.x-pad} ${bounds.y-pad} ${bounds.width+pad*2} ${bounds.height+pad*2}`,role:'img','aria-label':'Canvas preview'});
  const rect=(n:CanvasNode)=>{
    const el=svgElement('rect',{x:n.x,y:n.y,width:n.width,height:n.height,rx:20,ry:20});
    el.style.fill=color(n.color);el.style.stroke=color(n.color);svg.append(el);
  };
  nodes.filter(n=>n.type==='group').forEach(rect);
  const byId=new Map(nodes.map(n=>[n.id,n]));
  for(const edge of data.edges){
    if(!edge)continue;
    const from=byId.get(edge.fromNode),to=byId.get(edge.toNode);if(!from||!to)continue;
    const auto=autoSides(from,to),fromSide=edge.fromSide&&sides.has(edge.fromSide)?edge.fromSide:auto.from,toSide=edge.toSide&&sides.has(edge.toSide)?edge.toSide:auto.to;
    const line=svgElement('path',{d:edgePath(sideAnchor(from,fromSide),fromSide,sideAnchor(to,toSide),toSide).d});
    line.style.stroke=color(edge.color);svg.append(line);
  }
  nodes.filter(n=>n.type!=='group').forEach(rect);
  return svg;
}

export function createCanvasPreview(target:string,loadRaw:(signal:AbortSignal)=>Promise<string>,onOpen:()=>void,displayName?:string):HTMLElement{
  const root=document.createElement('div');root.className='internal-embed canvas-embed';root.dataset.ready='false';
  const title=document.createElement('button');title.type='button';title.className='embed-title';title.disabled=true;
  title.setAttribute('aria-label','Open canvas');title.title='Open canvas';
  title.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>';
  title.append(document.createTextNode(displayName??target.split('#')[0].split('/').pop()?.replace(/\.canvas$/i,'')??target));root.append(title);
  title.onmousedown=e=>e.stopPropagation();
  title.onclick=e=>{e.preventDefault();e.stopPropagation();onOpen()};
  let destroyed=false;const abort=new AbortController();cleanups.set(root,()=>{destroyed=true;abort.abort()});
  void(async()=>{
    const raw=await loadRaw(abort.signal);if(destroyed)return;
    const svg=minimap(raw);
    svg.tabIndex=0;svg.setAttribute('aria-label','Open canvas preview');
    svg.onclick=e=>{e.preventDefault();e.stopPropagation();onOpen()};
    svg.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen()}};
    root.append(svg);title.disabled=false;root.dataset.ready='true';
  })().catch(()=>{if(!destroyed){const message=document.createElement('div');message.className='cm-embed-missing';message.textContent='Could not display canvas.';root.append(message);root.dataset.ready='error'}});
  return root;
}

export function destroyCanvasEmbed(root:HTMLElement){cleanups.get(root)?.();cleanups.delete(root)}
