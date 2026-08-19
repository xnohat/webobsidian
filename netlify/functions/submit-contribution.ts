import { handleSubmitContribution } from '../lib/handlers.js';

export default async function handler(request: Request): Promise<Response> {
  return handleSubmitContribution(request, process.env);
}

export const config = {
  path: '/api/contributions',
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
