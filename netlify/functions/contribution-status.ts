import { handleSubmitContribution } from '../lib/handlers.js';

export default handleSubmitContribution;

export const config = {
  path: '/api/contributions/status',
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
