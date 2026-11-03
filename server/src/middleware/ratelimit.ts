import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

/**
 * In-memory sliding-window brute-force guard for the login endpoint. Keyed by
 * client IP. Single-process app (no DB), so an in-memory map is sufficient; it
 * resets on restart, which is fine for throttling interactive guessing.
 */
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10; // per window per IP

const attempts = new Map<string, number[]>();

/**
 * Pick the bucket key for a login attempt.
 *
 * Default: the real TCP peer address, NOT req.ip. req.ip derives from
 * X-Forwarded-For when `trust proxy` is enabled, which a directly-connected
 * attacker can spoof per request to get a fresh bucket and bypass the limit
 * (security report F-03).
 *
 * Behind a tunnel/reverse proxy (e.g. cloudflared), though, every visitor
 * shares the proxy's socket address — so a stranger's 10 wrong guesses would
 * lock the owner out too. When `CLIENT_IP_HEADER` is configured (e.g.
 * `CF-Connecting-IP`, which Cloudflare overwrites and clients cannot forge
 * through it), we key on that header instead, but only when the socket peer
 * is itself a trusted proxy per the app's `trust proxy` setting. A peer that
 * isn't trusted can't pick its own bucket.
 */
export function rateLimitKey(
  remoteAddress: string | undefined,
  headerValue: string | string[] | undefined,
  headerName: string | undefined,
  isTrustedPeer: (addr: string) => boolean,
): string {
  const peer = remoteAddress || 'unknown';
  if (!headerName || peer === 'unknown' || !isTrustedPeer(peer)) return peer;
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  // First entry only (X-Forwarded-For style lists), and only something shaped
  // like an IP — anything else falls back to the peer so junk can't mint buckets.
  const client = raw?.split(',')[0]?.trim();
  if (!client || client.length > 45 || !/^[0-9a-fA-F.:]+$/.test(client)) return peer;
  return client;
}

function clientIp(req: Request): string {
  const trustFn = req.app?.get('trust proxy fn') as ((addr: string, i: number) => boolean) | undefined;
  const headerName = config.clientIpHeader;
  return rateLimitKey(
    req.socket.remoteAddress,
    headerName ? req.headers[headerName.toLowerCase()] : undefined,
    headerName,
    (addr) => (trustFn ? trustFn(addr, 0) : false),
  );
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => t > now - WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((recent[0] + WINDOW_MS - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Too many login attempts. Try again later.', retryAfter });
    return;
  }
  recent.push(now);
  attempts.set(ip, recent);
  // Opportunistic cleanup so the map can't grow unbounded across many IPs.
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) {
      if (v.every((t) => t <= now - WINDOW_MS)) attempts.delete(k);
    }
  }
  next();
}
