/** Open the source note without letting the editor move its selection. */
export function createNoteEmbedOpenButton(target:string,open:(target:string,kind:'wiki'|'markdown')=>void,kind:'wiki'|'markdown'='wiki'):HTMLButtonElement{
  const button=document.createElement('button');
  button.type='button';
  button.className='markdown-embed-link';
  button.title='Open embedded note';
  button.setAttribute('aria-label','Open embedded note');
  button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6m0-6-7 7M9 21H3v-6m0 6 7-7"/></svg>';
  button.addEventListener('mousedown',e=>e.stopPropagation());
  button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open(target,kind)});
  return button;
}

/** Hydrate note containers produced by the shared Markdown renderer. */
export function addNoteEmbedOpenButtons(root:HTMLElement,open:(target:string,kind:'wiki'|'markdown')=>void):void{
  for(const embed of root.querySelectorAll<HTMLElement>('.embed-note[data-embed-target]')){
    if(embed.querySelector(':scope > .markdown-embed-link'))continue;
    embed.prepend(createNoteEmbedOpenButton(embed.dataset.embedTarget!,open,embed.dataset.embedKind==='markdown'?'markdown':'wiki'));
  }
}
