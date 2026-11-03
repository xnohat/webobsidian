import {test} from 'node:test';
import assert from 'node:assert/strict';
import {humanizeTitle,displayTitle} from '../src/lib/title';

test('filename titles preserve date separators and original spelling',()=>{
  for(const [path,title] of [['2026-05-04.md','2026-05-04'],['Daily/2026-11-01.markdown','2026-11-01'],['notes/note_with-hyphen.md','note_with-hyphen'],['HR-685 Изменить начисление.md','HR-685 Изменить начисление']]){
    assert.equal(humanizeTitle(path),title);
    assert.equal(displayTitle(path,''),title);
  }
  assert.equal(displayTitle('2026-05-04.md','---\ntitle: Custom date title\n---\n'),'Custom date title');
});
