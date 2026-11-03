export {noteFragmentRange} from '../../../server/src/services/markdownContext';

/** Find a target in this note, ignoring transcluded children and Canvas cards. */
export function findRenderedNoteFragment(root:HTMLElement,fragment:string):HTMLElement|undefined{
  const own=(element:HTMLElement)=>!element.closest('.embed-note,.canvas-node');
  if(/^\^[a-zA-Z0-9-]+$/.test(fragment))return [...root.querySelectorAll<HTMLElement>('[data-block-id]')].find(el=>own(el)&&el.dataset.blockId===fragment.slice(1));
  if(!fragment)return;
  const headings=[...root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].filter(own);
  const normalize=(value:string)=>value.trim().normalize('NFC').toLowerCase();
  let start=-1,end=headings.length;
  for(const part of fragment.split('#')){
    if(!part)return;
    const index=headings.findIndex((h,i)=>i>start&&i<end&&normalize(h.textContent??'')===normalize(part));
    if(index<0)return;start=index;
    const next=headings.findIndex((h,i)=>i>index&&Number(h.tagName.slice(1))<=Number(headings[index].tagName.slice(1)));
    end=next<0?headings.length:next;
  }
  return headings[start];
}
