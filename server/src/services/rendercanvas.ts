// Static HTML render of a JSON Canvas (.canvas) for the public share page
// (FR-10 share + FR-12 canvas). Ports the pure geometry from
// web/src/lib/canvas.ts (kept in sync by hand) and lays the nodes out absolutely,
// drawing edges as SVG Béziers — non-interactive, but crawler-friendly and a
// faithful snapshot. Text/embedded-note bodies reuse the markdown renderer.
import { renderNoteHtml, escapeHtml } from './renderhtml.js';
import * as vault from './vault.js';

type Side = 'top' | 'right' | 'bottom' | 'left';
interface Rect { x: number; y: number; width: number; height: number; }
interface CNode extends Rect {
  id: string;
  type: 'text' | 'file' | 'link' | 'group';
  color?: string;
  text?: string;
  textAlign?: 'left' | 'center' | 'right';
  file?: string;
  url?: string;
  label?: string;
}
interface CEdge {
  id: string;
  fromNode: string; fromSide?: Side; fromEnd?: 'none' | 'arrow';
  toNode: string; toSide?: Side; toEnd?: 'none' | 'arrow';
  color?: string;
}

const PRESET: Record<string, string> = {
  '1': '#fb464c', '2': '#e9973f', '3': '#e0de71', '4': '#44cf6e', '5': '#53dfdd', '6': '#a882ff',
};
const IMG_RE = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i;
const MD_RE = /\.(md|markdown)$/i;

function resolveColor(c?: string): string | null {
  if (!c) return null;
  return PRESET[c] ?? c;
}

/** Coerce a JSON-supplied geometry field to a finite number. Untrusted `.canvas`
 *  files (imported/downloaded then shared) may carry strings here — leaving them
 *  unescaped in `style="left:${x}px"` is an attribute-injection vector. */
function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Only allow safe URL schemes for hrefs taken from untrusted .canvas link nodes.
 *  CSP blocks javascript: execution, but drop the scheme rather than render it. */
function safeHref(url: string): string {
  return /^(?:https?:|mailto:)/i.test(url.trim()) ? url.trim() : '';
}

function sideAnchor(n: Rect, side: Side): { x: number; y: number } {
  switch (side) {
    case 'top': return { x: n.x + n.width / 2, y: n.y };
    case 'bottom': return { x: n.x + n.width / 2, y: n.y + n.height };
    case 'left': return { x: n.x, y: n.y + n.height / 2 };
    case 'right': return { x: n.x + n.width, y: n.y + n.height / 2 };
  }
}

function autoSides(a: Rect, b: Rect): { from: Side; to: Side } {
  const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
  const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
  return dy >= 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
}

function sideNormal(side: Side): { x: number; y: number } {
  switch (side) {
    case 'top': return { x: 0, y: -1 };
    case 'bottom': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
  }
}

function edgeD(from: { x: number; y: number }, fromSide: Side, to: { x: number; y: number }, toSide: Side): string {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const handle = Math.max(30, Math.min(dist * 0.5, 200));
  const fn = sideNormal(fromSide), tn = sideNormal(toSide);
  const c1 = { x: from.x + fn.x * handle, y: from.y + fn.y * handle };
  const c2 = { x: to.x + tn.x * handle, y: to.y + tn.y * handle };
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

function bbox(nodes: CNode[]): Rect | null {
  if (!nodes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

async function renderNode(n: CNode, fileUrl: (p: string) => string): Promise<string> {
  const col = resolveColor(n.color);
  const style = `left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;` +
    (col ? `--c:${escapeHtml(col)};border-color:${escapeHtml(col)};` : '');
  if (n.type === 'group') {
    const label = n.label ? `<div class="canvas-group-label">${escapeHtml(n.label)}</div>` : '';
    return `<div class="canvas-node canvas-group" style="${style}">${label}</div>`;
  }
  if (n.type === 'text') {
    const align = n.textAlign === 'center' || n.textAlign === 'right' ? n.textAlign : 'left';
    const body = (n.text ?? '').trim() ? await renderNoteHtml(n.text ?? '', fileUrl) : '';
    return `<div class="canvas-node canvas-text" style="${style}"><div class="canvas-text-body markdown-preview" style="text-align:${align}">${body}</div></div>`;
  }
  if (n.type === 'link') {
    const url = n.url ?? '';
    return `<div class="canvas-node canvas-link" style="${style}"><a class="canvas-link-body" href="${escapeHtml(safeHref(url))}" target="_blank" rel="noopener nofollow"><span class="url">${escapeHtml(url)}</span></a></div>`;
  }
  // file node
  const file = n.file ?? '';
  if (IMG_RE.test(file)) {
    return `<div class="canvas-node canvas-file" style="${style}"><div class="canvas-file-img"><img src="${escapeHtml(fileUrl(file))}" alt="${escapeHtml(file)}" /></div></div>`;
  }
  const name = (file.split('/').pop() ?? file).replace(MD_RE, '');
  let body = '';
  if (MD_RE.test(file)) {
    const md = await vault.readFileText(file).catch(() => null);
    body = md ? await renderNoteHtml(md, fileUrl) : '';
  }
  return `<div class="canvas-node canvas-file" style="${style}"><div class="canvas-file-note"><div class="canvas-file-head"><span class="title">${escapeHtml(name)}</span></div><div class="canvas-file-body markdown-preview">${body}</div></div></div>`;
}

/**
 * Render a `.canvas` document to a self-contained static HTML block. `fileUrl`
 * resolves a vault path (image / embed) to a public URL.
 */
export async function renderCanvasHtml(raw: string, fileUrl: (p: string) => string): Promise<string> {
  let data: { nodes?: CNode[]; edges?: CEdge[] };
  try { data = JSON.parse(raw); } catch { data = {}; }
  // Normalise geometry up front: every downstream use (style attrs, bbox, the
  // `shifted` arithmetic) then operates on numbers, not attacker-supplied strings.
  const nodes: CNode[] = (Array.isArray(data.nodes) ? data.nodes : []).map((n) => ({
    ...n,
    x: num(n.x),
    y: num(n.y),
    width: num(n.width),
    height: num(n.height),
  }));
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const bb = bbox(nodes);
  if (!bb) return '<div class="canvas-static-empty">This canvas is empty.</div>';

  const pad = 48;
  const ox = pad - bb.x, oy = pad - bb.y;
  const W = Math.round(bb.width + pad * 2), H = Math.round(bb.height + pad * 2);

  // Shift every node into local (padded) coordinates.
  const shifted = nodes.map((n) => ({ ...n, x: n.x + ox, y: n.y + oy }));
  const byId = new Map(shifted.map((n) => [n.id, n]));

  // Groups behind everything, then other nodes (matches the editor's z-order).
  const ordered = [...shifted.filter((n) => n.type === 'group'), ...shifted.filter((n) => n.type !== 'group')];
  const nodeHtml = (await Promise.all(ordered.map((n) => renderNode(n, fileUrl)))).join('\n');

  const edgeSvg = edges.map((e) => {
    const a = byId.get(e.fromNode), b = byId.get(e.toNode);
    if (!a || !b) return '';
    const sides = e.fromSide && e.toSide ? { from: e.fromSide, to: e.toSide } : autoSides(a, b);
    const from = sideAnchor(a, e.fromSide ?? sides.from);
    const to = sideAnchor(b, e.toSide ?? sides.to);
    const d = edgeD(from, e.fromSide ?? sides.from, to, e.toSide ?? sides.to);
    const col = resolveColor(e.color) ?? 'var(--canvas-edge, #888)';
    const markerEnd = (e.toEnd ?? 'arrow') === 'arrow' ? ' marker-end="url(#cv-arrow)"' : '';
    const markerStart = e.fromEnd === 'arrow' ? ' marker-start="url(#cv-arrow)"' : '';
    return `<path d="${d}" fill="none" stroke="${escapeHtml(col)}" stroke-width="2"${markerEnd}${markerStart} style="color:${escapeHtml(col)}" />`;
  }).join('\n');

  return `<div class="canvas-public-viewport" id="cv-viewport">
<div class="canvas-static" id="cv-world" data-w="${W}" data-h="${H}" style="width:${W}px;height:${H}px">
<svg class="canvas-edges" style="overflow:visible;position:absolute;left:0;top:0;width:1px;height:1px">
<defs><marker id="cv-arrow" markerWidth="14" markerHeight="14" refX="11" refY="5.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L11,5.5 L0,11 Z" fill="context-stroke" /></marker></defs>
${edgeSvg}
</svg>
${nodeHtml}
</div>
<div class="canvas-public-controls">
<button id="cv-zout" type="button" title="Zoom out" aria-label="Zoom out">&minus;</button>
<button id="cv-fit" type="button" title="Fit to screen" aria-label="Fit to screen">&#9974;</button>
<button id="cv-zin" type="button" title="Zoom in" aria-label="Zoom in">+</button>
</div>
</div>`;
}

/** Inline pan/zoom controller for the public canvas (CSP nonce required). Drives
 *  the #cv-world transform: drag = pan, wheel/pinch = zoom-to-cursor, fit on load. */
export function canvasViewerScript(nonce: string): string {
  return `<script nonce="${nonce}">
(function(){
  var vp=document.getElementById('cv-viewport'),world=document.getElementById('cv-world');
  if(!vp||!world)return;
  var W=parseFloat(world.dataset.w)||world.offsetWidth,H=parseFloat(world.dataset.h)||world.offsetHeight;
  var scale=1,tx=0,ty=0;
  function clampS(s){return Math.min(4,Math.max(0.05,s));}
  function apply(){world.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')';}
  function fit(){var r=vp.getBoundingClientRect(),pad=56;scale=clampS(Math.min((r.width-pad)/W,(r.height-pad)/H,1.5));tx=(r.width-W*scale)/2;ty=(r.height-H*scale)/2;apply();}
  function zoomAt(px,py,f){var ns=clampS(scale*f),k=ns/scale;tx=px-(px-tx)*k;ty=py-(py-ty)*k;scale=ns;apply();}
  vp.addEventListener('wheel',function(e){e.preventDefault();var r=vp.getBoundingClientRect();zoomAt(e.clientX-r.left,e.clientY-r.top,Math.exp(-e.deltaY*0.0015));},{passive:false});
  var pts={},dragId=null,lx=0,ly=0,pinch=null;
  vp.addEventListener('pointerdown',function(e){if(e.target.closest('.canvas-public-controls'))return;vp.setPointerCapture(e.pointerId);pts[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(pts);if(ids.length===1){dragId=e.pointerId;lx=e.clientX;ly=e.clientY;}else if(ids.length===2){dragId=null;var a=pts[ids[0]],b=pts[ids[1]];pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1};}});
  vp.addEventListener('pointermove',function(e){if(!pts[e.pointerId])return;pts[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(pts);if(pinch&&ids.length>=2){var a=pts[ids[0]],b=pts[ids[1]],nd=Math.hypot(a.x-b.x,a.y-b.y)||1,r=vp.getBoundingClientRect();zoomAt((a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top,nd/pinch.d);pinch.d=nd;}else if(dragId===e.pointerId){tx+=e.clientX-lx;ty+=e.clientY-ly;lx=e.clientX;ly=e.clientY;apply();}});
  function up(e){delete pts[e.pointerId];try{vp.releasePointerCapture(e.pointerId);}catch(_){}if(Object.keys(pts).length<2)pinch=null;if(e.pointerId===dragId)dragId=null;}
  vp.addEventListener('pointerup',up);vp.addEventListener('pointercancel',up);
  function c(id,f){var el=document.getElementById(id);if(el)el.addEventListener('click',function(){var r=vp.getBoundingClientRect();f(r);});}
  c('cv-zin',function(r){zoomAt(r.width/2,r.height/2,1.2);});
  c('cv-zout',function(r){zoomAt(r.width/2,r.height/2,1/1.2);});
  c('cv-fit',function(){fit();});
  window.addEventListener('resize',fit);
  fit();
})();
</script>`;
}

/** Plain-text excerpt of a canvas (its text nodes) for the meta description. */
export function canvasDescription(raw: string, max = 160): string {
  let data: { nodes?: CNode[] };
  try { data = JSON.parse(raw); } catch { return ''; }
  const parts = (data.nodes ?? [])
    .filter((n) => n.type === 'text' && (n.text ?? '').trim())
    .map((n) => (n.text ?? '').replace(/[#*_~`>|[\]]/g, ' ').replace(/\s+/g, ' ').trim());
  const body = parts.join(' · ').trim();
  return body.length > max ? `${body.slice(0, max - 1).trimEnd()}…` : body;
}

/** Vault paths a canvas references (image file-nodes + images embedded in its
 *  markdown file-nodes) — the allowlist for the public file endpoint. */
export async function canvasEmbedTargets(raw: string): Promise<string[]> {
  let data: { nodes?: CNode[] };
  try { data = JSON.parse(raw); } catch { return []; }
  const out = new Set<string>();
  for (const n of data.nodes ?? []) {
    if (n.type !== 'file' || !n.file) continue;
    if (IMG_RE.test(n.file)) { out.add(n.file); continue; }
    if (MD_RE.test(n.file)) {
      const md = await vault.readFileText(n.file).catch(() => null);
      if (!md) continue;
      for (const m of md.matchAll(/!\[\[([^\]]+?)\]\]/g)) {
        const t = m[1].split('|')[0].split('#')[0].trim();
        if (t) out.add(t);
      }
      for (const m of md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
        const url = m[1].replace(/\s+"[^"]*"$/, '').trim();
        if (url && !/^(https?|data|blob|file):/i.test(url)) out.add(decodeURIComponent(url.split('/').pop() || url));
      }
    }
  }
  return [...out];
}

/** First image file-node of a canvas, for og:image. */
export function canvasFirstImage(raw: string): string | null {
  let data: { nodes?: CNode[] };
  try { data = JSON.parse(raw); } catch { return null; }
  for (const n of data.nodes ?? []) {
    if (n.type === 'file' && n.file && IMG_RE.test(n.file)) return n.file;
  }
  return null;
}
