import type { AgentApi } from '@webobsidian/mcp-server/types';
import { AgentApiError } from '@webobsidian/mcp-server/errors';
import type { Scope } from './apikeys.js';
import { agentOperations } from './agentOperations.js';

const requiredScopes: Record<keyof AgentApi, Scope> = {
  listNotes: 'read', readNote: 'read', grepNote: 'read', backlinks: 'read', tags: 'read',
  search: 'search', writeNote: 'write', appendNote: 'write', editNote: 'write', deleteNote: 'write',
};

/** The authenticated request owns this immutable snapshot, never a global API client. */
export function createScopedAgentApi(scopes: readonly Scope[]): AgentApi {
  const allowed = new Set(scopes);
  return Object.fromEntries(Object.entries(requiredScopes).map(([method, scope]) => [method, async (...args: unknown[]) => {
    if (!allowed.has(scope)) throw new AgentApiError(403, `Missing scope: ${scope}`);
    const operation = agentOperations[method as keyof AgentApi] as (...args: unknown[]) => Promise<unknown>;
    try { return await operation(...args); }
    catch (error) {
      if (error instanceof AgentApiError) throw error;
      // Vault's deliberate validation failures are useful to clients. Filesystem and
      // unexpected errors may contain private paths; never expose their message.
      const status = (error as { status?: unknown } | null)?.status;
      if (status === 503 && error instanceof Error && error.message === 'INDEX_NOT_READY') throw new AgentApiError(503, 'INDEX_NOT_READY');
      if (typeof status === 'number' && status >= 400 && status < 500 && error instanceof Error) {
        throw new AgentApiError(status, error.message);
      }
      throw new AgentApiError(500, 'Internal server error');
    }
  }])) as unknown as AgentApi;
}
