import { handleLogin } from '../lib/handlers.js';

export default async function handler(request: Request): Promise<Response> {
  return handleLogin(request, process.env);
}

export const config = {
  path: '/auth/login',
  rateLimit: {
    windowLimit: 5,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
