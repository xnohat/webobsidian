import { Router } from 'express';
import { indexing } from '../services/indexing/coordinator.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { qmd } from '../services/search.js';
import { filterTasks, type TaskFilter, type TaskRecord } from '../services/tasks.js';

/**
 * Tasks (PRD FR-15) — Kanban board over `type: task` notes. Backed by the QMD
 * index's `tasks` map (see services/search.ts), so no per-request vault walk.
 */
export const tasksRouter = Router();
tasksRouter.use(requireAuth);

/** Shared with the agent API route (`GET /api/v1/tasks`) so both surfaces
 *  accept exactly the same query params. */
export function filterFromQuery(query: Record<string, unknown>): TaskFilter {
  return {
    folder: typeof query.folder === 'string' ? query.folder : undefined,
    status: typeof query.status === 'string' ? query.status : undefined,
    priority: typeof query.priority === 'string' ? query.priority : undefined,
    owner: typeof query.owner === 'string' ? query.owner : undefined,
    q: typeof query.q === 'string' ? query.q : undefined,
  };
}

/** Shared by GET /api/tasks (web) and GET /api/v1/tasks (agent) — one place
 *  that loads the index and applies the filter, so both routes stay identical. */
export async function listTasks(query: Record<string, unknown>): Promise<{ tasks: TaskRecord[] }> {
  if (indexing.isStarted) indexing.assertReady();
  const tasks = await qmd.allTasks();
  return { tasks: filterTasks(tasks, filterFromQuery(query)) };
}

tasksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listTasks(req.query as Record<string, unknown>));
  }),
);
