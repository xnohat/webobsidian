import {expect,it} from 'vitest';
import {indexingConfig} from './config.js';
it('uses documented defaults and rejects invalid intervals/modes',()=>{
  expect(indexingConfig({})).toEqual({polling:false,reconcileMs:60000,auditMs:1800000});
  for(const value of ['0','-1','garbage','0.5','2147483648'])expect(()=>indexingConfig({WEBOBSIDIAN_RECONCILE_INTERVAL_MS:value})).toThrow();
  expect(()=>indexingConfig({WEBOBSIDIAN_WATCH:'broken'})).toThrow();
});
