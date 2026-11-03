import { describe, expect, it } from 'vitest';

describe('CLI default environment', () => {
  it('preserves paths and server settings without creating a recovery credential', async () => {
    const { renderDefaultEnv } = await import('../../../packages/webo/src/default-env.js');
    const env = renderDefaultEnv('C:/temporary vault', 'C:/temporary data');
    const entries = Object.fromEntries(env.split('\n').filter(line => line && !line.startsWith('#')).map(line => {
      const equals = line.indexOf('=');
      return [line.slice(0, equals), line.slice(equals + 1)];
    }));
    expect(entries.WEBOBSIDIAN_PASSWORD ?? '').toBe('');
    expect(entries).toMatchObject({ PORT: '8787', HOST: '0.0.0.0', VAULT_PATH: 'C:/temporary vault', DATA_DIR: 'C:/temporary data', ALLOWED_ROOTS: 'C:/temporary vault', WEBOBSIDIAN_WATCH: 'auto', TRUST_PROXY: 'true' });
  });
});
