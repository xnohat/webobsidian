import { handleAuthStatus } from '../lib/handlers.js';

export default async function handler(request: Request): Promise<Response> {
  return handleAuthStatus(request, process.env);
}

export const config = { path: '/auth/status' };
