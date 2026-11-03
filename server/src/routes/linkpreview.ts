import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { getLinkPreview } from '../services/linkpreview.js';

export const linkPreviewRouter = Router();
linkPreviewRouter.use(requireAuth);

// GET /api/linkpreview?url=… → LinkPreview JSON, or 404 so clients keep the plain link.
linkPreviewRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const preview = await getLinkPreview(String(req.query.url ?? ''));
    if (!preview) {
      res.status(404).json({ error: 'No preview available' });
      return;
    }
    res.json(preview);
  }),
);
