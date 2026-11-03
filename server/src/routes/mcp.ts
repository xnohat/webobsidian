import { Router, json, type ErrorRequestHandler } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '@webobsidian/mcp-server/server';
import { createScopedAgentApi } from '../services/mcpAgentApi.js';
import { requireApiKey } from '../middleware/apikey.js';
import type { McpConfig } from '../services/mcpConfig.js';

/** Mount before SPA fallback (and before the global JSON parser for uniform errors). */
export function createMcpRouter(config: McpConfig): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!config.enabled) { res.status(404).json({ error: 'MCP is disabled' }); return; }
    next();
  });
  router.use((req, res, next) => {
    const host = req.headers.host?.toLowerCase();
    const origin = req.headers.origin;
    if (!host || !config.allowedHosts.includes(host) || (origin !== undefined && !config.allowedOrigins.includes(origin))) {
      res.status(403).json({ error: 'MCP host or origin is not allowed' }); return;
    }
    next();
  });
  const authenticate = requireApiKey();
  router.use((req, res, next) => { void authenticate(req, res, next).catch(next); });
  router.post('/', json({ limit: '32mb' }), async (req, res) => {
    const server = createMcpServer(createScopedAgentApi(req.apiKey!.scopes));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      // McpServer.close closes its transport as well; do not close it twice.
      void server.close().catch(() => {});
    };
    res.once('finish', cleanup);
    res.once('close', cleanup);
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      cleanup();
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal server error' } });
      else if (!res.writableEnded) res.end();
    }
  });
  router.all('/', (_req, res) => { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'Method not allowed' }); });
  router.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
  const parserError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error?.type === 'entity.too.large' ? 413 : error?.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ error: status === 413 ? 'Request body too large' : status === 400 ? 'Invalid JSON' : 'Internal server error' });
  };
  router.use(parserError);
  return router;
}
