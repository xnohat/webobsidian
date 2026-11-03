import {HighlightStyle,LanguageDescription,LanguageSupport,StreamLanguage,type StreamParser} from '@codemirror/language';
import {languages} from '@codemirror/language-data';
import {Tag} from '@lezer/highlight';

// Native Obsidian's editor uses the legacy stream grammars for these fences.
// Their token boundaries differ from modern Lezer (notably definitions, Python
// builtins/interpolation and YAML scalars). Keep their palette independent of
// Markdown, frontmatter and the standalone code-file viewer.
const roles={
 normal:'var(--text-normal)',comment:'var(--text-faint)',tag:'var(--color-red)',
 number:'var(--color-purple)',string:'var(--color-green)',operator:'var(--color-red)',
 variable:'var(--color-cyan)',builtin:'var(--color-yellow)',keyword:'var(--color-pink)',
 error:'var(--text-error, var(--color-red))',
};
type Role=keyof typeof roles;
const tags=Object.fromEntries(Object.keys(roles).map(role=>[role,Tag.define()])) as Record<Role,Tag>;
const tokens:Record<string,Role>={
 def:'normal',atom:'normal',comment:'comment',meta:'comment',tag:'tag',
 number:'number',string:'string','string-2':'string','string.special':'string',qualifier:'string',operator:'operator',
 variable:'variable','variable-2':'variable','variable-3':'variable','variableName.local':'variable',self:'variable',link:'variable',
 builtin:'builtin',property:'builtin',attribute:'builtin',type:'builtin',keyword:'keyword',error:'error',
};

export const nativeFencedCodeHighlightStyle=HighlightStyle.define(
 (Object.entries(roles) as [Role,string][]).map(([role,color])=>({tag:tags[role],color})),
);

function nativeLanguage<State>(parser:StreamParser<State>):LanguageSupport{
 const tokenTable=Object.fromEntries(Object.entries(tags).map(([role,tag])=>['nativeCode'+role,tag]));
 return new LanguageSupport(StreamLanguage.define({
  ...parser,tokenTable,
  token(stream,state){
   const style=parser.token(stream,state);
   return style?style.split(/\s+/).map(token=>'nativeCode'+(tokens[token]??'normal')).join(' '):null;
  },
 }));
}

const loadNative:Record<string,(()=>Promise<LanguageSupport>)|undefined>={
 JavaScript:async()=>nativeLanguage((await import('@codemirror/legacy-modes/mode/javascript')).javascript),
 Python:async()=>nativeLanguage((await import('@codemirror/legacy-modes/mode/python')).python),
 YAML:async()=>nativeLanguage((await import('@codemirror/legacy-modes/mode/yaml')).yaml),
};

export const nativeFencedCodeLanguages=languages.map(description=>{
 const load=loadNative[description.name];
 return load?LanguageDescription.of({name:description.name,alias:description.alias,
  extensions:description.extensions,filename:description.filename,load}):description;
});
