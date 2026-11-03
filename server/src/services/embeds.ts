/**
 * External media embeds (YouTube / Instagram / Facebook).
 *
 * A URL alone on its own line is rendered as an inline player while the stored
 * Markdown stays untouched. Only whitelisted providers produce an embed and the
 * iframe `src` is always rebuilt from validated IDs — never copied from the note.
 * To add a provider, append a matcher to PROVIDERS (no core renderer changes).
 *
 * NOTE: keep in sync with web/src/lib/embeds.ts (this copy has no DOM helper).
 */

export interface ExternalEmbed {
  provider: string;
  /** Trusted iframe URL built by the provider matcher. */
  src: string;
  title: string;
  /** CSS aspect-ratio hint: 'video' (16:9), 'portrait' (Shorts/Reels), 'post' (tall card). */
  layout: 'video' | 'portrait' | 'post';
}

type Matcher = (u: URL) => ExternalEmbed | null;

const YT_ID = /^[\w-]{11}$/;
const IG_ID = /^[\w-]{5,}$/;

const youtube: Matcher = (u) => {
  const host = u.hostname.replace(/^(www|m)\./, '');
  const seg = u.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  let layout: ExternalEmbed['layout'] = 'video';
  if (host === 'youtu.be') {
    id = seg[0] ?? null;
  } else if (host === 'youtube-nocookie.com' && seg[0] === 'embed' && seg.length === 2) {
    id = seg[1];
  } else if (host === 'youtube.com') {
    if (seg[0] === 'watch') id = u.searchParams.get('v');
    else if (seg[0] === 'shorts') {
      id = seg[1] ?? null;
      layout = 'portrait';
    } else if (seg[0] === 'embed' || seg[0] === 'live' || seg[0] === 'v') id = seg[1] ?? null;
  }
  if (!id || !YT_ID.test(id)) return null;
  const domain = host === 'youtube-nocookie.com' ? 'www.youtube-nocookie.com' : 'www.youtube.com';
  return { provider: 'youtube', src: `https://${domain}/embed/${id}`, title: 'YouTube video', layout };
};

const instagram: Matcher = (u) => {
  if (u.hostname.replace(/^www\./, '') !== 'instagram.com') return null;
  const seg = u.pathname.split('/').filter(Boolean);
  // /p/ID, /reel/ID, /tv/ID, optionally prefixed by /username/
  const i = seg.findIndex((s) => s === 'p' || s === 'reel' || s === 'reels' || s === 'tv');
  if (i < 0 || i > 1 || !seg[i + 1] || !IG_ID.test(seg[i + 1])) return null;
  const kind = seg[i] === 'p' ? 'p' : 'reel';
  return {
    provider: 'instagram',
    src: `https://www.instagram.com/${kind}/${seg[i + 1]}/embed/`,
    title: 'Instagram post',
    layout: 'post',
  };
};

const facebook: Matcher = (u) => {
  const host = u.hostname.replace(/^(www|m|web)\./, '');
  let href: string | null = null;
  let video = false;
  if (host === 'fb.watch') {
    if (/^\/[\w-]+\/?$/.test(u.pathname)) {
      href = `https://fb.watch${u.pathname}`;
      video = true;
    }
  } else if (host === 'facebook.com') {
    const p = u.pathname;
    if (/^\/(?:[^/]+\/)*videos\/(?:[^/]+\/)?\d+\/?$/.test(p) || /^\/reel\/\d+\/?$/.test(p) || /^\/share\/[vr]\/[\w-]+\/?$/.test(p)) {
      href = `https://www.facebook.com${p}`;
      video = true;
    } else if (/^\/watch\/?$/.test(p) && /^\d+$/.test(u.searchParams.get('v') ?? '')) {
      href = `https://www.facebook.com/watch/?v=${u.searchParams.get('v')}`;
      video = true;
    } else if (/^\/[^/]+\/(?:posts|photos)\/[\w.%-]+\/?$/.test(p) || /^\/share\/p\/[\w-]+\/?$/.test(p)) {
      href = `https://www.facebook.com${p}`;
    } else if (/^\/permalink\.php$/.test(p) && /^\d+$/.test(u.searchParams.get('story_fbid') ?? '') && /^\d+$/.test(u.searchParams.get('id') ?? '')) {
      href = `https://www.facebook.com/permalink.php?story_fbid=${u.searchParams.get('story_fbid')}&id=${u.searchParams.get('id')}`;
    }
  }
  if (!href) return null;
  return {
    provider: 'facebook',
    src: `https://www.facebook.com/plugins/${video ? 'video' : 'post'}.php?href=${encodeURIComponent(href)}&show_text=false`,
    title: video ? 'Facebook video' : 'Facebook post',
    layout: video ? 'video' : 'post',
  };
};

const PROVIDERS: Matcher[] = [youtube, instagram, facebook];

/** Resolve a URL string to embed metadata, or null if unsupported/invalid. */
export function resolveExternalEmbed(url: string): ExternalEmbed | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  for (const match of PROVIDERS) {
    const r = match(u);
    if (r) return r;
  }
  return null;
}

export const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-presentation';

interface HNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HNode[];
}

const textOf = (n: HNode): string =>
  n.type === 'text' ? n.value ?? '' : (n.children ?? []).map(textOf).join('');

function embedHast(e: ExternalEmbed): HNode {
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['external-embed', `external-embed-${e.provider}`, `external-embed-${e.layout}`] },
    children: [
      {
        type: 'element',
        tagName: 'iframe',
        properties: {
          src: e.src,
          title: e.title,
          loading: 'lazy',
          allowFullScreen: true,
          referrerPolicy: 'strict-origin-when-cross-origin',
          sandbox: EMBED_SANDBOX,
          allow: 'encrypted-media; picture-in-picture; fullscreen',
        },
        children: [],
      },
    ],
  };
}

/**
 * rehype plugin — MUST run after rehype-sanitize (iframes are stripped by it).
 * Replaces paragraphs made only of bare-URL autolinks (one per line) with embeds;
 * a paragraph is converted only when every link in it resolves.
 */
export function rehypeExternalEmbeds() {
  return (tree: HNode) => {
    const visit = (node: HNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type === 'element' && child.tagName === 'p') {
          const embeds: ExternalEmbed[] = [];
          let ok = true;
          for (const c of child.children ?? []) {
            if (c.type === 'element' && c.tagName === 'br') continue;
            if (c.type === 'text' && !(c.value ?? '').trim()) continue;
            const href = c.type === 'element' && c.tagName === 'a' ? c.properties?.href : null;
            const r =
              typeof href === 'string' && textOf(c).trim() === href ? resolveExternalEmbed(href) : null;
            if (!r) {
              ok = false;
              break;
            }
            embeds.push(r);
          }
          if (ok && embeds.length) return embeds.map(embedHast);
        }
        visit(child);
        return [child];
      });
    };
    visit(tree);
  };
}
