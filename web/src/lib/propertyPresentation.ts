// Native property icons use the same Lucide strokes as the rest of the UI.
const paths:Record<string,string>={
 text:'<path d="M21 5H3M15 12H3M17 19H3"/>',
 list:'<path d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13"/>',
 tags:'<path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1zM2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193"/><circle cx="10.5" cy="6.5" r=".5" fill="currentColor"/>',
 aliases:'<path d="m15 17 5-5-5-5M4 18v-2a4 4 0 0 1 4-4h12"/>',
 number:'<rect x="14" y="14" width="4" height="6" rx="2"/><rect x="6" y="4" width="4" height="6" rx="2"/><path d="M6 20h4M14 10h4M6 14h2v6M14 4h2v6"/>',
 date:'<path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/>',
 datetime:'<path d="M8 2v4M16 2v4M3 10h18M21 12V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/><circle cx="17" cy="18" r="5"/><path d="M17 16v2l1 1"/>',
 checkbox:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
 close:'<path d="m18 6-12 12M6 6l12 12"/>',
 link:'<path d="m10 13 4-4M15 7l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0M9 17l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0"/>',
};
export function propertyIconSvg(type:string,key=''):string{
 const name=type==='list'&&(key==='tags'||key==='aliases')?key:type;
 const safe=Object.hasOwn(paths,name)?name:'text';
 return `<svg data-icon="${safe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[safe]}</svg>`;
}
