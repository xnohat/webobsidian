import path from 'node:path';

/** Runtime configuration derived from environment variables. */
export interface RuntimeConfig {
  port: number;
  host: string;
  dataDir: string;
  /** Default vault path used on first run if settings has none. */
  defaultVaultPath: string;
  /** Roots the folder browser is allowed to traverse. */
  allowedRoots: string[];
  initialPassword?: string;
  isProd: boolean;
  /**
   * Express `trust proxy` setting. Controls whether `X-Forwarded-*` headers are
   * honoured (and thus whether `req.ip`/`req.secure` derive from them). Defaults
   * to `false` so a directly-exposed instance never trusts client-supplied
   * `X-Forwarded-For` (which would let attackers spoof their IP to bypass the
   * login rate limit — see security report F-03).
   */
  trustProxy: boolean | number | string;
}

function resolveRoots(): string[] {
  const raw = process.env.ALLOWED_ROOTS?.trim();
  if (raw) {
    return raw.split(',').map((p) => path.resolve(p.trim())).filter(Boolean);
  }
  return [];
}

/**
 * Parse the `TRUST_PROXY` env into an Express `trust proxy` value. Safe default
 * is `false` (no proxy → don't honour X-Forwarded-For). Accepts:
 *   - unset / 'false' / 'off' / '0' / '' → false
 *   - 'true' / 'on'                      → true (trust the immediate peer)
 *   - a non-negative integer             → number of trusted proxy hops
 *   - anything else                      → passed through as a subnet/preset
 *                                          list (e.g. 'loopback, 10.0.0.0/8').
 */
function resolveTrustProxy(): boolean | number | string {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower === 'false' || lower === 'off' || lower === '0') return false;
  if (lower === 'true' || lower === 'on') return true;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0) return n;
  return raw;
}

export const config: RuntimeConfig = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  defaultVaultPath: path.resolve(process.env.VAULT_PATH ?? './sample-vault'),
  allowedRoots: resolveRoots(),
  initialPassword: process.env.WEBOBSIDIAN_PASSWORD || undefined,
  isProd: process.env.NODE_ENV === 'production',
  trustProxy: resolveTrustProxy(),
};

export const SETTINGS_FILE = path.join(config.dataDir, 'settings.json');
export const INDEX_FILE = path.join(config.dataDir, 'qmd-index.json');
