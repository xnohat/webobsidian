import type { AgentApi, NoteListOptions } from '@webobsidian/mcp-server/types';
import { AgentApiError } from '@webobsidian/mcp-server/errors';
import * as vault from './vault.js';
import { indexing } from './indexing/coordinator.js';
import { qmd, searchVault } from './search.js';
import { backlinksFor, buildLinkGraph } from './links.js';
import { parseNote } from './markdown.js';
import { applyEdit } from './noteedit.js';
import { contentVersion, checkVersion } from './noteversion.js';
import { grepNote } from './notegrep.js';

/** Keeps the pre-existing REST status/body while sharing operations with MCP. */
export class AgentOperationError extends AgentApiError {
  constructor(status: number, public readonly body: Record<string, unknown>) {
    const detail = typeof body.currentVersion === 'string' ? ` (current version ${body.currentVersion || '"" (note does not exist)'})`
      : typeof body.count === 'number' ? ` (occurrences: ${body.count})` : '';
    super(status, String(body.error) + detail);
  }
}
function reject(status: number, error: string, extra: Record<string, unknown> = {}): never {
  throw new AgentOperationError(status, { error, ...extra });
}
async function reindex(rel: string, removed = false) {
  if (indexing.isStarted) {
    indexing.notify({ root: await vault.getVaultRoot(), paths: [rel], source: 'agent' });
    return;
  }
  if (removed) qmd.remove(rel);
  else void qmd.upsert(rel).catch(() => {});
  void buildLinkGraph().catch(() => {});
}

/** Shared implementation: all writes still pass through the vault mutation queue. */
export const agentOperations = {
  async listNotes(opts: NoteListOptions = {}) {
    const sort = opts.sort === 'name' || opts.sort === 'created' ? opts.sort : 'modified';
    const order = opts.order === 'asc' || opts.order === 'desc' ? opts.order : sort === 'name' ? 'asc' : 'desc';
    const all = await vault.listMarkdownFilesSorted(sort, order);
    const folder = String(opts.folder ?? '').replace(/^\/+|\/+$/g, '');
    const filtered = folder ? all.filter(p => p === folder || p.startsWith(folder + '/')) : all;
    const offset = Number(opts.offset ?? 0) || 0;
    const limit = Math.min(Number(opts.limit ?? 100) || 100, 500);
    return { total: filtered.length, offset, limit, sort, order, folder: folder || undefined, notes: filtered.slice(offset, offset + limit) };
  },
  async readNote(rel: string, opts: {offset?: number; limit?: number} = {}) {
    if (!(await vault.exists(rel))) reject(404, 'Not found');
    const content = await vault.readFileText(rel);
    const note = parseNote(rel, content);
    const lines = content.split('\n');
    const totalLines = lines.length;
    const offset = Math.max(0, Number(opts.offset ?? 0) || 0);
    const rawLimit = Number(opts.limit ?? 0) || 0;
    const limit = rawLimit > 0 ? Math.min(rawLimit, 2000) : totalLines;
    return { path: rel, content: lines.slice(offset, offset + limit).join('\n'), version: contentVersion(content), totalLines, offset, limit, hasMore: offset + limit < totalLines, title: note.title, frontmatter: note.frontmatter, tags: note.tags, links: note.links };
  },
  async writeNote(rel: string, content: string, baseVersion?: string) {
    return vault.withVaultMutation(async () => {
      const strict = ['1', 'true', 'yes'].includes((process.env.WEBOBSIDIAN_AGENT_REQUIRE_VERSION ?? '').toLowerCase());
      if (typeof baseVersion !== 'string' && strict) reject(400, 'missing_base_version');
      await vault.mutateFileText(rel, current => {
        if (typeof baseVersion === 'string') {
          const check = checkVersion(current, baseVersion);
          if (!check.ok) reject(409, 'version_conflict', { currentVersion: check.currentVersion });
        }
        return { content, result: undefined };
      });
      await reindex(rel);
      return { ok: true as const, path: rel, version: contentVersion(content) };
    });
  },
  async appendNote(rel: string, append: string) {
    return vault.withVaultMutation(async () => {
      const written = await vault.mutateFileText(rel, current => {
        const existing = current ?? '';
        const content = existing && !existing.endsWith('\n') ? existing + '\n' + append : existing + append;
        return { content, result: content.length };
      });
      await reindex(rel);
      return { ok: true as const, path: rel, size: written.result, version: written.version };
    });
  },
  async editNote(rel: string, find: string, replace: string, opts: {replaceAll?: boolean; baseVersion?: string} = {}) {
    return vault.withVaultMutation(async () => {
      if (typeof find !== 'string' || find === '' || typeof replace !== 'string') reject(400, 'invalid_body');
      const edited = await vault.mutateFileText(rel, content => {
        if (content === null) reject(404, 'Not found');
        if (typeof opts.baseVersion === 'string' && opts.baseVersion !== contentVersion(content)) {
          reject(409, 'version_conflict', { currentVersion: contentVersion(content) });
        }
        const result = applyEdit(content, find, replace, opts.replaceAll === true);
        if ('error' in result) reject(409, result.error, result.error === 'find_ambiguous' ? { count: result.count } : {});
        return { content: result.content, result: result.replaced };
      });
      await reindex(rel);
      return { ok: true as const, path: rel, replaced: edited.result, version: edited.version };
    });
  },
  async deleteNote(rel: string) {
    return vault.withVaultMutation(async () => {
      if (!(await vault.exists(rel))) reject(404, 'Not found');
      const trashed = await vault.trash(rel);
      await reindex(rel, true);
      return { ok: true as const, trashed };
    });
  },
  async grepNote(rel: string, q: string, opts: {caseSensitive?: boolean; limit?: number; context?: number} = {}) {
    if (!q) reject(400, 'missing_query');
    if (!(await vault.exists(rel))) reject(404, 'Not found');
    const caseSensitive = opts.caseSensitive === true;
    const limit = Math.min(Number(opts.limit ?? 20) || 20, 100);
    const context = Math.min(Number(opts.context ?? 0) || 0, 5);
    const result = grepNote(await vault.readFileText(rel), q, { caseSensitive, maxMatches: limit, context });
    return { path: rel, query: q, caseSensitive, ...result };
  },
  async search(q: string, limit?: number) {
    if (indexing.isStarted) indexing.assertReady();
    return { query: q, hits: await searchVault(q, Math.min(Number(limit ?? 20) || 20, 100)), ...(indexing.isStarted ? {index:indexing.status()} : {}) };
  },
  async backlinks(rel: string) {
    if (indexing.isStarted) indexing.assertReady();
    return { path: rel, backlinks: backlinksFor(rel), ...(indexing.isStarted ? {index:indexing.status()} : {}) };
  },
  async tags() {
    if (indexing.isStarted) indexing.assertReady();
    return { tags: qmd.allTags(), ...(indexing.isStarted ? {index:indexing.status()} : {}) };
  },
} satisfies AgentApi;
