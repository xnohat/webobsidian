import { useEffect, useRef, useState } from 'react';
import { highlightCode, classHighlighter } from '@lezer/highlight';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { useStore } from '../lib/store';
import { renderMarkdown } from '../lib/markdown';
import { calloutIconSvg } from '../lib/callouts';
import { openLightbox } from '../lib/imageLightbox';
import { api } from '../lib/api';

/** Syntax-highlight a `<code class="language-x">` block with the SAME CodeMirror
 *  grammars Live Preview uses (token classes styled by the Obsidian palette). */
async function highlightCodeEl(codeEl: HTMLElement): Promise<void> {
  const cls = [...codeEl.classList].find((c) => c.startsWith('language-'));
  if (!cls) return;
  const langName = cls.slice('language-'.length);
  const desc = LanguageDescription.matchLanguageName(languages, langName, true);
  if (!desc) return;
  codeEl.closest('pre')?.setAttribute('data-lang', desc.name);
  const support = await desc.load();
  const code = codeEl.textContent ?? '';
  const tree = support.language.parser.parse(code);
  const out: Node[] = [];
  highlightCode(
    code,
    tree,
    classHighlighter,
    (text, classes) => {
      if (classes) {
        const span = document.createElement('span');
        span.className = classes;
        span.textContent = text;
        out.push(span);
      } else {
        out.push(document.createTextNode(text));
      }
    },
    () => out.push(document.createTextNode('\n')),
  );
  codeEl.textContent = '';
  codeEl.append(...out);
}

let katexP: Promise<typeof import('katex')['default']> | null = null;
const loadKatex = () =>
  (katexP ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([k]) => k.default));
let mermaidP: Promise<typeof import('mermaid')['default']> | null = null;
const loadMermaid = () =>
  (mermaidP ??= import('mermaid').then((m) => {
    m.default.initialize({
      startOnLoad: false,
      theme: document.querySelector('.theme-dark') ? 'dark' : 'default',
    });
    return m.default;
  }));
let mmdSeq = 0;

/** Add a "Render HTML" toggle to a ```html block. Clicking swaps the source
 *  for a sandboxed iframe (scripts run but isolated — no same-origin, so the
 *  saved page can't touch the vault/app). Toggles back to source on re-click. */
function setupHtmlPreview(codeEl: HTMLElement): void {
  const pre = codeEl.parentElement as HTMLElement | null;
  if (!pre || pre.parentElement?.classList.contains('html-block')) return;
  const wrap = document.createElement('div');
  wrap.className = 'html-block';
  pre.replaceWith(wrap);
  wrap.appendChild(pre);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'html-render-btn';
  btn.textContent = 'Render HTML';
  wrap.appendChild(btn);
  let frame: HTMLIFrameElement | null = null;
  btn.addEventListener('click', () => {
    if (frame) {
      frame.remove();
      frame = null;
      pre.style.display = '';
      btn.textContent = 'Render HTML';
      return;
    }
    frame = document.createElement('iframe');
    frame.className = 'html-render-frame';
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-modals');
    frame.srcdoc = codeEl.textContent ?? '';
    pre.style.display = 'none';
    wrap.appendChild(frame);
    btn.textContent = 'Hide HTML';
  });
}

export default function Preview({ source }: { source?: string }) {
  const storeContent = useStore((s) => s.content);
  const content = source ?? storeContent;
  const activePath = useStore((s) => s.activePath);
  const openWikilink = useStore((s) => s.openWikilink);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const setLeftPanel = useStore((s) => s.setLeftPanel);
  const [html, setHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    renderMarkdown(content, {
      rawUrl: (p) => api.rawUrl(p),
      resolveEmbed: async (target) => {
        try {
          const { path } = await api.resolve(target);
          if (!path) return null;
          const r = await api.read(path);
          return { path, content: typeof r === 'string' ? r : r.content };
        } catch {
          return null;
        }
      },
    }).then((h) => {
      if (!cancelled) setHtml(h);
    });
    return () => {
      cancelled = true;
    };
  }, [content]);

  // Post-render pass — same renderers as Live Preview so both modes match:
  // KaTeX for [data-tex] spans, mermaid for ```mermaid fences, callout icons.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    let cancelled = false;
    for (const el of root.querySelectorAll<HTMLElement>('.callout-icon[data-callout-icon]')) {
      el.innerHTML = calloutIconSvg(el.dataset.calloutIcon ?? 'default');
    }
    // Fold chevron on collapsible callouts (rotates via .is-collapsed CSS).
    for (const title of root.querySelectorAll<HTMLElement>(
      '.callout[data-callout-fold="-"] > .callout-title, .callout[data-callout-fold="+"] > .callout-title',
    )) {
      if (title.querySelector('.callout-fold')) continue;
      const ch = document.createElement('span');
      ch.className = 'callout-fold';
      ch.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
      title.appendChild(ch);
    }
    if (root.querySelector('[data-tex]')) {
      void loadKatex().then((katex) => {
        if (cancelled) return;
        for (const el of root.querySelectorAll<HTMLElement>('[data-tex]')) {
          try {
            katex.render(el.dataset.tex ?? '', el, {
              throwOnError: false,
              displayMode: el.dataset.texDisplay === '1',
            });
          } catch {
            /* keep raw tex */
          }
        }
      });
    }
    // Code blocks: same grammars + palette as Live Preview.
    for (const codeEl of root.querySelectorAll<HTMLElement>('pre > code[class*="language-"]:not(.language-mermaid)')) {
      void highlightCodeEl(codeEl).catch(() => {});
    }
    // ```html blocks get a "Render HTML" toggle (sandboxed iframe preview).
    for (const codeEl of root.querySelectorAll<HTMLElement>('pre > code.language-html')) {
      setupHtmlPreview(codeEl);
    }
    const mmd = root.querySelectorAll<HTMLElement>('pre > code.language-mermaid');
    if (mmd.length) {
      void loadMermaid().then(async (mermaid) => {
        for (const codeEl of mmd) {
          if (cancelled) return;
          const pre = codeEl.parentElement!;
          try {
            const { svg } = await mermaid.render(`read-mmd-${++mmdSeq}`, codeEl.textContent ?? '');
            const div = document.createElement('div');
            div.className = 'mermaid';
            div.innerHTML = svg;
            pre.replaceWith(div);
          } catch {
            document.getElementById(`dread-mmd-${mmdSeq}`)?.remove();
          }
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [html]);

  const onClick = (e: React.MouseEvent) => {
    // Click an embedded image → full-screen zoom/pan viewer.
    const imgEl = e.target as HTMLElement;
    if (imgEl instanceof HTMLImageElement) {
      e.preventDefault();
      openLightbox(imgEl.currentSrc || imgEl.src, imgEl.alt);
      return;
    }
    const target = (e.target as HTMLElement).closest('[data-wikilink]') as HTMLElement | null;
    if (target) {
      e.preventDefault();
      const link = target.getAttribute('data-wikilink');
      if (link) openWikilink(link);
      return;
    }
    // Foldable callout: clicking the title toggles its content.
    const title = (e.target as HTMLElement).closest('.callout[data-callout-fold="-"] > .callout-title, .callout[data-callout-fold="+"] > .callout-title');
    if (title) title.parentElement?.classList.toggle('is-collapsed');
  };

  const onContextMenu = (e: React.MouseEvent) => {
    const sel = window.getSelection()?.toString() ?? '';
    e.preventDefault();
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Copy', icon: 'file-text', onClick: () => sel && navigator.clipboard.writeText(sel).catch(() => {}) },
        ...(sel
          ? [{ label: `Search for “${sel.slice(0, 24)}”`, icon: 'search', onClick: () => setLeftPanel('search') }]
          : []),
        { label: '', separator: true },
        { label: 'Select all', onClick: () => {
            const r = document.createRange();
            const el = (e.currentTarget as HTMLElement);
            r.selectNodeContents(el);
            const s = window.getSelection();
            s?.removeAllRanges();
            s?.addRange(r);
          } },
      ],
    });
  };

  // Inline title (note filename), Obsidian-style — skipped when the note already
  // opens with an H1 equal to the title (avoids duplicating the Trilium heading).
  const title = !source && activePath ? (activePath.split('/').pop() ?? '').replace(/\.(md|markdown)$/i, '') : '';
  const firstLine = content
    .replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '')
    .split(/\r?\n/)
    .find((l) => l.trim() !== '');
  const h1 = firstLine?.match(/^#\s+(.+?)\s*$/);
  const showTitle = !!title && !(h1 && h1[1].trim().toLowerCase() === title.trim().toLowerCase());

  return (
    <div className="markdown-preview" onClick={onClick} onContextMenu={onContextMenu}>
      <div className="preview-inner">
        {showTitle && <div className="inline-title">{title}</div>}
        <div ref={bodyRef} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
