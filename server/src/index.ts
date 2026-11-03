import express, { type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs, readFileSync } from 'node:fs';
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

import { config } from './config.js';
import { loadSettings, getSettings, setPasswordIfInitial } from './bootstrap.js';
import { errorHandler } from './middleware/error.js';
import { COOKIE_NAME } from './middleware/auth.js';
import { verifyToken } from './services/auth.js';
import { authRouter } from './routes/auth.js';
import { filesRouter } from './routes/files.js';
import { tasksRouter } from './routes/tasks.js';
import { searchRouter } from './routes/search.js';
import { settingsRouter } from './routes/settings.js';
import { gitRouter } from './routes/git.js';
import { linkPreviewRouter } from './routes/linkpreview.js';
import { keysRouter } from './routes/keys.js';
import { pluginsRouter } from './routes/plugins.js';
import { agentRouter } from './routes/agent.js';
import { createMcpRouter } from './routes/mcp.js';
import { readMcpConfig } from './services/mcpConfig.js';
import { uiStateRouter } from './routes/uistate.js';
import { sharesRouter, publicSharesRouter } from './routes/shares.js';
import { sharePageRouter } from './routes/sharepage.js';
import { indexing } from './services/indexing/coordinator.js';
import { indexingRouter } from './routes/indexing.js';
import { setBroadcaster, broadcast } from './services/realtime.js';
import { getVaultRoot, ensureVault } from './services/vault.js';
import { startAutoSync, stopAutoSync } from './services/autosync.js';
import { startTrashRetention } from './services/trashretention.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Product version (the repo's root package.json — the server workspace has its own 0.1.x
 * counter, which is not what an operator means by "which version"). Resolved relative to
 * this module so it works both from `server/dist/index.js` inside the image (where
 * ../../package.json is /app/package.json) and from `server/src/index.ts` under tsx.
 */
const VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
})();

// Keep the local server alive on stray async errors (e.g. a deferred library task
// throwing) instead of crashing the whole process — log loudly so bugs aren't hidden.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

async function main() {
  const mcpConfig = readMcpConfig(process.env);
  await loadSettings();
  await setPasswordIfInitial();
  await ensureVault();

  const app = express();
  // Honour X-Forwarded-* per the deployment's proxy topology (TRUST_PROXY).
  // Default true (trust the immediate hop) so X-Forwarded-Proto-based `Secure`
  // cookies work behind the recommended reverse-proxy setup without extra config.
  // This is safe against F-03: the login rate limiter keys on the TCP socket
  // address (see middleware/ratelimit.ts), not the spoofable X-Forwarded-For.
  // Set TRUST_PROXY=false for a directly-exposed instance with no proxy.
  app.set('trust proxy', config.trustProxy);
  app.use('/mcp', createMcpRouter(mcpConfig));
  // Bound plugin settings before the general file-content JSON parser.
  const pluginDataJson = express.json({ limit: '1mb' });
  app.use((req, res, next) => {
    if (req.method === 'PUT' && /^\/api\/plugins\/[^/]+\/data$/.test(req.path)) pluginDataJson(req, res, next);
    else next();
  });
  app.use(express.json({ limit: '32mb' }));
  app.use(cookieParser());

  // Per-request CSP nonce — used by the SSR share page's inline <script>.
  app.use((_req, res, next) => {
    res.locals.cspNonce = randomBytes(16).toString('base64');
    next();
  });
  // Security headers. The CSP intentionally does NOT emit `upgrade-insecure-requests`
  // (it would break plain-HTTP self-hosting). `script-src` is 'self' + per-request
  // nonce; `style-src` allows inline styles (React inline styles + the SSR page's
  // <style>). Note: inline <script> inside ```html render-blocks won't execute under
  // this policy — acceptable for the marginal XSS hardening it buys.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          objectSrc: ["'none'"],
          frameSrc: [
            "'self'",
            'blob:',
            // Authored web embeds are rebuilt with an opaque-origin sandbox.
            // Other parent-page directives remain restricted to this app.
            'https:',
            'http:',
          ],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          // The app frames its own content — `![[doc.pdf]]` and the PDF file view load
          // `/api/files/content` in an iframe (FR-21). 'none' blocks the browser's
          // viewer with "Framing … violates frame-ancestors 'none'" and leaves an empty
          // pane; 'self' prevents third-party sites from framing the app itself.
          frameAncestors: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
      // Allow social crawlers / other sites to load public share og:images.
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  if (!config.isProd) {
    app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
  }

  // Health (no auth) — for the docker healthcheck and for answering "which build is this?".
  // `version` is the repo version; `build` is the git commit the image was built from,
  // baked in by the deploy pipeline through the GIT_SHA build arg ("dev" = built outside it).
  app.get('/healthz', (_req, res) =>
    res.json({
      ok: true,
      version: VERSION,
      build: process.env.WEBOBSIDIAN_BUILD_SHA || 'dev',
    }),
  );

  // Routes. NOTE: specific /api/* routers must be registered BEFORE the broad
  // '/api' search router, whose router-level requireAuth middleware would
  // otherwise gate every /api/* path (incl. /api/v1 and /api/keys) by prefix.
  app.use('/auth', authRouter);
  app.use('/api/v1', agentRouter); // agent API (api-key auth)
  app.use('/api/files', filesRouter);
  app.use('/api/tasks', tasksRouter); // Kanban board over type: task notes (FR-15)
  app.use('/api/settings', settingsRouter);
  app.use('/api/git', gitRouter);
  app.use('/api/keys', keysRouter);
  app.use('/api/linkpreview', linkPreviewRouter);
  app.use('/api/plugins', pluginsRouter);
  app.use('/api/uistate', uiStateRouter);
  app.use('/api/shares', sharesRouter); // manage public share links (auth)
  app.use('/public/shares', publicSharesRouter); // shared-note content (NO auth)
  app.use('/share', sharePageRouter); // SSR public share page (NO auth, SEO/OG meta)
  app.use('/api/index', indexingRouter);
  app.use('/api', searchRouter); // /api/search, /api/tags, /api/backlinks, /api/graph...

  // A plain (non-upgrade) GET /ws means a proxy in front stripped the WebSocket
  // Upgrade header. Say so, instead of the SPA fallback answering 200 with
  // index.html — which the browser reports as an opaque handshake failure.
  app.get('/ws', (_req, res) => {
    res.status(426).setHeader('Upgrade', 'websocket').json({
      error: 'WebSocket upgrade required — if you are behind a proxy/tunnel, enable WebSocket support there.',
    });
  });

  // Static SPA (built into server/public)
  const publicDir = path.join(__dirname, '..', 'public');
  if (await dirExists(publicDir)) {
    // Vite's /assets/* file names carry a content hash, so they never change in
    // place: let browsers keep them for a year. Everything else (index.html,
    // manifest, icons) keeps the default revalidation so a deploy shows up at once.
    app.use(
      '/assets',
      express.static(path.join(publicDir, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
    );
    app.use(express.static(publicDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/public')) return next();
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  app.use(errorHandler);

  const server = http.createServer(app);
  const wss = setupWebsocket(server);
  await indexing.start(await getVaultRoot());
  startAutoSync();
  startTrashRetention();

  server.listen(config.port, config.host, () => {
    console.log(`\n  WebObsidian server → http://${config.host}:${config.port}`);
    console.log(`  Vault: ${config.defaultVaultPath}`);
    console.log(`  Data:  ${config.dataDir}\n`);
  });

  // --- Graceful shutdown ---
  // The CLI (`packages/webo`) sends SIGTERM to stop a background daemon cleanly.
  // Without these handlers a SIGTERM would just kill the process — watcher + autosync
  // would be left dangling and in-flight requests could be aborted mid-response.
  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[shutdown] received ${signal} — closing server...`);
    // Give in-flight HTTP requests a moment to finish before we force-exit.
    setTimeout(() => {
      console.log('[shutdown] force-exiting after timeout');
      process.exit(128 + (signal === 'SIGTERM' ? 15 : 2));
    }, 8000).unref();
    try {
      server.close(() => {
        console.log('[shutdown] HTTP server closed');
      });
      wss.close(() => {
        console.log('[shutdown] WebSocket server closed');
      });
      // chokidar watcher — gracefully close, best-effort (it may be in polling mode).
      await indexing.close();
      console.log('[shutdown] file watcher closed');
      // autosync periodic timer.
      stopAutoSync();
      console.log('[shutdown] autosync stopped');
    } catch (err) {
      console.error('[shutdown] error during teardown:', err);
    }

  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// --- WebSocket: broadcast filesystem & UI-state events to connected clients ----
// Auth-gated: the WS stream leaks vault structure (paths of created/changed/deleted
// files), so the upgrade is rejected unless the request carries a valid session.
function setupWebsocket(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(req.url ?? '', 'http://localhost').pathname;
    } catch {
      pathname = '';
    }
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const token = cookieValue(req.headers.cookie, COOKIE_NAME) ?? bearerToken(req.headers.authorization);
    void (async () => {
      if (!token || !(await verifyToken(token))) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    })();
  });

  // Heartbeat: ping every 30s so idle connections aren't closed by proxies
  // (Cloudflare drops a WebSocket after ~100s without traffic), and terminate
  // clients that didn't answer the previous ping so dead sockets don't pile up.
  const alive = new WeakMap<WebSocket, boolean>();
  wss.on('connection', (ws) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    ws.send(JSON.stringify({ type: 'hello' }));
  });
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!alive.get(client)) {
        client.terminate();
        continue;
      }
      alive.set(client, false);
      client.ping();
    }
  }, 30_000);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));
  setBroadcaster((msg) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(data);
    }
  });
  return wss;
}

/** Parse a single cookie value out of a raw `Cookie:` header (no cookie-parser on upgrade). */
function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

function bearerToken(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
