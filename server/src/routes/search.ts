import { Router } from 'express';
import { indexing } from '../services/indexing/coordinator.js';
import path from 'node:path';
import * as vault from '../services/vault.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { qmd, searchVault } from '../services/search.js';
import { backlinksFor, graphData, resolveLink, buildLinkGraph } from '../services/links.js';
import { resolveFile, indexedFilePaths } from '../services/fileindex.js';
import { resolveReference } from '../services/fileReferences.js';
import { readPropertyTypes, setPropertyType } from '../services/propertytypes.js';
import { getVaultPreferences } from '../services/vaultPreferences.js';
import { isUserIgnored, filterGraph } from '../services/vaultPreferencesFilters.js';

export const searchRouter = Router();
searchRouter.use(requireAuth);

searchRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    if (indexing.isStarted) indexing.assertReady(true);
    const q = String(req.query.q ?? '');
    // limit omitted / 0 → return every match; the client renders them incrementally.
    const limit = Math.max(0, Number(req.query.limit ?? 0) || 0);
    res.json({ query: q, hits: await searchVault(q, limit), ...(indexing.isStarted ? { index: indexing.status() } : {}) });
  }),
);

// Per-note match contexts for the rendered batch of results (Obsidian-style
// grouped search). Reads bodies lazily so broad queries stay cheap.
searchRouter.post(
  '/search/matches',
  asyncHandler(async (req, res) => {
    const { query, paths, matchCase, phrase } = req.body ?? {};
    // phrase=true → match the whole query as one needle (e.g. unlinked mentions
    // look for the exact note title, not each word of it).
    const terms = phrase
      ? [String(query ?? '').trim()].filter((t) => t.length >= 2)
      : qmd.queryTerms(String(query ?? ''));
    const { values } = await getVaultPreferences();
    const list = (Array.isArray(paths) ? paths : []).map((p) => String(p)).filter(p => !isUserIgnored(p, values.userIgnoreFilters)).slice(0, 80);
    const matches = await Promise.all(
      list.map((p) => qmd.matchesFor(p, terms, { caseSensitive: !!matchCase })),
    );
    res.json({ matches });
  }),
);

searchRouter.get(
  '/tags',
  asyncHandler(async (_req, res) => {
    if (indexing.isStarted) indexing.assertReady();
    res.json({ tags: qmd.allTags() });
  }),
);

searchRouter.get(
  '/properties',
  asyncHandler(async (_req, res) => {
    if (indexing.isStarted) indexing.assertReady();
    res.json({ properties: qmd.allProperties() });
  }),
);

searchRouter.get(
  '/property-types',
  asyncHandler(async (_req, res) => {
    res.json({ types: await readPropertyTypes() });
  }),
);

searchRouter.post(
  '/property-types',
  asyncHandler(async (req, res) => {
    const { key, type } = req.body ?? {};
    if (typeof key !== 'string' || typeof type !== 'string') {
      res.status(400).json({ error: 'key and type required' });
      return;
    }
    res.json({ types: await setPropertyType(key, type) });
  }),
);

searchRouter.get(
  '/backlinks',
  asyncHandler(async (req, res) => {
    if (indexing.isStarted) indexing.assertReady();
    const rel = String(req.query.path ?? '');
    res.json({ path: rel, backlinks: backlinksFor(rel) });
  }),
);

searchRouter.get(
  '/resolve',
  asyncHandler(async (req, res) => {
    if (indexing.isStarted) indexing.assertReady();
    const target = String(req.query.target ?? '');
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const resolvedPath = resolveReference(target, from, indexedFilePaths(), req.query.kind === 'markdown' ? 'markdown' : 'wiki');
    if (resolvedPath) { res.json({ target, path: resolvedPath }); return; }
    if (from && !target.startsWith('/')) {
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(from), target.split('#')[0]));
      if (!relative.startsWith('..') && !path.posix.isAbsolute(relative)) {
        const candidates = /\.[^./]+$/.test(relative) ? [relative] : [`${relative}.md`, `${relative}.markdown`];
        for (const candidate of candidates) {
          if (await vault.exists(candidate)) { res.json({ target, path: candidate }); return; }
        }
      }
    }
    // The link graph only indexes markdown notes, so a wikilink that points at a
    // non-markdown file with an explicit extension (e.g. `[[Foo.canvas]]`) misses.
    // Fall back to the vault-wide file index for those — but only when an explicit
    // non-markdown extension is present, so a bare `[[Foo]]` still resolves to a
    // note (or stays unresolved so the client can offer to create one).
    let resolved = resolveLink(target);
    if (!resolved && /\.[^./]+$/.test(target) && !/\.(md|markdown)$/i.test(target)) {
      resolved = resolveFile(target);
    }
    res.json({ target, path: resolved ?? null });
  }),
);

searchRouter.get(
  '/graph',
  asyncHandler(async (_req, res) => {
    if (indexing.isStarted) indexing.assertReady();
    const { values } = await getVaultPreferences();
    res.json(filterGraph(graphData(), values.userIgnoreFilters));
  }),
);

searchRouter.post(
  '/reindex',
  asyncHandler(async (_req, res) => {
    if (indexing.isStarted) {
      await indexing.waitForJob(indexing.requestJob('rebuild').jobId);
    } else {
      await qmd.build();
      await buildLinkGraph();
    }
    res.json({ ok: true });
  }),
);
