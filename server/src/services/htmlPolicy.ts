import type {Root,RootContent} from 'hast';

/** Only inert color declarations; whitespace is valid CSS, not a reason to lose color. */
export const COLOR_STYLE_RE = /^\s*(?:(?:color|background-color)\s*:\s*#(?:[\da-fA-F]{8}|[\da-fA-F]{6}|[\da-fA-F]{3})\s*;?\s*){1,2}$/i;

const COLOR_VALUE_RE=/^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|[a-z]{1,32}|(?:rgba?|hsla?)\([\d\s.,%/+\-]+\))$/i;
const inlineTags=new Set(['span','mark','kbd']);
function boundedSpacing(value:string):boolean{
 const parts=value.split(/\s+/);return parts.length<=4&&parts.every(part=>{
  const m=/^((?:\d+(?:\.\d+)?|\.\d+))(px|em|rem)?$/i.exec(part);if(!m)return false;
  const n=Number(m[1]),unit=m[2]?.toLowerCase();return unit?n<=(unit==='px'?64:4):n===0;
 });
}

/** Keep inert typography only. No URLs, custom properties, layout or !important. */
export function sanitizeInlineStyle(source:string):string{
 // Keep toolbar-owned hex spans stable; its source editing uses this grammar.
 if(COLOR_STYLE_RE.test(source))return source;
 const declarations=new Map<string,string>();
 for(const declaration of source.split(';')){
  const at=declaration.indexOf(':');if(at<0)continue;
  let property=declaration.slice(0,at).trim().toLowerCase();const value=declaration.slice(at+1).trim();
  if(property==='background')property='background-color';
  const allowed=['color','background-color'].includes(property)?COLOR_VALUE_RE.test(value):
   property==='font-weight'?/^(?:normal|bold|bolder|lighter|[1-9]00)$/i.test(value):
   property==='font-style'?/^(?:normal|italic|oblique)$/i.test(value):
   ['padding','border-radius'].includes(property)&&boundedSpacing(value);
  if(allowed)declarations.set(property,value);
 }
 return [...declarations].map(([key,value])=>`${key}: ${value}`).join('; ');
}

/** Runs before the shared sanitizer. Legacy font color becomes a bounded span. */
export function rehypeInlineStyles(){
 return (tree:Root)=>{
  const visit=(node:Root|RootContent)=>{
   if(node.type==='element'){
    const properties=node.properties;
    if(node.tagName==='font'){
     node.tagName='span';
     const color=typeof properties.color==='string'&&COLOR_VALUE_RE.test(properties.color)?`color: ${properties.color}; `:'';
     properties.style=color+(typeof properties.style==='string'?properties.style:'');delete properties.color;
    }
    if(inlineTags.has(node.tagName)){
     const style=typeof properties.style==='string'?sanitizeInlineStyle(properties.style):'';
     if(style)properties.style=style;else delete properties.style;
    }
   }
   if('children' in node)node.children.forEach(visit);
  };visit(tree);
 };
}
