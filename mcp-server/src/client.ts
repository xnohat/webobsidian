/**
 * Thin client over the WebObsidian Agent API (`/api/v1`).
 *
 * Adopted from the fork `Absenthome/webobsidian` (`mcp-server/`), extended here with the
 * read-modify-write surface this fork added to the API (segmented reads, content
 * versions, atomic find/replace, per-note grep). See docs/UPSTREAM_PR_MERGES.md →
 * "Adopted from other forks".
 */
import { AgentApiError } from './errors.js';
import type { NoteListOptions, NoteRead } from './types.js';

/** Vault-relative note path -> URL path segment, preserving `/` (matches the server's `/notes/*`). */
export function encodeNotePath(path: string): string {
  return path
    .split('/')
    .filter((s) => s.length > 0)
    .map(encodeURIComponent)
    .join('/');
}

export function createAgentApiClient(options: { baseUrl: string; apiKey: string }) {
  const BASE_URL = options.baseUrl.replace(/\/+$/, '');
  const API_KEY = options.apiKey;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}/api/v1${path}`, {
      method,
      headers: {
        'X-API-Key': API_KEY!,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;

    if (!res.ok) {
      const msg = (json && (json.error || json.message)) || res.statusText;
      const extra =
        json && json.currentVersion !== undefined ? ` (current version ${json.currentVersion || '"" (note does not exist)'})` : '';
      throw new AgentApiError(res.status, `Agent API ${method} ${path} -> ${res.status}: ${msg}${extra}`);
    }
    return json as T;
  }

  return {
    listNotes: (opts: NoteListOptions = {}) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(opts)) {
        if (v !== undefined && v !== '') qs.set(k, String(v));
      }
      const query = qs.toString();
      return request<{
        total: number;
        offset: number;
        limit: number;
        sort: string;
        order: string;
        folder?: string;
        notes: string[];
      }>('GET', `/notes${query ? `?${query}` : ''}`);
    },

    readNote: (path: string, opts: { offset?: number; limit?: number } = {}) => {
      const qs = new URLSearchParams();
      if (opts.offset !== undefined) qs.set('offset', String(opts.offset));
      if (opts.limit !== undefined) qs.set('limit', String(opts.limit));
      const query = qs.toString();
      return request<NoteRead>('GET', `/notes/${encodeNotePath(path)}${query ? `?${query}` : ''}`);
    },

    /** Write a note. `baseVersion` turns this into a safe read-modify-write ("" = must not exist). */
    writeNote: (path: string, content: string, baseVersion?: string) =>
      request<{ ok: true; path: string; version: string }>('PUT', `/notes/${encodeNotePath(path)}`, {
        content,
        ...(baseVersion !== undefined ? { base_version: baseVersion } : {}),
      }),

    appendNote: (path: string, append: string) =>
      request<{ ok: true; path: string; size: number; version: string }>(
        'PATCH',
        `/notes/${encodeNotePath(path)}`,
        { append },
      ),

    /** Atomic literal find/replace. Ambiguous matches fail with 409 instead of guessing. */
    editNote: (path: string, find: string, replace: string, opts: { replaceAll?: boolean; baseVersion?: string } = {}) =>
      request<{ ok: true; path: string; replaced: number; version: string }>(
        'PATCH',
        `/notes/${encodeNotePath(path)}`,
        {
          find,
          replace,
          ...(opts.replaceAll !== undefined ? { replaceAll: opts.replaceAll } : {}),
          ...(opts.baseVersion !== undefined ? { base_version: opts.baseVersion } : {}),
        },
      ),

    /** Literal grep inside one note: every occurrence with its 1-based line number. */
    grepNote: (
      path: string,
      q: string,
      opts: { caseSensitive?: boolean; limit?: number; context?: number } = {},
    ) => {
      const qs = new URLSearchParams({ path, q });
      if (opts.caseSensitive !== undefined) qs.set('case_sensitive', String(opts.caseSensitive));
      if (opts.limit !== undefined) qs.set('limit', String(opts.limit));
      if (opts.context !== undefined) qs.set('context', String(opts.context));
      return request<{
        path: string;
        query: string;
        count: number;
        truncated: boolean;
        matches: { line: number; text: string; ranges: { start: number; end: number }[]; pre?: string; post?: string }[];
      }>('GET', `/note-matches?${qs.toString()}`);
    },

    deleteNote: (path: string) =>
      request<{ ok: true; trashed: string }>('DELETE', `/notes/${encodeNotePath(path)}`),

    search: (q: string, limit?: number) => {
      const qs = new URLSearchParams({ q });
      if (limit !== undefined) qs.set('limit', String(limit));
      return request<{
        query: string;
        hits: { path: string; title: string; score: number; tags: string[]; snippet: string }[];
      }>('GET', `/search?${qs.toString()}`);
    },

    backlinks: (path: string) =>
      request<{ path: string; backlinks: string[] }>('GET', `/backlinks?path=${encodeURIComponent(path)}`),

    tags: () => request<{ tags: { tag: string; count: number }[] }>('GET', '/tags'),
  };

}
