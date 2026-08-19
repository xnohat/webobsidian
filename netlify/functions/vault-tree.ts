import { handleVaultTree } from '../lib/handlers.js';

export default async function handler(request: Request): Promise<Response> {
  return handleVaultTree(request, process.env);
}

export const config = { path: '/api/files/' };
