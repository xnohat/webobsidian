import type { Request, Response, NextFunction } from 'express';
import { redactUrlCreds } from '../lib/redact.js';

/** Wrap async route handlers so rejections hit the error middleware. */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  const status = err?.status ?? 500;
  // Redact any URL-embedded credentials (e.g. a Git PAT baked into an
  // authenticated remote URL) before this message hits the client OR the logs.
  const message = redactUrlCreds(err?.message ?? 'Internal Server Error');
  if (status >= 500) console.error('[error]', message, err?.stack ? `\n${redactUrlCreds(err.stack)}` : '');
  res.status(status).json({ error: message,...(err?.code==='rename_confirmation_required'?{code:err.code,affectedCount:err.affectedCount}:err?.code==='rename_conflict'?{code:err.code,...(err.journalPath?{journalPath:err.journalPath}:{})}:{} ) });
}
