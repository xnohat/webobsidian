import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultCodeFileViewer,parseCodeMappings,resolveCodeLanguage} from '../src/lib/codeFiles';
test('code routing respects built-in viewers, settings and language aliases',()=>{
 for(const p of ['a.py','A.TS','Dockerfile']) assert.ok(resolveCodeLanguage(p,defaultCodeFileViewer));
 for(const p of ['a.md','a.markdown','a.pdf','a.canvas','a.png','a.zip']) assert.equal(resolveCodeLanguage(p,{...defaultCodeFileViewer,extensionMap:{[p.split('.').pop()!]: 'python'}}),null);
 assert.equal(resolveCodeLanguage('a.py',{...defaultCodeFileViewer,enabled:false}),null);
 assert.equal(resolveCodeLanguage('a.py',{...defaultCodeFileViewer,extensionMap:{}}),null);
 assert.equal(resolveCodeLanguage('a.sh',defaultCodeFileViewer),'shell');
 assert.equal(resolveCodeLanguage('a.tsx',defaultCodeFileViewer),'tsx');
 assert.equal(resolveCodeLanguage('a.jsx',defaultCodeFileViewer),'jsx');
 assert.equal(resolveCodeLanguage('a.xml',defaultCodeFileViewer),'xml');
});
test('mapping parser normalizes, reports bad lines and rejects reserved types',()=>{
 const r=parseCodeMappings('# comment\n.PY: python\npy=plain\nbad line\nmd: python');
 assert.equal(r.map.py,'plain'); assert.equal(r.errors.length,2);
});
