import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

test('library import needs no credentials and produces no stdout', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('@webobsidian/mcp-server/server'); await import('@webobsidian/mcp-server/client')"],
    { encoding: 'utf8', env: { ...process.env, WEBOBSIDIAN_API_KEY: '' } });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, '');
});

test('independent server factories retain all tool schemas and isolate APIs', async t => {
  const { createMcpServer } = await import('@webobsidian/mcp-server/server');
  async function connect(tag) {
    const server = createMcpServer({ tags: async () => ({ tags: [tag] }) });
    const client = new Client({ name: 'test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    await client.connect(b);
    t.after(async () => { await client.close(); await server.close(); });
    return client;
  }
  const first = await connect('first');
  const second = await connect('second');
  const { tools } = await first.listTools();
  assert.deepEqual(tools.map(x => x.name).sort(), ['list_notes','read_note','write_note','append_note','edit_note','grep_note','delete_note','search_notes','get_backlinks','list_tags'].sort());
  assert.equal(tools.find(x => x.name === 'read_note').inputSchema.properties.path.minLength, 1);
  assert.equal(tools.find(x => x.name === 'list_notes').inputSchema.properties.limit.maximum, 500);
  assert.deepEqual(JSON.parse((await first.callTool({ name: 'list_tags', arguments: {} })).content[0].text), { tags: ['first'] });
  assert.deepEqual(JSON.parse((await second.callTool({ name: 'list_tags', arguments: {} })).content[0].text), { tags: ['second'] });
});
