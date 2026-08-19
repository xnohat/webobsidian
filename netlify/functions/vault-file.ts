import { handleVaultFile } from '../lib/handlers.js';

export default async function handler(request: Request): Promise<Response> {
  return handleVaultFile(request, process.env);
}

export const config = { path: '/api/files/content' };
