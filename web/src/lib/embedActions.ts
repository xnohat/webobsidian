import {EditorView} from '@codemirror/view';
import {openLightbox} from './imageLightbox';
import {markdownImages} from '../../../server/src/services/markdownContext';

const icons={
  zoom:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/>',
  source:'<path d="m16 18 6-6-6-6M8 6l-6 6 6 6M14 4l-4 16"/>',
};

export function embedAction(label:string,icon:keyof typeof icons,action:()=>void):HTMLButtonElement{
  const button=document.createElement('button');button.type='button';button.className='embed-action';button.title=label;button.setAttribute('aria-label',label);
  button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[icon]}</svg>`;
  button.onmousedown=e=>{e.preventDefault();e.stopPropagation()};
  button.onclick=e=>{e.preventDefault();e.stopPropagation();action()};return button;
}

/** Source ranges are parser-owned, including reference images and parentheses. */
export function embedTokenAt(view:EditorView,dom:HTMLElement,sourceVisible:boolean):{from:number;to:number;source:string}|null{
  const pos=view.posAtDOM(dom),source=view.state.doc.toString();
  const image=markdownImages(source).find(m=>sourceVisible?m.to===pos:m.from===pos);
  if(image)return {...image,source:source.slice(image.from,image.to)};
  const line=view.state.doc.lineAt(pos);
  const wiki=[...line.text.matchAll(/!\[\[[^\]]+\]\]/g)].find(m=>sourceVisible?line.from+m.index!+m[0].length===pos:line.from+m.index! === pos);
  return wiki?{from:line.from+wiki.index!,to:line.from+wiki.index!+wiki[0].length,source:wiki[0]}:null;
}

export function imageLabelEnd(source:string):number{
  let depth=1;for(let i=2;i<source.length;i++){if(source[i]==='\\'){i++;continue}if(source[i]==='[')depth++;if(source[i]===']'&&!--depth)return i}return -1;
}

/** A replacement widget starts at its token; a source-visible widget follows it. */
export function revealEmbedSource(view:EditorView,dom:HTMLElement,sourceVisible:boolean,selectTarget=false):void{
  if(view.state.readOnly)return;
  const match=embedTokenAt(view,dom,sourceVisible);
  if(!match)return;
  let {from,to}=match;
  if(selectTarget){
    const token=match.source;
    if(token.startsWith('![[')){const target=token.slice(3,-2).split('|')[0];from+=3;to=from+target.length}
    else{const close=imageLabelEnd(token);if(token[close+1]==='('){let offset=close+2,target=token.slice(offset,-1);offset+=target.length-target.trimStart().length;target=target.trimStart().replace(/\s+(?:"[^"]*"|'[^']*')$/,'').trimEnd();if(target.startsWith('<')&&target.endsWith('>')){offset+=1;target=target.slice(1,-1)}from+=offset;to=from+target.length}}
  }
  view.dispatch({selection:{anchor:from,head:to},effects:EditorView.scrollIntoView(from),userEvent:'select'});view.focus();
}

export function imageActions(wrap:HTMLElement,img:HTMLImageElement,onEdit?:()=>void):void{
  const actions=document.createElement('span');actions.className='embed-actions';
  actions.append(embedAction('Zoom image','zoom',()=>openLightbox(img.currentSrc||img.src,img.alt)));
  if(onEdit)actions.append(embedAction('Edit embed','source',onEdit));wrap.append(actions);
}

/** Reading and transcluded HTML use the same zoom action as Live Preview. */
export function mountImageActions(root:HTMLElement):void{
  for(const img of root.querySelectorAll<HTMLImageElement>('img')){
    if(img.closest('.pdf-reader,.canvas-embed,.cm-image-wrap,.image-embed-wrap'))continue;
    const wrap=document.createElement('span');wrap.className='image-embed-wrap';img.replaceWith(wrap);wrap.append(img);imageActions(wrap,img);
  }
}
