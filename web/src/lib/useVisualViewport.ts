import {useLayoutEffect,useState} from 'react';
export function visibleViewport(){const v=window.visualViewport;return {left:v?.offsetLeft??0,top:v?.offsetTop??0,width:v?.width??window.innerWidth,height:v?.height??window.innerHeight,bottom:Math.max(0,window.innerHeight-((v?.offsetTop??0)+(v?.height??window.innerHeight))),right:Math.max(0,window.innerWidth-((v?.offsetLeft??0)+(v?.width??window.innerWidth)))};}
/** Both overlay keyboards and keyboards that resize the layout viewport. */
export function useVisualViewport(){
 const [viewport,setViewport]=useState(visibleViewport);
 useLayoutEffect(()=>{const update=()=>setViewport(visibleViewport());const v=window.visualViewport;window.addEventListener('resize',update);v?.addEventListener('resize',update);v?.addEventListener('scroll',update);update();return()=>{window.removeEventListener('resize',update);v?.removeEventListener('resize',update);v?.removeEventListener('scroll',update);};},[]);
 return viewport;
}
