import {setLocalizedText} from "../lib/i18n/runtime";
import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import {mountDiagramBlocks} from '../lib/diagram';
import {pdfFileActions} from '../lib/pdfFileActions';
import {processPluginMarkdown,usePluginRevision} from '../lib/plugins/registry';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { highlightCode, classHighlighter } from '@lezer/highlight';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { useStore } from '../lib/store';
import { renderMarkdown } from '../lib/markdown';
import { calloutIconSvg } from '../lib/callouts';
import { openLightbox } from '../lib/imageLightbox';
import { api } from '../lib/api';
import { displayTitle } from '../lib/title';
import {mountPdfEmbeds} from '../lib/pdfEmbeds';
import {mountCanvasEmbeds} from '../lib/canvasEmbed';
import {mountImageActions} from '../lib/embedActions';
import {addNoteEmbedOpenButtons} from '../lib/noteEmbed';
import {useVaultPreferences} from '../lib/vaultPreferences';
import {findRenderedNoteFragment} from '../lib/noteFragments';

/** Syntax-highlight static preview code with catalog grammars and the scoped
 *  token palette. The editor's native stream grammars are configured separately. */
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
  setLocalizedText(btn, "webobsidian.render-html-e2fc37", {}, "textContent");
  wrap.appendChild(btn);
  let frame: HTMLIFrameElement | null = null;
  btn.addEventListener('click', () => {
    if (frame) {
      frame.remove();
      frame = null;
      pre.style.display = '';
      setLocalizedText(btn, "webobsidian.render-html-e2fc37", {}, "textContent");
      return;
    }
    frame = document.createElement('iframe');
    frame.className = 'html-render-frame';
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-modals');
    frame.srcdoc = codeEl.textContent ?? '';
    pre.style.display = 'none';
    wrap.appendChild(frame);
    setLocalizedText(btn, "webobsidian.hide-html-0fab51", {}, "textContent");
  });
}

export default function Preview({ source,sourcePath,fontSize }: { source?: string;sourcePath?:string;fontSize?:number }) {
  const languageRevision = useLanguage().revision;

  const preferences=useVaultPreferences();
  const pluginRevision=usePluginRevision();
  const storeContent = useStore((s) => s.content);
  const content = source ?? storeContent;
  const workspacePath = useStore((s) => s.activePath);
  const activePath=sourcePath??workspacePath;
  const showInlineTitle = useStore((s) => s.showInlineTitle);
  const openWikilink = useStore((s) => s.openWikilink);
  const noteNavigation=useStore(s=>s.noteNavigation);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const setLeftPanel = useStore((s) => s.setLeftPanel);
  const [html, setHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    renderMarkdown(content, {
      rawUrl: (p, from) => api.rawUrl(p, from),
      sourcePath: activePath ?? undefined,
      resolveEmbed: async (target, from,kind) => {
        try {
          const { path } = await api.resolve(target, from,kind);
          if (!path) return null;
          if(!/\.(md|markdown)$/i.test(path))return null;
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
  }, [content, activePath]);

  // Post-render pass — same renderers as Live Preview so both modes match:
  // KaTeX for [data-tex] spans, mermaid for ```mermaid fences, callout icons.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const root=bodyRef.current,request=noteNavigation;
    if(!root||source!==undefined||!request||request.path!==activePath)return;
    const frame=requestAnimationFrame(()=>{
      if(useStore.getState().noteNavigation!==request||!root.isConnected)return;
      if(!request.fragment)root.closest<HTMLElement>('.markdown-preview')?.scrollTo({top:0});
      else findRenderedNoteFragment(root,request.fragment)?.scrollIntoView({block:'start'});
    });
    return ()=>cancelAnimationFrame(frame);
  },[html,activePath,noteNavigation,source]);
  useEffect(()=>{if(bodyRef.current)return processPluginMarkdown(bodyRef.current,activePath??'');},[html,activePath,pluginRevision]);
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    let cancelled = false;
    addNoteEmbedOpenButtons(root,(target,kind)=>{void useStore.getState().openWikilink(target,kind)});
    for (const el of root.querySelectorAll<HTMLElement>('.callout-icon[data-callout-icon]')) {
      el.innerHTML = calloutIconSvg(el.dataset.calloutIcon ?? 'default');
    }
    // Keep document-rendered HTML inert; create interactive PDF controls here.
    const disposePdfs=mountPdfEmbeds(root,activePath??'',(target,origin,kind)=>{void (kind==='markdown'?useStore.getState().openWikilink(target,kind,origin):useStore.getState().openAttachment(target,origin))},(target,origin,kind)=>pdfFileActions(target,origin,{linkKind:kind}));
    const disposeCanvases=mountCanvasEmbeds(root,activePath??'',(target,origin,kind)=>{void useStore.getState().openWikilink(target,kind,origin)});
    mountImageActions(root);
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
    const disposeDiagrams=mountDiagramBlocks(root,activePath??'');
    return () => {
      cancelled = true;
      disposePdfs();
      disposeCanvases();
      disposeDiagrams();
    };
  }, [html,activePath]);

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
      if (link) openWikilink(link, target.dataset.linkKind==='markdown'?'markdown':'wiki',target.closest<HTMLElement>('[data-embed-source]')?.dataset.embedSource);
      return;
    }
    const markdownLink = (e.target as HTMLElement).closest('a[data-link-kind="markdown"]') as HTMLAnchorElement | null;
    if (markdownLink) {
      const href = markdownLink.getAttribute('href');
      if (href) { e.preventDefault(); openWikilink(href, 'markdown',markdownLink.closest<HTMLElement>('[data-embed-source]')?.dataset.embedSource); }
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
        { get label() {return uiText("interface.menu.copy");}, icon: 'file-text', onClick: () => sel && navigator.clipboard.writeText(sel).catch(() => {}) },
        ...(sel
          ? [{ get label() {return uiText("webobsidian.search-for-value0-73c0eb", {value0: sel.slice(0, 24)});}, icon: 'search', onClick: () => setLeftPanel('search') }]
          : []),
        { label: '', separator: true },
        { get label() {return uiText("webobsidian.select-all-913aff");}, onClick: () => {
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
  const title = !source && activePath ? displayTitle(activePath, content) : '';
  const firstLine = content
    .replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '')
    .split(/\r?\n/)
    .find((l) => l.trim() !== '');
  const h1 = firstLine?.match(/^#\s+(.+?)\s*$/);
  const showTitle = showInlineTitle && !!title && !(h1 && h1[1].trim().toLowerCase() === title.trim().toLowerCase());

  return (
    <div className={`markdown-preview${preferences.values.readableLineLength?' is-readable-line-width':''}`} style={{'--font-text-size':`${fontSize??preferences.values.baseFontSize??16}px`} as CSSProperties} onClick={onClick} onContextMenu={onContextMenu}>
      <div className="preview-inner">
        {showTitle && <div className="inline-title">{title}</div>}
        <div key={activePath} ref={bodyRef} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
