import {pdfLabel,bindPdfLabel} from './i18n/pdfLabels';
import {setLocalizedText} from './i18n/runtime';
import {t as uiText} from "./i18n/runtime";
/** Shared embedded PDF viewer. Documents and workers stay on this application's origin. */
import {pdfAssetBase as assets} from './pdfAssets';
import {openPdfMenu,type PdfMenuItem} from './pdfMenu';
import {parsePdfFragment,mountPdfFragment} from './pdfFragments';
import {embedAction} from './embedActions';
export type {PdfMenuItem} from './pdfMenu';
let library: Promise<{core:typeof import('pdfjs-dist'); viewer:typeof import('pdfjs-dist/web/pdf_viewer.mjs')}> | undefined;
let stylesheet: Promise<void> | undefined;
const disposers = new WeakMap<HTMLElement,()=>void>();

function loadLibrary(){
  stylesheet ??= new Promise<void>((resolve,reject)=>{
    const link=document.createElement('link');link.rel='stylesheet';link.href=assets+'pdf_viewer.css';
    link.onload=()=>resolve();link.onerror=()=>reject(Error(uiText("webobsidian.pdf-stylesheet-could-not-be-loaded-05aaba")));document.head.append(link);
  });
  library ??= (async()=>{
    const core=await import('pdfjs-dist');
    core.GlobalWorkerOptions.workerSrc=assets+'pdf.worker.min.mjs';
    const viewer=await import('pdfjs-dist/web/pdf_viewer.mjs');
    await stylesheet;return {core,viewer};
  })();
  return library;
}

const icons={
  thumbnails:'<rect x="3" y="3" width="5" height="5"/><path d="M12 4h9M12 8h6"/><rect x="3" y="13" width="5" height="5"/><path d="M12 14h9M12 18h6"/>',
  minus:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6"/>',
  plus:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
  open:'<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  code:'<path d="m16 18 6-6-6-6M8 6l-6 6 6 6M14 4l-4 16"/>',
};

export function createPdfViewer(src:string,name:string,onOpen?:()=>void,onEdit?:()=>void,options:{fixedHeightIncludesToolbar?:boolean;fillContainer?:boolean;fileActions?:()=>Promise<PdfMenuItem[]>;missingLabel?:string}={}):HTMLElement{
  const root=document.createElement('div');root.className='pdf-reader';root.dataset.ready='false';
  const fragment=src.includes('#')?src.slice(src.indexOf('#')+1):'';
  const fragmentTarget=parsePdfFragment(fragment);
  const requestedHeight=new URLSearchParams(fragment).get('height')??'';
  const fixedHeight=/^\d+$/.test(requestedHeight)?Number(requestedHeight):0;
  if(Number.isFinite(fixedHeight)&&fixedHeight>0)root.style.height=fixedHeight+'px';
  root.setAttribute('aria-label',name);if(options.fillContainer){root.classList.add('pdf-fill-container');root.style.height='100%'}
  const toolbar=document.createElement('div');toolbar.className='pdf-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label',pdfLabel("Управление PDF"));
  const button=(label:string,icon:string)=>{
    const el=document.createElement('button');el.type='button';bindPdfLabel(el,label,'title');bindPdfLabel(el,label,'aria-label');el.disabled=true;
    el.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;
    toolbar.append(el);return el;
  };
  const thumbs=button(pdfLabel("Свернуть/развернуть боковую панель"),icons.thumbnails);thumbs.setAttribute('aria-expanded','false');
  const sidebarOptions=button(pdfLabel("Параметры боковой панели"),'<path d="m6 9 6 6 6-6"/>');sidebarOptions.dataset.pdfAction='sidebar-options';
  const minus=button(pdfLabel("Уменьшить"),icons.minus),plus=button(pdfLabel("Увеличить"),icons.plus);
  thumbs.dataset.pdfAction='sidebar-toggle';minus.dataset.pdfAction='zoom-out';plus.dataset.pdfAction='zoom-in';
  const displayOptions=button(pdfLabel("Параметры отображения"),'<path d="m6 9 6 6 6-6"/>');displayOptions.dataset.pdfAction='display-options';
  const page=document.createElement('input');page.type='text';page.inputMode='numeric';page.value='1';page.setAttribute('aria-label',pdfLabel("Номер страницы"));page.disabled=true;
  const count=document.createElement('span');count.className='pdf-page-count';count.textContent=pdfLabel("из …");toolbar.append(page,count);
  const fileMenu=button(pdfLabel("Открыть"),'<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>');fileMenu.dataset.pdfAction='file-menu';fileMenu.className='pdf-file-menu';fileMenu.disabled=false;
  if(onEdit){
    const edit=button(pdfLabel("Редактировать блок"),icons.code);edit.disabled=false;
    edit.onclick=e=>{e.preventDefault();e.stopPropagation();onEdit()};
  }
  const body=document.createElement('div');body.className='pdf-reader-body';
  const sidebar=document.createElement('div');sidebar.className='pdf-thumbnails';sidebar.hidden=true;sidebar.setAttribute('aria-label',pdfLabel("Миниатюры PDF"));
  const container=document.createElement('div');container.className='pdf-reader-scroll';container.tabIndex=0;
  const pages=document.createElement('div');pages.className='pdfViewer';container.append(pages);const outline=document.createElement('div');outline.className='pdf-outline';outline.hidden=true;outline.setAttribute('aria-label',pdfLabel("Оглавление PDF"));
  body.append(sidebar,outline,container);root.append(toolbar,body);
  const status=document.createElement('div');status.className='pdf-reader-status';setLocalizedText(status, "webobsidian.-pdf-698ba2", {}, "textContent");body.append(status);
  let destroyed=false,cleanup=()=>{},closeMenu=()=>{},cancelPendingMenu=()=>{},menuRequest=0;
  const menuError=(error:unknown)=>{if(!destroyed){const notice=document.createElement('div');notice.className='pdf-reader-notice';notice.textContent=error instanceof Error?error.message:pdfLabel("Не удалось выполнить команду");root.append(notice);setTimeout(()=>notice.remove(),4000)}};
  const showMenu=(anchor:HTMLButtonElement,label:string,items:PdfMenuItem[])=>{menuRequest++;cancelPendingMenu();const wasOpen=anchor.getAttribute('aria-expanded')==='true';closeMenu();if(!wasOpen)closeMenu=openPdfMenu(anchor,label,items,menuError)};
  fileMenu.onclick=async()=>{
   cancelPendingMenu();if(fileMenu.getAttribute('aria-expanded')==='true'){menuRequest++;closeMenu();return}
   fileMenu.focus({preventScroll:true});const request=++menuRequest;
   const clearPending=()=>{document.removeEventListener('keydown',cancel,true);document.removeEventListener('pointerdown',cancel,true);if(cancelPendingMenu===clearPending)cancelPendingMenu=()=>{}};
   const cancel=(event:Event)=>{
    if(event instanceof KeyboardEvent&&event.key!=='Escape')return;
    if(event.type==='pointerdown'&&fileMenu.contains(event.target as Node))return;
    menuRequest++;clearPending();if(event instanceof KeyboardEvent){event.preventDefault();event.stopPropagation()}
   };
   cancelPendingMenu=clearPending;document.addEventListener('keydown',cancel,true);document.addEventListener('pointerdown',cancel,true);
   try{const items=options.fileActions?await options.fileActions():[
    {label:pdfLabel("Открыть в новой вкладке"),run:()=>{if(onOpen)onOpen();else window.open(src,'_blank','noopener,noreferrer')}},
    {label:pdfLabel("Открыть в новом окне"),run:()=>{window.open(src,'_blank','popup,noopener,noreferrer')}},
    {label:pdfLabel("Копировать ссылку"),run:()=>navigator.clipboard.writeText(new URL(src,location.href).href)},
  ];if(!destroyed&&request===menuRequest&&document.activeElement===fileMenu)showMenu(fileMenu,pdfLabel("Открыть"),items)}catch(error){if(request===menuRequest)menuError(error)}finally{clearPending()}};
  disposers.set(root,()=>{destroyed=true;menuRequest++;cancelPendingMenu();closeMenu();cleanup()});
  void loadLibrary().then(async({core,viewer})=>{
    if(destroyed)return;
    const events=new viewer.EventBus();
    const links=new viewer.PDFLinkService({eventBus:events,externalLinkTarget:2,externalLinkRel:'noopener noreferrer'});
    const abort=new AbortController();
    // PDF.js supports abortSignal at runtime; its published 5.4 types omit it.
    const viewerOptions={container,viewer:pages,eventBus:events,linkService:links,removePageBorders:true,abortSignal:abort.signal,imageResourcesPath:assets+'images/',
      annotationMode:core.AnnotationMode.ENABLE,textLayerMode:1,maxCanvasPixels:16*1024*1024};
    const pdf=new viewer.PDFViewer(viewerOptions);
    const disposeFragment=mountPdfFragment(root,container,pdf,events,fragmentTarget);
    links.setViewer(pdf);
    const task=core.getDocument({url:src.split('#')[0],isEvalSupported:false,enableXfa:false,useWasm:false,
      cMapUrl:assets+'cmaps/',cMapPacked:true,standardFontDataUrl:assets+'standard_fonts/',wasmUrl:assets+'wasm/'});
    task.onPassword=(updatePassword:(password:string)=>void,reason:number)=>{
      if(destroyed)return;
      const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),submit=document.createElement('button');
      label.textContent=reason===core.PasswordResponses.INCORRECT_PASSWORD?pdfLabel("Неверный пароль PDF. Попробуйте ещё раз: "):uiText("webobsidian.-pdf-7bf10a");
      input.type='password';input.autocomplete='current-password';input.setAttribute('aria-label',pdfLabel("Пароль PDF"));submit.type='submit';setLocalizedText(submit, "webobsidian.-pdf-3f9328", {}, "textContent");
      label.append(input);form.append(label,submit);status.replaceChildren(form);
      form.onsubmit=e=>{e.preventDefault();const password=input.value;input.value='';setLocalizedText(status, "webobsidian.-pdf-698ba2", {}, "textContent");updatePassword(password)};
    };
    const thumbnailTasks=new Set<{cancel:()=>void}>();
    const size=()=>{
      if(destroyed||!pdf.pagesCount||options.fillContainer)return;
      const current=pdf.getPageView(pdf.currentPageNumber-1);
      if(Number.isFinite(fixedHeight)&&fixedHeight>0)root.style.height=(fixedHeight+(options.fixedHeightIncludesToolbar===false?toolbar.getBoundingClientRect().height:0))+'px';
      else if(current)root.style.height=Math.ceil(current.viewport.height+toolbar.getBoundingClientRect().height+2)+'px';
    };
    let lastWidth=0,lastHeight=0;
    const resize=new ResizeObserver(()=>{
      if(destroyed||!pdf.pagesCount)return;
      const width=container.clientWidth,height=container.clientHeight;if(width<=0)return;
      const widthChanged=width!==lastWidth,heightChanged=height!==lastHeight;lastWidth=width;lastHeight=height;
      const mode=root.dataset.scale??'';
      const refitHeight=heightChanged&&(options.fillContainer||fixedHeight>0)&&['page-fit','page-height'].includes(mode);
      if(!widthChanged&&!refitHeight)return;
      if(['page-width','page-fit','page-height'].includes(mode))pdf.currentScaleValue=mode;
      size();
    });resize.observe(container);
    const thumbnailObserver=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        const item=entry.target as HTMLButtonElement;thumbnailObserver.unobserve(item);
        void task.promise.then(doc=>doc.getPage(Number(item.dataset.page))).then(async p=>{
          if(destroyed)return;
          const viewport=p.getViewport({scale:120/p.getViewport({scale:1}).width});
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          canvas.setAttribute('aria-hidden','true');item.prepend(canvas);
          const render=p.render({canvas,viewport});thumbnailTasks.add(render);
          try{await render.promise}finally{thumbnailTasks.delete(render)}
        }).catch(error=>{if(!destroyed)console.warn('PDF thumbnail:',error)});
      }
    },{root:sidebar,rootMargin:'200px'});
    cleanup=()=>{disposeFragment();abort.abort();resize.disconnect();thumbnailObserver.disconnect();thumbnailTasks.forEach(t=>t.cancel());pdf.setDocument(null!);links.setDocument(null!);void task.destroy().catch(()=>{})};
    events.on('pagesinit',()=>{
      if(destroyed)return;
      if(pageLabels)pdf.setPageLabels(pageLabels);
      page.value=pdf.currentPageLabel??String(pdf.currentPageNumber);
      count.textContent=pdf.currentPageLabel?uiText("webobsidian.-value0-value1-49127b", {value0: pdf.currentPageNumber, value1: pdf.pagesCount}):pdfLabel("из ")+pdf.pagesCount;
      pdf.currentScaleValue='page-width';
      if(fragment)links.setHash(fragment);
      if(fragmentTarget.offset&&fragmentTarget.page&&fragmentTarget.page<=pdf.pagesCount){
        const [x,y,zoom]=fragmentTarget.offset;
        pdf.scrollPageIntoView({pageNumber:fragmentTarget.page,destArray:zoom===null?[fragmentTarget.page-1,{name:'FitBH'},y]:[fragmentTarget.page-1,{name:'XYZ'},x,y,zoom]});
      }
      size();root.dataset.ready='true';status.remove();
    });
    events.on('pagechanging',({pageNumber}:{pageNumber:number})=>{page.value=pdf.currentPageLabel??String(pageNumber);count.textContent=pdf.currentPageLabel?uiText("webobsidian.-value0-value1-49127b", {value0: pageNumber, value1: pdf.pagesCount}):pdfLabel("из ")+pdf.pagesCount;size()});
    events.on('pagerendered',({pageNumber}:{pageNumber:number})=>{if(pageNumber===pdf.currentPageNumber)size()});
    events.on('scalechanging',({scale,presetValue}:{scale:number;presetValue?:string})=>{
      root.dataset.scale=presetValue||String(scale);size();
    });
    thumbs.onclick=()=>{sidebar.hidden=!sidebar.hidden;root.classList.toggle('pdf-sidebar-open',!sidebar.hidden);thumbs.setAttribute('aria-expanded',String(!sidebar.hidden))};
    minus.onclick=()=>pdf.decreaseScale();plus.onclick=()=>pdf.increaseScale();
    page.onchange=()=>{pdf.currentPageLabel=page.value;page.value=pdf.currentPageLabel??String(pdf.currentPageNumber)};
    page.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();page.dispatchEvent(new Event('change'))}};
    const doc=await task.promise;
    if(destroyed){await task.destroy();return}
    const pageLabels=await doc.getPageLabels();if(destroyed)return;
    count.textContent=pdfLabel("из ")+doc.numPages;
    for(let n=1;n<=doc.numPages;n++){
      const item=document.createElement('button');item.type='button';item.dataset.page=String(n);item.textContent=String(n);item.title=pdfLabel("Страница ")+n;
      item.onclick=()=>{pdf.currentPageNumber=n};sidebar.append(item);thumbnailObserver.observe(item);
    }
    let outlineItems:{button:HTMLButtonElement;page:number}[]=[];
    const setSidebar=(mode:'thumbnails'|'outline')=>{sidebar.hidden=mode!=='thumbnails';outline.hidden=mode!=='outline';root.classList.add('pdf-sidebar-open');thumbs.setAttribute('aria-expanded','true');root.dataset.sidebar=mode};
    thumbs.onclick=()=>{const opened=!root.classList.contains('pdf-sidebar-open');sidebar.hidden=!opened||root.dataset.sidebar==='outline';outline.hidden=!opened||root.dataset.sidebar!=='outline';root.classList.toggle('pdf-sidebar-open',opened);thumbs.setAttribute('aria-expanded',String(opened))};
    const revealOutline=()=>{const entry=outlineItems.filter(i=>i.page<=pdf.currentPageNumber).sort((a,b)=>b.page-a.page)[0]??outlineItems[0];if(entry){setSidebar('outline');entry.button.focus();entry.button.scrollIntoView({block:'nearest'})}};
    sidebarOptions.onclick=()=>showMenu(sidebarOptions,pdfLabel("Параметры боковой панели"),[
      {label:pdfLabel("Миниатюры"),icon:'thumbnails',run:()=>setSidebar('thumbnails')},
      {label:pdfLabel("Оглавление"),icon:'outline',disabled:!outlineItems.length,run:()=>setSidebar('outline')},
      {label:pdfLabel("Показать страницу в оглавлении"),icon:'reveal',disabled:!outlineItems.length,run:revealOutline},
    ]);
    displayOptions.onclick=()=>showMenu(displayOptions,pdfLabel("Параметры отображения"),[
      {label:pdfLabel("Подогнать по ширине"),icon:'width',run:()=>{pdf.currentScaleValue='page-width';size()}},
      {label:pdfLabel("Подогнать по высоте"),icon:'height',run:()=>{pdf.currentScaleValue='page-height';size()}},
      ...([pdfLabel("Одна страница"),pdfLabel("Две страницы (нечётные)"),pdfLabel("Две страницы (чётные)")].map((label,index)=>({label,icon:index?'spread':'single',separatorBefore:index===0,radio:true,checked:pdf.spreadMode===index,run:()=>{pdf.spreadMode=index;if(root.dataset.scale?.startsWith('page-'))pdf.currentScaleValue=root.dataset.scale;size()}}))),
      {label:pdfLabel("Адаптировать к теме"),icon:'theme',separatorBefore:true,checked:root.classList.contains('pdf-adapt-theme'),run:()=>{root.classList.toggle('pdf-adapt-theme')}},
    ]);
    pdf.setDocument(doc);links.setDocument(doc);
    void doc.getOutline().then(async entries=>{
      const visit=async(nodes:NonNullable<typeof entries>,depth=0):Promise<void>=>{for(const node of nodes){
        if(destroyed)return;const item=document.createElement('button');item.type='button';item.textContent=node.title;item.style.paddingLeft=(12+depth*16)+'px';
        item.disabled=!node.dest;item.onclick=()=>{if(node.dest)void links.goToDestination(node.dest).catch(menuError)};outline.append(item);
        let destination=typeof node.dest==='string'?await doc.getDestination(node.dest):node.dest;
        if(destination){const ref=destination[0];const index=typeof ref==='number'?ref:await doc.getPageIndex(ref);outlineItems.push({button:item,page:index+1})}
        if(node.items.length)await visit(node.items,depth+1);
      }};if(entries)await visit(entries);
    }).catch(error=>{if(!destroyed)console.warn('PDF outline:',error)});

    [thumbs,sidebarOptions,displayOptions,minus,plus,page].forEach(el=>el.disabled=false);
  }).catch(error=>{
    if(destroyed)return;
    if(error?.status===404||error?.name==='MissingPDFException'){
      cleanup();root.classList.remove('pdf-fill-container');root.classList.add('pdf-missing');root.style.removeProperty('height');root.dataset.missing='true';root.setAttribute('role','note');
      const label=options.missingLabel??name;setLocalizedText(root,"webobsidian.missing-file",{name:label},"textContent");
      if(onEdit){const edit=embedAction('Edit embed','source',onEdit);edit.classList.add('pdf-missing-edit');root.append(edit)}return;
    }
    cleanup();setLocalizedText(status, "webobsidian.-pdf-4dac1a", {}, "textContent");
    const link=document.createElement('a');link.href=src;setLocalizedText(link, "webobsidian.-pdf-3f9328", {}, "textContent");link.target='_blank';link.rel='noopener noreferrer';status.append(link);
    console.warn('PDF viewer:',error);
  });
  return root;
}

export function destroyPdfViewer(root:HTMLElement){disposers.get(root)?.();disposers.delete(root)}
