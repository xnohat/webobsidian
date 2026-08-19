import { handleLogout } from '../lib/handlers.js';

export default async function handler(request: Request): Promise<Response> {
  return handleLogout(request);
}

export const config = { path: '/auth/logout' };
