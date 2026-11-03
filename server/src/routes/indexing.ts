import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { indexing } from '../services/indexing/coordinator.js';

export const indexingRouter = Router();
indexingRouter.use(requireAuth);
indexingRouter.get('/status', (_req, res) => { res.json(indexing.status()); });
indexingRouter.post('/jobs', asyncHandler(async (req, res) => {
  const mode = req.body?.mode;
  if (mode !== 'reconcile' && mode !== 'rebuild') {
    res.status(400).json({ error: 'mode must be reconcile or rebuild' });
    return;
  }
  res.status(202).json(indexing.requestJob(mode));
}));
