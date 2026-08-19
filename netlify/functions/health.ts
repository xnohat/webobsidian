import { handleHealth } from '../lib/handlers.js';

export default async function handler(request: Request): Promise<Response> {
  return handleHealth(request, process.env);
}

export const config = { path: '/api/health' };
