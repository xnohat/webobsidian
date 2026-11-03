import { describe, it, expect } from 'vitest';
import { readMcpConfig } from './mcpConfig.js';

describe('MCP configuration', () => {
  it('is disabled by default and does not require a public URL', () => {
    expect(readMcpConfig({}).enabled).toBe(false);
  });
  it('requires a valid public endpoint and never reflects credentials in errors', () => {
    for (const url of ['', 'http://example.com/mcp', 'https://secret:token@example.com/mcp', 'https://example.com/mcp?q=secret', 'https://example.com/mcp#x', 'https://example.com/api/v1']) {
      expect(() => readMcpConfig({ WEBOBSIDIAN_MCP_ENABLED: 'true', WEBOBSIDIAN_MCP_PUBLIC_URL: url })).toThrow(/MCP/);
      try { readMcpConfig({ WEBOBSIDIAN_MCP_ENABLED: 'true', WEBOBSIDIAN_MCP_PUBLIC_URL: url }); } catch (e) { expect(String(e)).not.toMatch(/secret|token/); }
    }
  });
  it('permits loopback HTTP and exact origins only', () => {
    const config = readMcpConfig({ WEBOBSIDIAN_MCP_ENABLED: 'true', WEBOBSIDIAN_MCP_PUBLIC_URL: 'http://127.0.0.1:8787/mcp', WEBOBSIDIAN_MCP_ALLOWED_ORIGINS: 'https://perplexity.ai, https://www.perplexity.ai' });
    expect(config.allowedHosts).toEqual(['127.0.0.1:8787']);
    expect(config.allowedOrigins).toContain('http://127.0.0.1:8787');
    expect(config.allowedOrigins).toContain('https://perplexity.ai');
    for (const origin of ['*', 'https://*.example.com', 'https://example.com/path', 'null']) {
      expect(() => readMcpConfig({ WEBOBSIDIAN_MCP_ENABLED: 'true', WEBOBSIDIAN_MCP_PUBLIC_URL: 'https://notes.example.com/mcp', WEBOBSIDIAN_MCP_ALLOWED_ORIGINS: origin })).toThrow();
    }
  });
});
