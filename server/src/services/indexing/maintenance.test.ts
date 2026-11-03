import {expect,it} from 'vitest';
import {needsMaintenance} from './maintenance.js';
it('bounds discarded terms by indexed notes and age, independently of attachments',()=>{
  expect(needsMaintenance(499,1,0,1000)).toBe(false);
  expect(needsMaintenance(500,1,0,1000)).toBe(true);
  expect(needsMaintenance(1999,10000,0,1000)).toBe(false);
  expect(needsMaintenance(2000,10000,0,1000)).toBe(true);
  expect(needsMaintenance(1,10000,0,86400000)).toBe(true);
  expect(needsMaintenance(0,10000,0,86400000)).toBe(false);
});
