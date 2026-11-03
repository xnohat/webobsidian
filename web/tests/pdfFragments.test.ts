import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePdfFragment} from '../src/lib/pdfFragments';

test('PDF fragments identify native text selections and annotation precedence',()=>{
 assert.deepEqual(parsePdfFragment('page=2&selection=0,0,0,6').highlight,{type:'text',range:[0,0,0,6]});
 assert.deepEqual(parsePdfFragment('page=2&annotation=8R&selection=0,0,0,6').highlight,{type:'annotation',id:'8R'});
 assert.equal(parsePdfFragment('selection=0,0,0,6').highlight,undefined);
});
test('PDF fragments parse finite offsets and reject malformed ranges without failing navigation',()=>{
 assert.deepEqual(parsePdfFragment('page=2&offset=40,600,1'),{page:2,offset:[40,600,1]});
 for(const value of ['0,0,0','-1,0,0,6','0,0,0,Infinity','0,6,0,2','2,0,1,0','0.5,0,0,2','0,0,0,2,3'])assert.equal(parsePdfFragment('page=2&selection='+value).highlight,undefined,value);
 assert.equal(parsePdfFragment('page=2&offset=Infinity,2,1').offset,undefined);
 assert.equal(parsePdfFragment('page=2&annotation=missing').page,2);
});
