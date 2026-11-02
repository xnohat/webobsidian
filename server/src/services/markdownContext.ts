// Pure Markdown context shared with the browser. No server or filesystem APIs.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { inlineFootnoteRanges } from './markdownDialect.js';

const parser = unified().use(remarkParse).use(remarkGfm);
export interface SourceRange { from: number; to: number }
/** Complete literal ranges, independent of the editor's incremental parse window. */
export function markdownLiteralRanges(source:string): (SourceRange&{kind:'code'|'inlineCode'|'html'})[]{
 const ranges:(SourceRange&{kind:'code'|'inlineCode'|'html'})[]=[];
 const visit=(node:Node)=>{if(node.type==='code'||node.type==='inlineCode'||node.type==='html'){
  const from=node.position?.start.offset,to=node.position?.end.offset;
  if(from!==undefined&&to!==undefined)ranges.push({from,to,kind:node.type});return;
 }node.children?.forEach(visit)};visit(parser.parse(source) as Node);return ranges;
}
interface Node {
  type: string;
  value?: string;
  depth?: number;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: Node[];
  url?:string;alt?:string;title?:string|null;identifier?:string;
}

export interface MarkdownImage extends SourceRange {url:string;alt:string;title?:string|null}

/** Parser-owned embed tokens, including references and balanced destinations. */
export function markdownImages(source:string):MarkdownImage[]{
  const tree=parser.parse(source) as Node,definitions=new Map<string,Node>(),images:MarkdownImage[]=[],blocked:SourceRange[]=findObsidianComments(source);
  const identifier=(value:string)=>value.trim().replace(/\s+/g,' ').toUpperCase();
  const collect=(node:Node)=>{
    const from=node.position?.start.offset,to=node.position?.end.offset;
    if(from!==undefined&&to!==undefined&&blocked.some(r=>from<r.to&&to>r.from)){
      if(node.type==='definition')return;
    }
    if(node.type==='definition'&&node.identifier){const key=identifier(node.identifier);if(!definitions.has(key))definitions.set(key,node)}
    node.children?.forEach(collect);
  };collect(tree);
  const visit=(node:Node)=>{
    const from=node.position?.start.offset,to=node.position?.end.offset;
    if(['code','inlineCode','html','definition'].includes(node.type)){if(from!==undefined&&to!==undefined)blocked.push({from,to});return}
    const target=node.type==='image'?node:node.type==='imageReference'?definitions.get(identifier(node.identifier??'')):undefined;
    if(target?.url!==undefined&&from!==undefined&&to!==undefined)images.push({from,to,url:target.url,alt:node.alt??'',title:target.title});
    else node.children?.forEach(visit);
  };visit(tree);
  // Obsidian also accepts unbracketed spaces in vault paths. Preserve that
  // extension without letting the fallback rewrite parser-owned/literal ranges.
  for(const m of source.matchAll(/!\[([^\]\n]*)\]\(/g)){
    const from=m.index!;if(isEscaped(source,from)||[...blocked,...images].some(r=>from>=r.from&&from<r.to))continue;
    let at=from+m[0].length,depth=1,angle=false,quote='';
    for(;at<source.length&&source[at]!=='\n';at++){
      const ch=source[at];if(ch==='\\'){at++;continue}
      if(quote){if(ch===quote)quote='';continue}
      if(ch==='<'&&depth===1){angle=true;continue}if(ch==='>'&&angle){angle=false;continue}if(angle)continue;
      if((ch==='"'||ch==="'")&&/\s/.test(source[at-1]??'')){quote=ch;continue}
      if(ch==='(')depth++;else if(ch===')'&&!--depth)break;
    }
    if(depth!==0)continue;
    const inside=source.slice(from+m[0].length,at).trim().replace(/\s+(?:"[^"]*"|'[^']*')$/,'').trim();
    if(!inside)continue;
    images.push({from,to:at+1,url:inside.replace(/^<([\s\S]*)>$/,'$1').replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g,'$1'),alt:m[1]});
  }
  return images.filter(r=>!blocked.some(b=>r.from>=b.from&&r.from<b.to)).sort((a,b)=>a.from-b.from);
}

/** Split the URL before decoding: %23 is part of the filename, # is a fragment. */
export function markdownEmbedTarget(url:string){
  url=url.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g,'$1');
  const at=url.indexOf('#'),encodedPath=at<0?url:url.slice(0,at),fragment=at<0?'':url.slice(at);
  let path=encodedPath;try{path=decodeURIComponent(path)}catch{}
  return {url,encodedPath,path:path.normalize('NFC'),fragment,external:/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)};
}

/** Source positions for the Reading adapter; rendering never rewrites the doc. */
export function footnoteRanges(source: string): { references: SourceRange[]; definitions: SourceRange[] } {
  const references: SourceRange[] = [], definitions: SourceRange[] = [], literal: SourceRange[] = [];
  const visit = (node: Node) => {
    const from = node.position?.start.offset, to = node.position?.end.offset;
    if (from === undefined || to === undefined) return;
    if (['code', 'inlineCode', 'html'].includes(node.type)) { literal.push({ from, to }); return; }
    if (node.type === 'footnoteDefinition') { definitions.push({ from, to }); return; }
    if (node.type === 'footnoteReference') references.push({ from, to });
    node.children?.forEach(visit);
  };
  visit(parser.parse(source) as Node);
  const blocked = [...literal, ...definitions, ...findObsidianComments(source)];
  references.push(...inlineFootnoteRanges(source).filter(r =>
    !isEscaped(source, r.from) && !blocked.some(b => r.from >= b.from && r.from < b.to)));
  return { references: references.filter(r => !blocked.some(b => r.from >= b.from && r.from < b.to)).sort((a,b) => a.from - b.from), definitions };
}

/** Parser-owned ranges use original source offsets, including frontmatter. */
export function noteFragmentRange(source:string,fragment:string):SourceRange|null{
  if(!fragment)return {from:0,to:source.length};
  let parsed=source;
  const hidden=[...findObsidianComments(source)];
  const frontmatter=source.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);if(frontmatter)hidden.push({from:0,to:frontmatter[0].length});
  for(const range of hidden.sort((a,b)=>b.from-a.from))parsed=parsed.slice(0,range.from)+parsed.slice(range.from,range.to).replace(/[^\r\n]/g,' ')+parsed.slice(range.to);
  if(/^\^[a-zA-Z0-9-]+$/.test(fragment))return blockRange(parsed,fragment.slice(1));
  const headings:Node[]=[];
  const visit=(node:Node)=>{if(node.type==='heading')headings.push(node);else node.children?.forEach(visit)};
  visit(parser.parse(parsed) as Node);
  const label=(node:Node):string=>node.value??node.children?.map(label).join('')??'';
  const normalize=(value:string)=>value.trim().normalize('NFC').toLowerCase();
  let index=-1,end=headings.length;
  for(const segment of fragment.split('#')){
    if(!segment)return null;
    const nextIndex=headings.findIndex((node,i)=>i>index&&i<end&&normalize(label(node))===normalize(segment));if(nextIndex<0)return null;
    index=nextIndex;const boundary=headings.findIndex((node,i)=>i>index&&node.depth!<=headings[index].depth!);end=boundary<0?headings.length:boundary;
  }
  const heading=headings[index],next=headings.slice(index+1).find(node=>node.depth!<=heading.depth!);
  return {from:heading.position!.start.offset!,to:next?.position?.start.offset??source.length};
}

/** Select the complete native block (including list/quote syntax), not its text. */
function blockRange(source:string,id:string):SourceRange|null{
 let selected:SourceRange|null=null;
 const assign=(node:Node)=>{selected={from:node.position!.start.offset!,to:node.position!.end.offset!}};
 const suffix=new RegExp('(?:^|\\s)\\^'+id+'\\s*$');
 const visit=(parent:Node)=>{
  if(selected||['code','inlineCode','html'].includes(parent.type))return;
  parent.children?.forEach((node,index,siblings)=>{
   if(selected)return;
   if(node.type==='paragraph'){
    const raw=source.slice(node.position!.start.offset,node.position!.end.offset),last=node.children?.at(-1);
    if(suffix.test(raw)&&last?.type==='text'&&suffix.test(last.value??'')){
     if(raw.trim()==='^'+id){const previous=siblings[index-1];if(previous)assign(['listItem','blockquote'].includes(parent.type)?parent:previous)}
     else assign(['listItem','blockquote'].includes(parent.type)?parent:node);
    }
   }
   visit(node);
  });
 };visit(parser.parse(source) as Node);return selected;
}

/** Select a heading and subsections, or an identified block for transclusion. */
export function selectHeading(source:string,fragment:string):string|null{
 const range=noteFragmentRange(source,fragment);if(!range)return null;
 const selected=source.slice(range.from,range.to);
 return /^\^[a-zA-Z0-9-]+$/.test(fragment)?selected.replace(new RegExp('(?:^|\\s)\\^'+fragment.slice(1)+'\\s*$'),''):selected;
}

/** Protect literal/parser-owned regions before Obsidian extension transforms. */
export function protectMarkdown(source: string) {
  const ranges: { from: number; to: number; html?: boolean }[] = [];
  const visit = (node: Node) => {
    if (['code', 'inlineCode', 'html'].includes(node.type)) {
      const from = node.position?.start.offset, to = node.position?.end.offset;
      if (from !== undefined && to !== undefined) ranges.push({ from, to, html: node.type === 'html' });
      return;
    }
    node.children?.forEach(visit);
  };
  visit(parser.parse(source) as Node);
  // Protect complete escape pairs, so an even number of backslashes still lets
  // the following Markdown open normally. Escaped embeds are literal as a unit.
  for (const m of source.matchAll(/\\(?:!\[\[[^\]\n]*\]\]|[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g)) {
    if (!ranges.some(r => m.index! < r.to && m.index! + m[0].length > r.from)) {
      ranges.push({ from: m.index!, to: m.index! + m[0].length });
    }
  }
  ranges.sort((a, b) => a.from - b.from);
  let prefix = '\uE000protected';
  while (source.includes(prefix)) prefix += '_';
  const values: string[] = [];
  const restore = (value: string) => value.replace(new RegExp(`${prefix}(\\d+)\uE001`, 'g'), (_, index) => values[+index]);
  // Flatten before storing generated markup, so placeholders cannot escape in
  // nested math/link labels. Stored original source never contains our prefix.
  const stash = (value: string) => `${prefix}${values.push(restore(value)) - 1}\uE001`;
  let text = '', cursor = 0;
  for (const range of ranges) {
    const raw = source.slice(range.from, range.to);
    text += source.slice(cursor, range.from) + stash(range.html ? preserveLiteralTags(raw) : raw);
    cursor = range.to;
  }
  text += source.slice(cursor);
  return { text, stash, restore };
}

export function isEscaped(source: string, offset: number): boolean {
  let count = 0;
  for (let i = offset - 1; i >= 0 && source[i] === '\\'; i--) count++;
  return count % 2 === 1;
}

/** Obsidian comments are not active inside literal code or HTML. */
export function findObsidianComments(source: string): SourceRange[] {
  const literal: SourceRange[] = [];
  const visit = (node: Node) => {
    if (['code', 'inlineCode', 'html'].includes(node.type)) {
      const from = node.position?.start.offset, to = node.position?.end.offset;
      if (from !== undefined && to !== undefined) literal.push({ from, to });
    } else node.children?.forEach(visit);
  };
  visit(parser.parse(source) as Node);
  const ranges: SourceRange[] = [];
  let start = -1;
  for (const match of source.matchAll(/%%/g)) {
    const at = match.index!;
    if (isEscaped(source, at)) continue;
    if (start >= 0) { ranges.push({ from: start, to: at + 2 }); start = -1; }
    else if (!literal.some(r => at >= r.from && at < r.to)) start = at;
  }
  return ranges;
}

export function stripObsidianComments(source: string): string {
  let result = source;
  for (const r of findObsidianComments(source).reverse()) result = result.slice(0, r.from) + result.slice(r.to);
  return result;
}

/** Preserve non-HTML identifiers when a real HTML fragment surrounds them. */
export function preserveLiteralTags(html: string): string {
  return html.replace(/<!--[\s\S]*?-->|<\/?([a-zA-Z][^\s/>]*)(?:[^>"']|"[^"]*"|'[^']*')*>/g, (token, name?: string) => {
    if (!name || /^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) return token;
    return token.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
}
