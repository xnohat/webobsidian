import type { RuntimeEnvironment } from '../netlify/lib/config.js';
import {
  handleAuthStatus,
  handleHealth,
  handleLogin,
  handleLogout,
  handleMe,
  handleSubmitContribution,
  handleVaultFile,
  handleVaultTree,
} from '../netlify/lib/handlers.js';
import { json } from '../netlify/lib/http.js';

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface CloudflareEnvironment extends RuntimeEnvironment {
  GITHUB_TOKEN: string;
  GITHUB_UPSTREAM_OWNER: string;
  GITHUB_FORK_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_STAGING_BRANCH: string;
  EDITOR_PASSWORD: string;
  SESSION_SECRET: string;
  ASSETS: AssetBinding;
  LOGIN_RATE_LIMITER: RateLimitBinding;
  CONTRIBUTION_RATE_LIMITER: RateLimitBinding;
}

function actorKey(request: Request, route: string): string {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  return `${route}:${ip}`;
}

async function enforceRateLimit(
  request: Request,
  route: string,
  limiter: RateLimitBinding,
): Promise<Response | undefined> {
  const { success } = await limiter.limit({ key: actorKey(request, route) });
  if (success) return undefined;
  return json({ error: 'Too many requests' }, { status: 429 });
}

export async function routeRequest(
  request: Request,
  env: CloudflareEnvironment,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;

  if (pathname === '/api/health') return handleHealth(request, env);
  if (pathname === '/auth/status') return handleAuthStatus(request, env);
  if (pathname === '/auth/me') return handleMe(request, env);
  if (pathname === '/auth/logout') return handleLogout(request);
  if (pathname === '/auth/login') {
    const limited = await enforceRateLimit(request, pathname, env.LOGIN_RATE_LIMITER);
    return limited ?? handleLogin(request, env);
  }
  if (pathname === '/api/files/content') return handleVaultFile(request, env);
  if (pathname === '/api/files' || pathname === '/api/files/') {
    return handleVaultTree(request, env);
  }
  if (pathname === '/api/contributions/status') {
    return handleSubmitContribution(request, env);
  }
  if (pathname === '/api/contributions') {
    if (request.method === 'POST') {
      const limited = await enforceRateLimit(request, pathname, env.CONTRIBUTION_RATE_LIMITER);
      if (limited) return limited;
    }
    return handleSubmitContribution(request, env);
  }

  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
    return json({ error: 'Not found' }, { status: 404 });
  }
  return env.ASSETS.fetch(request);
}

export default {
  fetch: routeRequest,
};
