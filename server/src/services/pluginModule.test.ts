import { expect, it } from 'vitest';
import { compilePluginModule } from './pluginModule.js';
it('parses CommonJS without executing it and rejects broken syntax', async () => { const before = (globalThis as any).__PLUGIN_PARSE_EXECUTED; const code = await compilePluginModule('globalThis.__PLUGIN_PARSE_EXECUTED=true; module.exports=class {};'); expect(code).toContain('export default function'); expect((globalThis as any).__PLUGIN_PARSE_EXECUTED).toBe(before); await expect(compilePluginModule('const broken = ;')).rejects.toMatchObject({ status: 422 }); });
