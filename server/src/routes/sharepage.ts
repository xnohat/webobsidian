// SSR page for public share links (FR-10): GET /share/:id returns a complete
// HTML document — note content, <title>, meta description, Open Graph + Twitter
// tags — so crawlers (Google, FB, Zalo…) index/preview it without running JS.
import { Router } from 'express';
import type { Request } from 'express';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { asyncHandler } from '../middleware/error.js';
import * as vault from '../services/vault.js';
import { getActiveShare } from '../services/shares.js';
import { isUnlocked,resolveSharedFile,resolveSharedAttachments } from './shares.js';
import { metaDescription, firstImage, escapeHtml } from '../services/renderhtml.js';
import {renderPublicNoteHtml} from '../services/publicNoteRendering.js';
import {renderPublicCanvasHtml} from '../services/publicCanvasRendering.js';
import { embedLinkPreviews } from '../services/linkpreview.js';
import { publicMarkdownScript } from '../services/publicMarkdown.js';
import { canvasDescription, canvasFirstImage, canvasViewerScript } from '../services/rendercanvas.js';
import {getVaultPreferences} from '../services/vaultPreferences.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Inline the built SPA stylesheet so the SSR page matches the Reading view. */
let cssCache: { file: string; css: string } | null = null;
async function appCss(): Promise<string> {
  const assets = path.join(__dirname, '..', '..', 'public', 'assets');
  try {
    const files = (await fs.readdir(assets)).filter((f) => /^index-.*\.css$/.test(f)).sort();
    const file = files.at(-1);
    if (!file) return '';
    if (cssCache?.file !== file) {
      cssCache = { file, css: await fs.readFile(path.join(assets, file), 'utf8') };
    }
    return cssCache.css;
  } catch {
    return '';
  }
}

/** A separate Vite entry; the public reader never boots the authenticated SPA. */
async function embedsScript(nonce:string):Promise<string>{
  try{
    const files=await fs.readdir(path.join(__dirname,'..','..','public','assets'));
    const file=files.filter(f=>/^public-embeds-[\w-]+\.js$/.test(f)).sort().at(-1);
    return file?`<script type="module" nonce="${escapeHtml(nonce)}" src="/assets/${file}"></script>`:'';
  }catch{return ''}
}

function baseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

function page(opts: {
  title: string;
  head?: string;
  body: string;
  css: string;
  noindex?: boolean;
  /** Skip the narrow markdown-preview column (used by the full-width canvas view). */
  bare?: boolean;
  shareId?:string;
  baseFontSize?:number;
}): string {
  const inner = opts.bare
    ? opts.body
    : `<div class="markdown-preview">
<div class="preview-inner">
${opts.body}
</div>
</div>`;
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="${opts.noindex ? 'noindex, nofollow' : 'index, follow'}" />
<title>${escapeHtml(opts.title)}</title>
${opts.head ?? ''}<style>${opts.css}</style>
</head>
<body>
<div class="theme-light public-page${opts.bare ? ' public-canvas' : ''}" style="--font-text-size:${opts.baseFontSize??16}px"${opts.shareId?` data-public-share="${escapeHtml(opts.shareId)}"`:''}>
${inner}
</div>
</body>
</html>`;
}

export const sharePageRouter = Router();

sharePageRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const share = await getActiveShare(req.params.id);
    const css = await appCss();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (!share || !(await vault.exists(share.path))) {
      res.status(404).send(
        page({
          title: 'Note not found',
          noindex: true,
          css,
          body: '<div class="public-error">This note is not available.</div>',
        }),
      );
      return;
    }

    const pageUrl = `${baseUrl(req)}/share/${share.id}`;

    // Password-protected & not unlocked: render the unlock form only — never
    // leak content or descriptive metadata to crawlers.
    if (!(await isUnlocked(req, share))) {
      res.send(
        page({
          title: 'Protected note',
          noindex: true,
          css,
          body: `
<form class="public-unlock" id="unlock-form">
  <div class="public-unlock-title">This note is password-protected</div>
  <input class="text-input" type="password" id="unlock-pw" placeholder="Password" autofocus />
  <button class="btn" type="submit">Open note</button>
  <div class="public-unlock-error" id="unlock-err"></div>
</form>
<script nonce="${res.locals.cspNonce}">
document.getElementById('unlock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await fetch('/public/shares/${share.id}/unlock', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: document.getElementById('unlock-pw').value }),
  }).catch(() => null);
  if (r && r.ok) location.reload();
  else document.getElementById('unlock-err').textContent = 'Wrong password — try again.';
});
</script>`,
        }),
      );
      return;
    }

    const content = await vault.readFileText(share.path);
    const isCanvas = /\.canvas$/i.test(share.path);
    const title = (share.path.split('/').pop() ?? share.path).replace(/\.(md|markdown|canvas)$/i, '');
    const desc = isCanvas ? canvasDescription(content) : metaDescription(content);
    const imgVault = isCanvas ? canvasFirstImage(content) : null;
    const img = isCanvas ? null : firstImage(content);
    const ogImage = img?.url ?? (img?.vault ?? imgVault
      ? `${baseUrl(req)}/public/shares/${share.id}/file?path=${encodeURIComponent((img?.vault ?? imgVault) as string)}`
      : null);

    const html = isCanvas
      ? await renderPublicCanvasHtml(content,share.path,share,child=>isUnlocked(req,child),resolveSharedAttachments)
      : await embedLinkPreviews(await renderPublicNoteHtml(content,share,child=>isUnlocked(req,child)));

    const head = [
      `<meta name="description" content="${escapeHtml(desc)}" />`,
      `<link rel="canonical" href="${escapeHtml(pageUrl)}" />`,
      `<meta property="og:type" content="article" />`,
      `<meta property="og:site_name" content="WebObsidian" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(desc)}" />`,
      `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
      ...(ogImage ? [
        `<meta property="og:image" content="${escapeHtml(ogImage)}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`,
      ] : [
        `<meta name="twitter:card" content="summary" />`,
      ]),
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(desc)}" />`,
    ].join('\n') + '\n';

    res.send(
      page({
        title,
        head,
        css,
        bare: isCanvas,
        shareId:share.id,
        baseFontSize:(await getVaultPreferences()).values.baseFontSize,
        body: isCanvas
          ? `<div class="public-canvas-title">${escapeHtml(title)}</div>\n${html}\n${canvasViewerScript(res.locals.cspNonce)}\n${publicMarkdownScript(res.locals.cspNonce)}\n${await embedsScript(res.locals.cspNonce)}`
          : `<div class="inline-title">${escapeHtml(title)}</div>\n${html}\n${publicMarkdownScript(res.locals.cspNonce)}\n${await embedsScript(res.locals.cspNonce)}`,
      }),
    );
  }),
);

sharePageRouter.get('/:id/canvas',asyncHandler(async(req,res)=>{
  const share=await getActiveShare(req.params.id),css=await appCss();
  const error=(status:number,text:string)=>res.status(status).type('html').send(page({title:'Canvas',css,noindex:true,body:`<div class="public-error">${text}</div>`}));
  if(!share||!await vault.exists(share.path)){error(404,'This canvas is not available.');return}
  if(!await isUnlocked(req,share)){error(401,`Password required. <a href="/share/${encodeURIComponent(share.id)}">Open protected note</a>`);return}
  const target=await resolveSharedFile(share,String(req.query.path??''));
  if(!target||!/\.canvas$/i.test(target)){error(404,'This canvas is not available.');return}
  const title=target.split('/').pop()!.replace(/\.canvas$/i,'');
  const html=await renderPublicCanvasHtml(await vault.readFileText(target),target,share,child=>isUnlocked(req,child),resolveSharedAttachments);
  res.type('html').send(page({title,css,bare:true,shareId:share.id,baseFontSize:(await getVaultPreferences()).values.baseFontSize,noindex:true,body:`<div class="public-canvas-title">${escapeHtml(title)}</div>\n${html}\n${canvasViewerScript(res.locals.cspNonce)}\n${publicMarkdownScript(res.locals.cspNonce)}\n${await embedsScript(res.locals.cspNonce)}`}));
}));
