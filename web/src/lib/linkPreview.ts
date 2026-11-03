// Rich link preview cards (issue #7) shared by Reading view and Live Preview.
// Markup mirrors server/src/services/linkpreview.ts previewCardHtml (SSR share page).
import { api, type LinkPreview } from './api';

const cache = new Map<string, Promise<LinkPreview | null>>();

export function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  let p = cache.get(url);
  if (!p) {
    p = api.linkPreview(url).catch(() => null);
    cache.set(url, p);
  }
  return p;
}

const span = (cls: string, text: string) => {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
};

export function createPreviewCard(p: LinkPreview): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'link-preview-card';
  a.href = p.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  if (p.image) {
    const thumb = document.createElement('span');
    thumb.className = 'link-preview-thumb';
    const img = document.createElement('img');
    img.src = p.image;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => thumb.remove();
    thumb.appendChild(img);
    a.appendChild(thumb);
  }
  const body = document.createElement('span');
  body.className = 'link-preview-body';
  body.appendChild(span('link-preview-title', p.title));
  if (p.description) body.appendChild(span('link-preview-desc', p.description));
  body.appendChild(span('link-preview-domain', p.domain));
  a.appendChild(body);
  return a;
}

/** Reading view: replace paragraphs holding only a bare URL with preview cards. */
export function enhanceLinkPreviews(root: HTMLElement, isCancelled: () => boolean): void {
  for (const p of root.querySelectorAll<HTMLElement>('p')) {
    if (p.children.length !== 1 || p.childNodes.length !== 1) continue;
    const a = p.firstElementChild as HTMLAnchorElement;
    const href = a.getAttribute('href') ?? '';
    if (a.tagName !== 'A' || !/^https?:\/\//i.test(href) || (a.textContent ?? '').trim() !== href) continue;
    fetchLinkPreview(href).then((meta) => {
      if (!meta || isCancelled() || !p.isConnected) return;
      const wrap = document.createElement('div');
      wrap.className = 'link-preview';
      wrap.appendChild(createPreviewCard(meta));
      p.replaceWith(wrap);
    });
  }
}
