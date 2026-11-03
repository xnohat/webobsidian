import type {PDFViewer,EventBus} from 'pdfjs-dist/web/pdf_viewer.mjs';

type TextRange=[number,number,number,number];
type Highlight={type:'text';range:TextRange}|{type:'annotation';id:string};
export interface PdfFragment {page?:number;offset?:[number|null,number|null,number|null];highlight?:Highlight}

/** Obsidian's item/character coordinates are independent of search or DOM selection. */
export function parsePdfFragment(fragment:string):PdfFragment {
 const params=new URLSearchParams(fragment.replace(/^#/,''));
 if(!params.has('page'))return {};
 const number=(value:string|null)=>value!==null&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
 const requested=number(params.get('page')),page=requested!==null&&Number.isSafeInteger(requested)&&requested>0?requested:1;
 const result:PdfFragment={page};
 if(params.has('offset')){
  const raw=params.get('offset')!.split(',');
  if(raw.length<=3&&raw.every(value=>!value.trim()||number(value)!==null)){
   const [x=null,y=null,zoom=null]=raw.map(number);
   if(zoom===null||zoom>0)result.offset=[x,y,zoom];
  }
 }
 if(params.has('annotation'))result.highlight={type:'annotation',id:params.get('annotation')!};
 else if(params.has('selection')){
  const raw=params.get('selection')!.split(','),range=raw.map(number);
  if(range.length===4&&range.every(n=>n!==null&&Number.isSafeInteger(n)&&n>=0)){
   const [a,b,c,d]=range as TextRange;
   if(a<c||(a===c&&b<d))result.highlight={type:'text',range:[a,b,c,d]};
  }
 }
 return result;
}

/** Each viewer owns its event listeners, highlights and pending navigation. */
export function mountPdfFragment(root:HTMLElement,container:HTMLElement,pdf:PDFViewer,events:EventBus,target:PdfFragment):()=>void {
 const page=target.page,highlight=target.highlight;
 if(!page||!highlight)return ()=>{};
 let destroyed=false,revealed=false,frame=0,annotationRequest=0;
 const textMarkers:HTMLElement[]=[];
 let annotationMarker:HTMLElement|undefined;
 const clearText=()=>{for(const marker of textMarkers){const parent=marker.parentNode;marker.replaceWith(document.createTextNode(marker.textContent??''));parent?.normalize()}textMarkers.length=0};
 const reveal=(element:HTMLElement)=>{
  if(revealed)return;revealed=true;
  frame=requestAnimationFrame(()=>{
   frame=0;if(destroyed||!root.contains(element))return;
   const rect=element.getBoundingClientRect(),box=container.getBoundingClientRect();
   container.scrollTop+=rect.top-box.top-50;
   if(rect.left<box.left||rect.right>box.right)container.scrollLeft+=rect.left-box.left-20;
  });
 };
 const text=({pageNumber}:{pageNumber:number})=>{
  if(destroyed||pageNumber!==page||highlight.type!=='text')return;
  clearText();
  const mapping=pdf.getPageView(page-1)?.textLayer?.highlighter;
  const divs=mapping?.textDivs,strings=mapping?.textContentItemsStr;
  if(!divs||!strings)return;
  const [start,startOffset,end,endOffset]=highlight.range;
  if(end>=strings.length||startOffset>strings[start]?.length||endOffset>strings[end]?.length)return;
  // Validate the entire mapping before making any change to the text layer.
  for(let index=start;index<=end;index++)if(!(divs[index] instanceof HTMLElement))return;
  for(let index=start;index<=end;index++){
   const from=index===start?startOffset:0,to=index===end?endOffset:strings[index].length;
   if(from===to)continue;
   const span=document.createElement('span');span.className='pdf-fragment-selection';span.textContent=strings[index].slice(from,to);
   (divs[index] as HTMLElement).replaceChildren(document.createTextNode(strings[index].slice(0,from)),span,document.createTextNode(strings[index].slice(to)));
   textMarkers.push(span);
  }
  if(textMarkers[0])reveal(textMarkers[0]);
 };
 const annotation=async({pageNumber}:{pageNumber:number})=>{
  if(destroyed||pageNumber!==page||highlight.type!=='annotation')return;
  const request=++annotationRequest,view=pdf.getPageView(page-1);
  if(!view?.pdfPage)return;
  const records:{id:string;rect:number[]}[]=await view.pdfPage.getAnnotations({intent:'display'});
  if(destroyed||request!==annotationRequest||!root.contains(view.div))return;
  const record=records.find(item=>item.id===highlight.id);
  if(!record||record.rect.length!==4||!record.rect.every(Number.isFinite))return;
  const bounds=view.viewport.convertToViewportRectangle(record.rect),left=Math.min(bounds[0],bounds[2]),top=Math.min(bounds[1],bounds[3]);
  annotationMarker?.remove();
  const marker=document.createElement('div');marker.className='pdf-fragment-annotation';marker.setAttribute('aria-hidden','true');
  Object.assign(marker.style,{left:left-8+'px',top:top-8+'px',width:Math.abs(bounds[2]-bounds[0])+16+'px',height:Math.abs(bounds[3]-bounds[1])+16+'px'});
  view.div.append(marker);annotationMarker=marker;reveal(marker);
 };
 const onAnnotation=(event:{pageNumber:number})=>{void annotation(event).catch(()=>{})};
 events.on('textlayerrendered',text);events.on('annotationlayerrendered',onAnnotation);
 return ()=>{destroyed=true;annotationRequest++;cancelAnimationFrame(frame);events.off('textlayerrendered',text);events.off('annotationlayerrendered',onAnnotation);clearText();annotationMarker?.remove()};
}
