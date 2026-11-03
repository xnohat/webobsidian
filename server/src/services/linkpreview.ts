// Link preview cards (issue #7): fetch safe Open Graph metadata for a pasted
// URL and render it as a card. Fetching is SSRF-guarded (private/loopback
// addresses are refused at DNS-lookup time, redirects re-validated, size and
// time capped) and only plain-text metadata is extracted — the remote page is
// never executed or embedded. New metadata sources plug in via `providers`.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { escapeHtml } from './renderhtml.js';

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image: string | null;
  domain: string;
}

/** A provider may return a preview for URLs it recognizes, or null to defer. */
export type PreviewProvider = (url: URL) => Promise<LinkPreview | null>;

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 60 * 60 * 1000;
const FAIL_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return l === '::' || l === '::1' || /^f[cd]/.test(l) || /^fe[89ab]/.test(l) || l.startsWith('ff');
  }
  return true;
}

/** DNS lookup that refuses non-public addresses (also defeats DNS rebinding). */
const safeLookup: net.LookupFunction = (hostname, options, cb) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return (cb as any)(err);
    const list = (addrs as unknown as dns.LookupAddress[]) ?? [];
    if (!list.length || list.some((a) => isPrivateIp(a.address))) {
      return (cb as any)(new Error('Blocked address'));
    }
    if ((options as any)?.all) return (cb as any)(null, list);
    (cb as any)(null, list[0].address, list[0].family);
  });
};

function fetchHtml(u: URL, redirects = 0): Promise<{ html: string; finalUrl: URL }> {
  return new Promise((resolve, reject) => {
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return reject(new Error('Unsupported URL'));
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && isPrivateIp(u.hostname.replace(/^\[|\]$/g, ''))) {
      return reject(new Error('Blocked address'));
    }
    const lib = u.protocol === 'https:' ? https : http;
    const rq = lib.request(
      u,
      {
        method: 'GET',
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WebObsidianLinkPreview/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) return reject(new Error('Too many redirects'));
          try {
            return resolve(fetchHtml(new URL(res.headers.location, u), redirects + 1));
          } catch (e) {
            return reject(e);
          }
        }
        const type = String(res.headers['content-type'] ?? '');
        if (status !== 200 || !/html/i.test(type)) {
          res.resume();
          return reject(new Error('Unsupported response'));
        }
        const charset = /charset=([\w-]+)/i.exec(type)?.[1] ?? 'utf-8';
        const chunks: Buffer[] = [];
        let size = 0;
        const finish = () => {
          let html: string;
          try {
            html = new TextDecoder(charset).decode(Buffer.concat(chunks));
          } catch {
            html = Buffer.concat(chunks).toString('utf8');
          }
          resolve({ html, finalUrl: u });
        };
        res.on('data', (c: Buffer) => {
          size += c.length;
          chunks.push(c);
          if (size >= MAX_BYTES) {
            res.destroy();
            finish();
          }
        });
        res.on('end', finish);
        res.on('error', () => (size ? finish() : reject(new Error('Read error'))));
      },
    );
    rq.on('timeout', () => rq.destroy(new Error('Timeout')));
    rq.on('error', reject);
    rq.end();
  });
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, d, h, n) => {
    try {
      if (d) return String.fromCodePoint(Number(d));
      if (h) return String.fromCodePoint(parseInt(h, 16));
    } catch {
      return m;
    }
    return ENTITIES[String(n).toLowerCase()] ?? m;
  });
}

const clean = (s: string | undefined, max: number): string => {
  const t = decodeEntities(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** Pure parser: pull whitelisted metadata out of an HTML document. */
export function parseMetadata(html: string, pageUrl: URL): LinkPreview | null {
  const head = html.slice(0, MAX_BYTES).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const meta = new Map<string, string>();
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = /(?:property|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const val = /content\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const k = (key?.[1] ?? key?.[2])?.toLowerCase();
    if (k && val && !meta.has(k)) meta.set(k, val[1] ?? val[2] ?? '');
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title = clean(meta.get('og:title') ?? meta.get('twitter:title') ?? titleTag, 200);
  const description = clean(meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'), 300);
  let image: string | null = null;
  const rawImg = meta.get('og:image') ?? meta.get('og:image:url') ?? meta.get('twitter:image');
  if (rawImg) {
    try {
      const iu = new URL(decodeEntities(rawImg).trim(), pageUrl);
      if (iu.protocol === 'https:' || iu.protocol === 'http:') image = iu.toString();
    } catch {
      /* ignore bad image URL */
    }
  }
  if (!title && !description && !image) return null;
  const domain = pageUrl.hostname.replace(/^www\./, '');
  return { url: pageUrl.toString(), title: title || domain, description, image, domain };
}

/** Default provider: generic Open Graph / <title> scraping. */
const openGraphProvider: PreviewProvider = async (url) => {
  const { html, finalUrl } = await fetchHtml(url);
  const p = parseMetadata(html, finalUrl);
  return p ? { ...p, url: url.toString(), domain: url.hostname.replace(/^www\./, '') } : null;
};

/** Ordered provider chain — add provider-specific previews (YouTube, GitHub…) before the fallback. */
export const providers: PreviewProvider[] = [openGraphProvider];

const cache = new Map<string, { at: number; value: LinkPreview | null }>();

export async function getLinkPreview(raw: string): Promise<LinkPreview | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  url.hash = '';
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.value ? CACHE_TTL_MS : FAIL_TTL_MS)) return hit.value;
  let value: LinkPreview | null = null;
  for (const p of providers) {
    try {
      value = await p(url);
    } catch {
      value = null;
    }
    if (value) break;
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Card markup — mirrors web/src/lib/linkPreview.ts so SSR share pages match the app. */
export function previewCardHtml(p: LinkPreview): string {
  const img = p.image
    ? `<span class="link-preview-thumb"><img src="${escapeHtml(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></span>`
    : '';
  const desc = p.description ? `<span class="link-preview-desc">${escapeHtml(p.description)}</span>` : '';
  return `<a class="link-preview-card" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">${img}<span class="link-preview-body"><span class="link-preview-title">${escapeHtml(p.title)}</span>${desc}<span class="link-preview-domain">${escapeHtml(p.domain)}</span></span></a>`;
}

const STANDALONE_RE = /<p><a href="(https?:\/\/[^"]+)"[^>]*>([^<]*)<\/a><\/p>/g;

/** SSR: swap standalone-URL paragraphs for preview cards; failures keep the plain link. */
export async function embedLinkPreviews(html: string): Promise<string> {
  const matches = [...html.matchAll(STANDALONE_RE)].filter((m) => decodeEntities(m[1]) === decodeEntities(m[2])).slice(0, 20);
  if (!matches.length) return html;
  const cards = await Promise.all(matches.map((m) => getLinkPreview(decodeEntities(m[1])).catch(() => null)));
  let out = html;
  matches.forEach((m, i) => {
    const p = cards[i];
    if (p) out = out.replace(m[0], `<div class="link-preview">${previewCardHtml(p)}</div>`);
  });
  return out;
}
