export interface McpConfig {
  enabled: boolean;
  publicUrl?: string;
  allowedOrigins: string[];
  allowedHosts: string[];
}

function parseUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid MCP URL configuration'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash || url.hostname.includes('*')) {
    throw new Error('Invalid MCP URL configuration');
  }
  return url;
}

/** Secrets and user-supplied URLs are deliberately omitted from startup errors. */
export function readMcpConfig(env: NodeJS.ProcessEnv): McpConfig {
  const enabled = /^(true|1|yes)$/i.test(env.WEBOBSIDIAN_MCP_ENABLED ?? 'false');
  if (!enabled) return { enabled: false, allowedOrigins: [], allowedHosts: [] };
  const url = parseUrl(env.WEBOBSIDIAN_MCP_PUBLIC_URL ?? '');
  if (url.pathname !== '/mcp') throw new Error('MCP public URL must end in /mcp');
  const origins = (env.WEBOBSIDIAN_MCP_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean).map(value => {
    const origin = parseUrl(value);
    if (origin.pathname !== '/') throw new Error('MCP allowed origins must not contain paths');
    return origin.origin;
  });
  return { enabled, publicUrl: url.href, allowedOrigins: [...new Set([url.origin, ...origins])], allowedHosts: [url.host] };
}
