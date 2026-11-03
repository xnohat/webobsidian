export interface CodeFileViewerSettings {enabled:boolean;lineNumbers:boolean;extensionMap:Record<string,string>}
export type CodeFileReadResult = {kind:'text';path:string;content:string;highlightAllowed:boolean}|{kind:'unavailable';path:string;reason:'too-large'|'binary'|'encoding'};
const groups:Record<string,string>={python:'py pyw',javascript:'js mjs cjs',jsx:'jsx',typescript:'ts mts cts',tsx:'tsx',shell:'sh bash zsh fish env',powershell:'ps1 psm1',batch:'bat cmd',sql:'sql',yaml:'yml yaml',toml:'toml',ini:'ini cfg conf properties',json:'json jsonc json5',xml:'xml',html:'html htm',vue:'vue',svelte:'svelte',css:'css',scss:'scss',less:'less',rust:'rs',go:'go',java:'java',kotlin:'kt kts',swift:'swift',c:'c h',cpp:'cpp cc cxx hpp hh',csharp:'cs',ruby:'rb',php:'php',perl:'pl pm',lua:'lua',r:'r',julia:'jl',dart:'dart',haskell:'hs',elixir:'ex exs',dockerfile:'dockerfile',hcl:'tf tfvars hcl',graphql:'graphql gql',diff:'diff patch',stex:'tex',plain:'log txt text csv tsv'};
export const defaultCodeFileViewer:CodeFileViewerSettings={enabled:true,lineNumbers:true,extensionMap:Object.fromEntries(Object.entries(groups).flatMap(([lang,exts])=>exts.split(' ').map(ext=>[ext,lang])))};
export const reservedCodeExtension=(ext:string)=>/^(md|markdown|canvas|pdf|png|jpe?g|gif|svg|webp|bmp|ico|avif|mp4|webm|ogv|mov|mkv|mp3|wav|m4a|3gp|flac|ogg|oga|opus|docx?|xlsx?|pptx?|odt|ods|odp|rtf|zip|7z|tar|gz|tgz|bz2|xz)$/.test(ext);
export function parseCodeMappings(text:string){
 const map:Record<string,string>=Object.create(null);const errors:string[]=[];
 text.split('\n').forEach((raw,i)=>{const line=raw.trim();if(!line||line.startsWith('#'))return;const m=/^\.?([\w+-]{1,64})\s*[:=]\s*([\w+-]{1,64})$/.exec(line.toLowerCase());if(!m||reservedCodeExtension(m[1])||['__proto__','constructor','prototype'].includes(m[1]))errors.push(`Line ${i+1}: invalid or reserved extension`);else map[m[1]]=m[2];});
 if(Object.keys(map).length>256)errors.push('At most 256 mappings');return {map,errors};
}
export function resolveCodeLanguage(path:string,settings:CodeFileViewerSettings=defaultCodeFileViewer):string|null{
 if(!settings.enabled)return null;const name=path.split('#')[0].split('/').pop()!.toLowerCase();const ext=name==='dockerfile'?'dockerfile':name.includes('.')?name.split('.').pop()!:'';
 if(!ext||reservedCodeExtension(ext)||!Object.hasOwn(settings.extensionMap,ext))return null;
 const lang=settings.extensionMap[ext];return ({bash:'shell',markup:'html',docker:'dockerfile',latex:'stex'} as Record<string,string>)[lang]??lang;
}
