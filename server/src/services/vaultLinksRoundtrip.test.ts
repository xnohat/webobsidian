import { describe, expect, it } from 'vitest';
import { formatInternalLink } from '../../../web/src/lib/vaultLinks';
import { parseFileReferences, resolveReference } from './fileReferences.js';

describe('generated links resolve through the real server resolver',()=>{
 for(const useMarkdownLinks of [true,false])for(const newLinkFormat of ['shortest','relative','absolute'] as const){
  it(`${useMarkdownLinks?'Markdown':'wiki'} ${newLinkFormat} handles encoded names and collisions`,()=>{
   const preferences={newFileLocation:'root' as const,newFileFolderPath:'',useMarkdownLinks,newLinkFormat};
   const sourcePath='Notes/Source.md';
   const targets=['Deep/A/Target.md','Else/Target.md','Media/фото #1 (100%).png','Media/under_score.png','Notes/Space name.md','Media/shot%20one.png','Media/shot one.png','Media/shot #1.png','Media/shot %231.png'];
   const paths=[sourcePath,...targets];
   for(const targetPath of targets){
    const text=formatInternalLink({sourcePath,targetPath,preferences,knownPaths:paths,embed:targetPath.endsWith('.png')});
    const refs=parseFileReferences(text);expect(refs.length,text).toBe(1);
    expect(resolveReference(refs[0].target,sourcePath,paths,refs[0].kind),text).toBe(targetPath);
   }
  });
 }
});
