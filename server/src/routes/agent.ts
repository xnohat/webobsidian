import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { requireApiKey } from '../middleware/apikey.js';
import { agentOperations as api, AgentOperationError } from '../services/agentOperations.js';
import { listTasks } from './tasks.js';

/** REST and MCP share operations; HTTP parsing/status contracts stay here. */
export const agentRouter = Router();

async function respond(res: Response, operation: () => Promise<unknown>) {
  try { res.json(await operation()); }
  catch (error) {
    if (error instanceof AgentOperationError) { res.status(error.status).json(error.body); return; }
    throw error;
  }
}
// Express already decodes wildcard parameters; a second decode corrupts literal percent signs.
const notePath = (req: Request) => String((req.params as any)[0]);
agentRouter.get('/health', (_req, res) => res.json({ ok: true, service: 'webobsidian-agent-api', version: 'v1' }));
agentRouter.get('/notes', requireApiKey('read'), asyncHandler(async (req, res) => {
  await respond(res, () => api.listNotes({
    sort: req.query.sort as 'name' | 'created' | 'modified', order: req.query.order as 'asc' | 'desc',
    folder: String(req.query.folder ?? ''), offset: Number(req.query.offset), limit: Number(req.query.limit),
  }));
}));
agentRouter.get('/notes/*', requireApiKey('read'), asyncHandler(async (req, res) => {
  await respond(res, () => api.readNote(notePath(req), { offset: Number(req.query.offset), limit: Number(req.query.limit) }));
}));
agentRouter.put('/notes/*', requireApiKey('write'), asyncHandler(async (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  await respond(res, () => api.writeNote(notePath(req), content, req.body?.base_version));
}));
agentRouter.patch('/notes/*', requireApiKey('write'), asyncHandler(async (req, res) => {
  const body: unknown = req.body;
  if (typeof body === 'object' && body !== null && Object.prototype.hasOwnProperty.call(body, 'find')) {
    const b = body as {find: unknown; replace: unknown; replaceAll?: unknown; base_version?: string};
    if (Object.prototype.hasOwnProperty.call(body, 'append') || typeof b.find !== 'string' || b.find === '' || typeof b.replace !== 'string') {
      res.status(400).json({ error: 'invalid_body' }); return;
    }
    const find = b.find, replace = b.replace;
    await respond(res, () => api.editNote(notePath(req), find, replace, { replaceAll: b.replaceAll === true, baseVersion: b.base_version }));
  } else {
    const append = typeof req.body?.append === 'string' ? req.body.append : '';
    await respond(res, () => api.appendNote(notePath(req), append));
  }
}));
agentRouter.delete('/notes/*', requireApiKey('write'), asyncHandler(async (req, res) => {
  await respond(res, () => api.deleteNote(notePath(req)));
}));
agentRouter.get('/note-matches', requireApiKey('read'), asyncHandler(async (req, res) => {
  await respond(res, () => api.grepNote(String(req.query.path ?? ''), String(req.query.q ?? ''), {
    caseSensitive: req.query.case_sensitive === 'true' || req.query.case_sensitive === '1',
    limit: Number(req.query.limit), context: Number(req.query.context),
  }));
}));
agentRouter.get('/search', requireApiKey('search'), asyncHandler(async (req, res) => {
  await respond(res, () => api.search(String(req.query.q ?? ''), Number(req.query.limit)));
}));
agentRouter.get('/backlinks', requireApiKey('read'), asyncHandler(async (req, res) => {
  await respond(res, () => api.backlinks(String(req.query.path ?? '')));
}));
agentRouter.get('/tasks', requireApiKey('read'), asyncHandler(async (req, res) => {
  res.json(await listTasks(req.query as Record<string, unknown>));
}));
agentRouter.get('/tags', requireApiKey('read'), asyncHandler(async (_req, res) => {
  await respond(res, () => api.tags());
}));
