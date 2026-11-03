import {useEffect,useRef} from 'react';
import {api} from '../lib/api';
import {createPdfViewer,destroyPdfViewer} from '../lib/pdfViewer';
import {pdfFileActions} from '../lib/pdfFileActions';

export default function PdfFileView({path,fragment=''}:{path:string;fragment?:string}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const src=api.rawUrl(path)+(fragment?'#'+fragment.replace(/^#/,''):''),reader=createPdfViewer(src,path.split('/').pop()??path,undefined,undefined,{fillContainer:true,fileActions:pdfFileActions(path,'',{resolvedPath:path,fragment})});
  ref.current!.replaceChildren(reader);
  return ()=>{destroyPdfViewer(reader);reader.remove()};
 },[path,fragment]);
 return <div className="pdf-file-view" ref={ref}/>;
}
