import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAgentApiClient } from './client.js';
import { createMcpServer } from './server.js';

const apiKey = process.env.WEBOBSIDIAN_API_KEY;
if (!apiKey) {
  process.stderr.write('webobsidian-mcp: WEBOBSIDIAN_API_KEY is required (create one in WebObsidian → Settings → API Keys).\n');
  process.exit(1);
}
const api = createAgentApiClient({ baseUrl: process.env.WEBOBSIDIAN_BASE_URL ?? 'http://localhost:8787', apiKey });
await createMcpServer(api).connect(new StdioServerTransport());
