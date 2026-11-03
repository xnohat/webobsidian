import {it,expect,vi} from 'vitest';
const read=vi.hoisted(()=>vi.fn(async()=> 'PRIVATE_NOTE\n\n![[secret.png]]'));
vi.mock('./vault.js',()=>({readFileText:read}));
import {canvasEmbedTargets} from './rendercanvas.js';

it('Canvas authorizes its direct file cards and text embeds without reading note descendants',async()=>{
 const raw=JSON.stringify({nodes:[{type:'file',file:'Notes/Private.md'},{type:'file',file:'Files/doc #one.pdf'},{type:'file',file:'Files/photo%20one.avif'},{type:'file',file:'Files/config.yaml'},{type:'text',text:'![[image.svg]]\n\n![](sound%20one.wav)\n\n`![[literal.png]]`\n\n%%![[hidden.png]]%%'}],edges:[]});
 const targets=await canvasEmbedTargets(raw);
 expect(targets).toEqual(expect.arrayContaining(['Files/doc #one.pdf','Files/photo%20one.avif','Files/config.yaml','image.svg','sound one.wav']));
 expect(targets).not.toEqual(expect.arrayContaining(['secret.png']));expect(targets).not.toContain('literal.png');expect(targets).not.toContain('hidden.png');expect(read).not.toHaveBeenCalled();
});
