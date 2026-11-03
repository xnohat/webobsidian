import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AgentApiError } from './errors.js';
import type { AgentApi } from './types.js';
export type { AgentApi } from './types.js';

export function createMcpServer(agentApi: AgentApi): McpServer {
  const server = new McpServer({ name: 'webobsidian', version: '0.1.0' });

  function ok(data: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }

  function fail(err: unknown) {
    const text = err instanceof AgentApiError ? (err.message.includes(String(err.status)) ? err.message : `${err.status}: ${err.message}`) : err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text }], isError: true };
  }

  const pathArg = z.string().min(1).describe('Vault-relative path, e.g. "Notes/Ideas.md"');

  server.registerTool(
    'list_notes',
    {
      title: 'List notes',
      description:
        'List markdown notes in the vault. Default order is most recently modified first; use folder to narrow to a subtree.',
      inputSchema: {
        offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
        limit: z.number().int().min(1).max(500).optional().describe('Max notes to return (default 100, max 500)'),
        folder: z.string().optional().describe('Only notes under this vault-relative folder'),
        sort: z.enum(['modified', 'created', 'name']).optional().describe('Sort key (default modified)'),
        order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default desc, asc for name)'),
      },
    },
    async ({ offset, limit, folder, sort, order }) => {
      try {
        return ok(await agentApi.listNotes({ offset, limit, folder, sort, order }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'read_note',
    {
      title: 'Read note',
      description:
        'Read a note with parsed frontmatter/tags/links plus its content version. For a long note, page it with offset/limit (lines) — the response reports totalLines and hasMore.',
      inputSchema: {
        path: pathArg,
        offset: z.number().int().min(0).optional().describe('First line to return (0-based, default 0)'),
        limit: z.number().int().min(1).max(2000).optional().describe('How many lines to return (default: the whole note)'),
      },
    },
    async ({ path, offset, limit }) => {
      try {
        return ok(await agentApi.readNote(path, { offset, limit }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'write_note',
    {
      title: 'Write note',
      description:
        'Create or overwrite a note. Pass base_version (from read_note) to write safely against a concurrent edit; the call fails with 409 instead of clobbering. Use "" to require that the note does not exist yet.',
      inputSchema: {
        path: pathArg,
        content: z.string().describe('Full markdown content to write'),
        base_version: z.string().optional().describe('Version returned by read_note ("" = note must not exist)'),
      },
    },
    async ({ path, content, base_version }) => {
      try {
        return ok(await agentApi.writeNote(path, content, base_version));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'append_note',
    {
      title: 'Append to note',
      description: 'Append text to a note (creates it if missing).',
      inputSchema: {
        path: pathArg,
        content: z.string().describe('Text to append'),
      },
    },
    async ({ path, content }) => {
      try {
        return ok(await agentApi.appendNote(path, content));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'edit_note',
    {
      title: 'Edit note (find/replace)',
      description:
        'Atomically replace a literal string in a note — no need to read and rewrite the whole file. If the string occurs more than once the call fails with the occurrence count, so pass more context or replace_all: true.',
      inputSchema: {
        path: pathArg,
        find: z.string().min(1).describe('Literal text to find (no regex)'),
        replace: z.string().describe('Literal replacement (empty = delete the match)'),
        replace_all: z.boolean().optional().describe('Replace every occurrence instead of failing on ambiguity'),
        base_version: z.string().optional().describe('Version from read_note, to also guard against concurrent edits'),
      },
    },
    async ({ path, find, replace, replace_all, base_version }) => {
      try {
        return ok(await agentApi.editNote(path, find, replace, { replaceAll: replace_all, baseVersion: base_version }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'grep_note',
    {
      title: 'Grep inside a note',
      description:
        'Every literal occurrence of a string in one note, with 1-based line numbers and optional surrounding lines. Use it to locate the exact context for edit_note.',
      inputSchema: {
        path: pathArg,
        q: z.string().min(1).describe('Literal text to find'),
        case_sensitive: z.boolean().optional().describe('Match case (default false)'),
        limit: z.number().int().min(1).max(100).optional().describe('Max matching lines (default 20)'),
        context: z.number().int().min(0).max(5).optional().describe('Include this many neighbouring lines'),
      },
    },
    async ({ path, q, case_sensitive, limit, context }) => {
      try {
        return ok(await agentApi.grepNote(path, q, { caseSensitive: case_sensitive, limit, context }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'delete_note',
    {
      title: 'Delete note',
      description: 'Move a note to the vault trash (recoverable, per the vault deleteMode).',
      inputSchema: { path: pathArg },
    },
    async ({ path }) => {
      try {
        return ok(await agentApi.deleteNote(path));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'search_notes',
    {
      title: 'Search notes',
      description:
        'Full-text search across the vault. Supports fielded queries like "tag:idea", "path:Notes/", "title:Foo".',
      inputSchema: {
        query: z.string().min(1).describe('Search query'),
        limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20, max 100)'),
      },
    },
    async ({ query, limit }) => {
      try {
        return ok(await agentApi.search(query, limit));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'get_backlinks',
    {
      title: 'Get backlinks',
      description: 'List notes that link to the given vault-relative path.',
      inputSchema: { path: pathArg },
    },
    async ({ path }) => {
      try {
        return ok(await agentApi.backlinks(path));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'list_tags',
    {
      title: 'List tags',
      description: 'List all tags used across the vault, with note counts.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await agentApi.tags());
      } catch (err) {
        return fail(err);
      }
    },
  );

  return server;
}
