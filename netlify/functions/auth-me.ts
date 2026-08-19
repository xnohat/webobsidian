import { handleMe } from '../lib/handlers.js';

export default async function handler(request: Request): Promise<Response> {
  return handleMe(request, process.env);
}

export const config = { path: '/auth/me' };
