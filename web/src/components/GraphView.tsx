import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type GraphSettings } from '../lib/store';
import { api } from '../lib/api';
import Icon from './Icon';
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceX,
  forceY,
  forceCollide,
  type Simulation,
} from 'd3-force';
import type { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';

type NodeKind = 'note' | 'attachment' | 'unresolved' | 'tag';

interface GNode {
  id: string;
  label: string;
  kind: NodeKind;
  tags: string[];
  deg: number;
  fade?: number; // Obsidian's fadeAlpha: dims to 0.2 when another node is hovered
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}
interface GLink {
  source: GNode | string;
  target: GNode | string;
}
interface RawGraph {
  nodes: { id: string; label: string; kind: 'note' | 'attachment' | 'unresolved'; tags: string[] }[];
  edges: { source: string; target: string }[];
}

interface ColorSet {
  accent: number;
  accentHover: number;
  edge: number;
  text: number;
  textStrong: number;
  attach: number;
  unresolved: number;
  tag: number;
  bg: number;
}
interface PixiCtx {
  app: Application;
  world: Container;
  edges: Graphics;
  arrows: Graphics;
  nodeLayer: Container;
  labelLayer: Container;
  tex: Texture;
  sprites: Map<GNode, Sprite>;
  labels: Text[];
  cols: ColorSet;
}

const TEXR = 32; // radius of the shared circle texture (sprites are scaled from this)

// --- force mapping: EXACT port of Obsidian's graph physics ------------------
// Reverse-engineered from the installed app (obsidian.asar → sim.js worker +
// app.js panel). Obsidian runs stock d3-force with: forceX/forceY gravity,
// forceManyBody(-slider³, distanceMin 30, theta .9, NO distanceMax), forceLink
// (distance = slider, strength = slider × d3's adaptive 1/min(degree)), and
// forceCollide(radius 60 const, strength .5). Same slider scales & defaults.
// Center slider → strength via Obsidian's MJ(e, .01) easing: 0.52 → 0.1.
const easeStrength = (e: number, t = 0.01) => (Math.pow(t, 1 - e) - t) / (1 - t);
const charge = (s: GraphSettings) => -Math.pow(s.repelForce, 3); // default 10 → -1000
const linkDist = (s: GraphSettings) => s.linkDistance; // default 250 (world units)
const centerStr = (s: GraphSettings) => easeStrength(s.centerForce); // default 0.52 → 0.1
const chargeStrength = (s: GraphSettings) => (_n: GNode) => charge(s);
const linkStrength = (s: GraphSettings) => (l: GLink) =>
  s.linkForce / Math.min((l.source as GNode).deg || 1, (l.target as GNode).deg || 1);
// Obsidian's node sizing: getSize() = nodeSizeMult × clamp(3·√(deg+1), 8, 30).
const nodeRadius = (n: GNode, s: GraphSettings) =>
  s.nodeSize * Math.max(8, Math.min(3 * Math.sqrt(n.deg + 1), 30));
// Obsidian's renderer works in DEVICE pixels: scale 1 = 1 world unit per device
// px, and nodeScale = √(1/scale) so the on-screen radius is getSize()·√scale
// DEVICE px. Our camera k is in CSS px, so the device scale is e = k·dpr and
// anything following the √zoom law maps to CSS px via √(k/dpr).
const dprNow = () => window.devicePixelRatio || 1;
const devScale = (k: number) => Math.max(1e-6, k) * dprNow();
const renderScale = (k: number) => Math.sqrt(Math.max(1e-6, k) / dprNow()); // CSS px per world unit under the √zoom law
const screenRadius = (n: GNode, s: GraphSettings, k: number) =>
  nodeRadius(n, s) * renderScale(k);
const spriteScale = (n: GNode, s: GraphSettings, k: number) =>
  screenRadius(n, s, k) / (TEXR * Math.max(1e-6, k)); // world-units scale for the sprite
// Obsidian's zoom clamp (device scale) and node dim level for hover fade.
const SCALE_MIN = 1 / 128;
const SCALE_MAX = 8;
const FADE_DIM = 0.2;

/**
 * Graph view — WebGL-rendered via PixiJS (like Obsidian's PixiJS graph), with the
 * d3-force layout running on the main thread. Pan/zoom is a GPU camera transform
 * (no geometry rebuild), so it stays smooth at thousands of nodes. The Filters
 * panel mirrors Obsidian: Tags / Attachments / Existing-only / Orphans, color
 * Groups, Display sliders and Forces.
 */
export default function GraphView() {
  const openFile = useStore((s) => s.openFile);
  const searchFor = useStore((s) => s.searchFor);
  const settings = useStore((s) => s.graphSettings);
  const patch = useStore((s) => s.setGraphSettings);
  const reset = useStore((s) => s.resetGraphSettings);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);
  const nodesRef = useRef<GNode[]>([]);
  const linksRef = useRef<GLink[]>([]);
  const rawRef = useRef<RawGraph | null>(null);
  const pixi = useRef<PixiCtx | null>(null);
  const mod = useRef<typeof import('pixi.js') | null>(null);
  const cam = useRef({ x: 0, y: 0, k: 1 });
  // Obsidian's smooth zoom: wheel sets targetScale (device px), the render loop
  // lerps scale 15% toward it per frame, anchored at the cursor when zooming in
  // and at the viewport center when zooming out.
  const zoomTarget = useRef(1);
  const zoomAnchor = useRef<{ x: number; y: number } | null>(null);
  // "Find node" jump: while set, the camera flies (pan+zoom lerp) to center
  // this node; any manual wheel/drag cancels the flight.
  const flyNode = useRef<GNode | null>(null);
  const adjRef = useRef<Map<GNode, Set<GNode>>>(new Map());
  const hover = useRef<GNode | null>(null);
  const drag = useRef<{ px: number; py: number; moved: number; dragNode?: GNode } | null>(null);
  const dragNode = useRef<GNode | null>(null);
  const rafRef = useRef<number>();
  const fullDirty = useRef(false);
  const edgesDirty = useRef(false);
  const lastEdgeK = useRef(-1);
  const userMoved = useRef(false);
  const sref = useRef(settings);
  sref.current = settings;

  const [rawVersion, setRawVersion] = useState(0);
  const [sceneVersion, setSceneVersion] = useState(0);
  const [jumpQ, setJumpQ] = useState(''); // "Find node" query

  // Keyword match over the nodes currently on the graph: every word must appear
  // in the label or the path; tag nodes always rank first, then
  // prefix > label > path, then by degree.
  const jumpResults = useMemo(() => {
    const words = jumpQ.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const scored: { n: GNode; s: number }[] = [];
    for (const n of nodesRef.current) {
      const label = n.label.toLowerCase();
      const bare = label.startsWith('#') ? label.slice(1) : label; // tags: prefix-match without '#'
      const id = n.id.toLowerCase();
      let ok = true;
      let s = 0;
      for (const w of words) {
        if (label.includes(w)) s += bare.startsWith(w) ? 3 : 2;
        else if (id.includes(w)) s += 1;
        else {
          ok = false;
          break;
        }
      }
      if (ok) scored.push({ n, s: (n.kind === 'tag' ? 1000 : 0) + s * 10 + Math.min(n.deg, 9) });
    }
    scored.sort((a, b) => b.s - a.s || a.n.label.length - b.n.label.length);
    return scored.slice(0, 50).map((x) => x.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpQ, sceneVersion]);
  const [panelOpen, setPanelOpen] = useState(false); // Obsidian default: collapsed, cog only
  const [stats, setStats] = useState({ total: 0, shown: 0, orphans: 0 });
  const [buildError, setBuildError] = useState<string | null>(null);

  // ---- colour helpers -----------------------------------------------------
  const getCols = (): ColorSet => {
    const Color = mod.current!.Color;
    const cs = getComputedStyle(document.querySelector('.theme-light, .theme-dark') || document.body);
    const toInt = (name: string, fb: number) => {
      const v = cs.getPropertyValue(name).trim();
      if (!v) return fb;
      try {
        return new Color(v).toNumber();
      } catch {
        return fb;
      }
    };
    return {
      accent: toInt('--interactive-accent', 0x7852ee),
      accentHover: toInt('--text-accent-hover', 0xa98bff),
      edge: toInt('--text-faint', 0x999999),
      text: toInt('--text-muted', 0x666666),
      textStrong: toInt('--text-normal', 0x222222),
      attach: 0xe0a008,
      unresolved: toInt('--text-faint', 0xaaaaaa),
      tag: 0x3aa757, // Obsidian-like green for tag nodes
      bg: toInt('--bg-primary', 0xffffff),
    };
  };

  const colorOf = (n: GNode, cols: ColorSet): number => {
    for (const g of sref.current.groups) {
      const q = g.query.trim().toLowerCase();
      if (!q) continue;
      if (
        n.label.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q.replace(/^#/, '')))
      ) {
        try {
          return new mod.current!.Color(g.color).toNumber();
        } catch {
          /* ignore bad color */
        }
      }
    }
    if (n.kind === 'attachment') return cols.attach;
    if (n.kind === 'unresolved') return cols.unresolved;
    if (n.kind === 'tag') return cols.tag;
    return cols.text; // Obsidian draws plain notes gray, not accent-colored
  };

  // ---- rendering (camera transform + on-demand repaint) -------------------
  const scheduleRender = (full: boolean) => {
    if (full) fullDirty.current = true;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = undefined;
      doRender();
    });
  };

  // One step of Obsidian's updateZoom(): lerp the scale 15% toward targetScale
  // around the zoom anchor. Returns true while the animation is still running.
  const stepZoom = (): boolean => {
    const v = cam.current;
    const dpr = dprNow();
    let e = v.k * dpr;
    const t = (zoomTarget.current = Math.min(SCALE_MAX, Math.max(SCALE_MIN, zoomTarget.current)));
    if ((e > t ? e / t : t / e) - 1 < 0.01) return false;
    const wrap = wrapRef.current;
    const a = zoomAnchor.current ?? {
      x: (wrap?.clientWidth || 900) / 2,
      y: (wrap?.clientHeight || 600) / 2,
    };
    const wx = (a.x - v.x) / v.k; // world point pinned under the anchor
    const wy = (a.y - v.y) / v.k;
    e = e * 0.85 + t * 0.15;
    v.k = e / dpr;
    v.x = a.x - wx * v.k;
    v.y = a.y - wy * v.k;
    return true;
  };

  // Fly-to-node animation: ease the scale toward zoomTarget and the pan toward
  // centering the node, with the same 15%/frame lerp as Obsidian's updateZoom.
  const stepFly = (): boolean => {
    const n = flyNode.current;
    if (!n) return false;
    const v = cam.current;
    const dpr = dprNow();
    const wrap = wrapRef.current;
    const W = wrap?.clientWidth || 900;
    const H = wrap?.clientHeight || 600;
    const t = (zoomTarget.current = Math.min(SCALE_MAX, Math.max(SCALE_MIN, zoomTarget.current)));
    let e = v.k * dpr;
    e = e * 0.85 + t * 0.15;
    v.k = e / dpr;
    const tx = W / 2 - (n.x ?? 0) * v.k;
    const ty = H / 2 - (n.y ?? 0) * v.k;
    v.x = v.x * 0.85 + tx * 0.15;
    v.y = v.y * 0.85 + ty * 0.15;
    const done =
      Math.abs(v.x - tx) < 0.5 && Math.abs(v.y - ty) < 0.5 && (e > t ? e / t : t / e) - 1 < 0.01;
    if (done) {
      v.x = tx;
      v.y = ty;
      flyNode.current = null;
    }
    return !done;
  };

  // Obsidian's hover fade: nodes not linked to the highlighted node ease toward
  // alpha 0.2 (mQ lerp, 90% retained per frame). Returns true while animating.
  const stepFade = (): boolean => {
    const h = hover.current;
    const nb = h ? adjRef.current.get(h) : null;
    let moving = false;
    for (const n of nodesRef.current) {
      const target = !h || n === h || nb?.has(n) ? 1 : FADE_DIM;
      const f = n.fade ?? 1;
      if (Math.abs(f - target) < 0.01) {
        if (f !== target) n.fade = target;
        continue;
      }
      n.fade = f * 0.9 + target * 0.1;
      moving = true;
    }
    return moving;
  };

  const applyNodeAlphas = () => {
    const p = pixi.current;
    if (!p) return;
    for (const [n, sp] of p.sprites) {
      sp.alpha = (n.kind === 'unresolved' ? 0.55 : 1) * (n.fade ?? 1);
    }
  };

  const doRender = () => {
    const p = pixi.current;
    if (!p) return;
    const zooming = flyNode.current ? stepFly() : stepZoom();
    const fading = stepFade();
    const { x, y, k } = cam.current;
    p.world.position.set(x, y);
    p.world.scale.set(k);
    if (fullDirty.current) updatePositions();
    // edges are drawn in world space at a constant DEVICE-pixel thickness; node
    // sprites follow Obsidian's √zoom law — both need a refresh on layout
    // change, zoom change, or when the hover highlight moves.
    if (fullDirty.current || k !== lastEdgeK.current || edgesDirty.current) {
      drawEdges();
      applyNodeScales();
      lastEdgeK.current = k;
      edgesDirty.current = false;
    }
    if (fading) applyNodeAlphas();
    fullDirty.current = false;
    updateLabels();
    p.app.render();
    // debug/testing hook: expose the live camera (used by automated UI checks)
    (window as unknown as { __graphCam?: object }).__graphCam = {
      k,
      x,
      y,
      target: zoomTarget.current,
      dev: devScale(k),
    };
    if (zooming || fading) scheduleRender(false);
  };

  const updatePositions = () => {
    const p = pixi.current;
    if (!p) return;
    for (const [n, sp] of p.sprites) {
      sp.x = n.x ?? 0;
      sp.y = n.y ?? 0;
    }
  };

  const applyNodeScales = () => {
    const p = pixi.current;
    if (!p) return;
    const s = sref.current;
    const k = cam.current.k || 1;
    for (const [n, sp] of p.sprites) {
      sp.scale.set(spriteScale(n, s, k));
      sp.alpha = (n.kind === 'unresolved' ? 0.55 : 1) * (n.fade ?? 1);
    }
  };

  const drawEdges = () => {
    const p = pixi.current;
    if (!p) return;
    const s = sref.current;
    const k = cam.current.k || 1;
    const h = hover.current;
    const g = p.edges;
    // Obsidian draws edges at lineSizeMult / scale in world space — i.e. a
    // constant lineSizeMult DEVICE pixels on screen — in a faint theme gray.
    // When a node is hovered, its edges switch to the highlight color and all
    // others dim like the unrelated nodes do.
    const width = s.linkThickness / devScale(k);
    const baseAlpha = Math.min(0.85, 0.18 + s.linkThickness * 0.22);
    g.clear();
    let hasHl = false;
    for (const l of linksRef.current) {
      const a = l.source as GNode;
      const b = l.target as GNode;
      if (h && (a === h || b === h)) {
        hasHl = true;
        continue;
      }
      g.moveTo(a.x ?? 0, a.y ?? 0);
      g.lineTo(b.x ?? 0, b.y ?? 0);
    }
    g.stroke({ width, color: p.cols.edge, alpha: baseAlpha * (h ? FADE_DIM : 1) });
    if (hasHl) {
      for (const l of linksRef.current) {
        const a = l.source as GNode;
        const b = l.target as GNode;
        if (!(a === h || b === h)) continue;
        g.moveTo(a.x ?? 0, a.y ?? 0);
        g.lineTo(b.x ?? 0, b.y ?? 0);
      }
      g.stroke({ width, color: p.cols.accentHover, alpha: 0.9 });
    }

    const ag = p.arrows;
    ag.clear();
    if (s.arrows) {
      // Obsidian: arrow sprite scale = 2√(lineSizeMult)/scale (world units) and
      // its alpha fades out with clamp(2·(scale − 0.3), 0, 1) as you zoom away.
      const e = devScale(k);
      const arrowAlpha = 0.6 * Math.max(0, Math.min(1, 2 * (e - 0.3)));
      if (arrowAlpha > 0.001) {
        const size = (8 * Math.sqrt(s.linkThickness)) / e;
        for (const l of linksRef.current) {
          const a = l.source as GNode;
          const b = l.target as GNode;
          const ang = Math.atan2((b.y ?? 0) - (a.y ?? 0), (b.x ?? 0) - (a.x ?? 0));
          const r = screenRadius(b, s, k) / k + 1; // world radius of the drawn node
          const tx = (b.x ?? 0) - Math.cos(ang) * r;
          const ty = (b.y ?? 0) - Math.sin(ang) * r;
          ag.moveTo(tx, ty);
          ag.lineTo(tx - Math.cos(ang - 0.4) * size, ty - Math.sin(ang - 0.4) * size);
          ag.lineTo(tx - Math.cos(ang + 0.4) * size, ty - Math.sin(ang + 0.4) * size);
          ag.closePath();
        }
        ag.fill({ color: p.cols.edge, alpha: arrowAlpha });
      }
    }
  };

  const ensureLabel = (i: number): Text => {
    const p = pixi.current!;
    let t = p.labels[i];
    if (!t) {
      // Obsidian's node label style: fontSize 14 (+ getSize()/4 applied via the
      // per-node scale), default weight, no outline, resolution 2.
      t = new mod.current!.Text({
        text: '',
        style: {
          fontFamily:
            'ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Inter", sans-serif',
          fontSize: 14,
          fill: p.cols.textStrong,
        },
        resolution: 2,
      });
      t.anchor.set(0.5, 0);
      p.labelLayer.addChild(t);
      p.labels[i] = t;
    }
    return t;
  };

  const updateLabels = () => {
    const p = pixi.current;
    const wrap = wrapRef.current;
    if (!p || !wrap) return;
    const s = sref.current;
    const { x: cx, y: cy, k } = cam.current;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const h = hover.current;
    const e = devScale(k);
    const rs = renderScale(k);
    const dpr = dprNow();
    // Obsidian's global text fade (device scale!): textAlpha =
    // clamp(log2(scale) + 1 − fade, 0, 1) — all labels share one zoom-driven
    // alpha, further multiplied by each node's hover-fade; hover is always 1.
    const textAlpha = Math.max(0, Math.min(1, Math.log2(e) + 1 - s.textFade));

    const cand: { n: GNode; sx: number; sy: number; a: number }[] = [];
    if (textAlpha > 0.001 || h) {
      for (const n of nodesRef.current) {
        const a = n === h ? 1 : textAlpha * (n.fade ?? 1);
        if (a <= 0.02) continue;
        const sx = (n.x ?? 0) * k + cx;
        const sy = (n.y ?? 0) * k + cy;
        if (sx < -100 || sx > W + 100 || sy < -60 || sy > H + 60) continue;
        cand.push({ n, sx, sy, a });
      }
    }
    // Label pool is bounded; prefer the hovered node, then high-degree nodes.
    cand.sort((u, v) => (v.n === h ? 1 : 0) - (u.n === h ? 1 : 0) || v.n.deg - u.n.deg);
    const MAX = Math.min(cand.length, 400);

    let li = 0;
    for (let ci = 0; ci < MAX; ci++) {
      const { n, sx, sy, a } = cand[ci];
      const label = n.label.length > 44 ? n.label.slice(0, 42) + '…' : n.label;
      const t = ensureLabel(li++);
      if (t.text !== label) t.text = label;
      const isH = n === h;
      if ((t as unknown as { _hv?: boolean })._hv !== isH) {
        (t as unknown as { _hv?: boolean })._hv = isH;
        t.style.fill = isH ? p.cols.accentHover : p.cols.textStrong;
      }
      // Obsidian: labels live in world space with scale = nodeScale and font
      // size 14 + getSize()/4, i.e. they shrink with √zoom exactly like nodes;
      // a hovered label never shrinks below 1 device pixel per font unit.
      const r = nodeRadius(n, s);
      const fontMul = (14 + r / 4) / 14;
      const sc = (isH && e < 1 ? 1 / dpr : rs) * fontMul;
      t.scale.set(sc);
      t.x = sx;
      t.y = sy + (r + 5) * rs + (isH ? 15 / dpr : 0);
      t.alpha = a;
      t.visible = true;
    }
    for (let i = li; i < p.labels.length; i++) p.labels[i].visible = false;
  };

  // ---- scene (re)build ----------------------------------------------------
  const resizeRenderer = () => {
    const p = pixi.current;
    const wrap = wrapRef.current;
    if (!p || !wrap) return;
    const W = wrap.clientWidth || 900;
    const H = wrap.clientHeight || 600;
    p.app.renderer.resize(W, H);
  };

  const buildScene = () => {
    const p = pixi.current;
    if (!p) return;
    try {
      const Sprite = mod.current!.Sprite;
      const s = sref.current;
      p.cols = getCols();
      for (const sp of p.sprites.values()) sp.destroy();
      p.sprites.clear();
      p.nodeLayer.removeChildren();

      for (const n of nodesRef.current) {
        const sp = new Sprite(p.tex);
        sp.anchor.set(0.5);
        sp.tint = colorOf(n, p.cols);
        sp.scale.set(spriteScale(n, s, cam.current.k || 1));
        sp.alpha = n.kind === 'unresolved' ? 0.55 : 1;
        sp.x = n.x ?? 0;
        sp.y = n.y ?? 0;
        p.nodeLayer.addChild(sp);
        p.sprites.set(n, sp);
      }
      if (!userMoved.current) resetCamera();
      resizeRenderer();
      fullDirty.current = true;
      scheduleRender(true);
    } catch (err) {
      console.error('Pixi scene build failed:', err);
    }
  };

  // Obsidian's initial viewport: scale 1 in DEVICE pixels (no zoom-to-fit), the
  // spawn point centered — the graph blooms outward past the edges and the user
  // pans/zooms from there. In CSS pixels that's k = 1/devicePixelRatio.
  const resetCamera = () => {
    const wrap = wrapRef.current;
    const W = wrap?.clientWidth || 900;
    const H = wrap?.clientHeight || 600;
    const k = 1 / dprNow();
    cam.current = { k, x: (W / 2) * (1 - k), y: (H / 2) * (1 - k) };
    zoomTarget.current = 1; // device scale, like Obsidian's scale = targetScale = 1
    zoomAnchor.current = null;
  };

  const applyDisplay = () => {
    const p = pixi.current;
    if (!p) return;
    const s = sref.current;
    p.cols = getCols();
    const k = cam.current.k || 1;
    for (const [n, sp] of p.sprites) {
      sp.tint = n === hover.current ? p.cols.accentHover : colorOf(n, p.cols);
      sp.scale.set(spriteScale(n, s, k));
    }
    scheduleRender(true);
  };

  // ---- init pixi (once) ---------------------------------------------------
  useEffect(() => {
    let destroyed = false;
    (async () => {
      const PIXI = await import('pixi.js');
      if (destroyed) return;
      // Some hosts serve under a CSP without 'unsafe-eval'. PixiJS v8 generates
      // shader/UBO code via `new Function()` by default, which CSP blocks
      // ("Current environment does not allow unsafe-eval"). Importing Pixi's
      // unsafe-eval module self-installs interpreted (no-eval) polyfills for the
      // shader/UBO/uniform generators, so the WebGL renderer works regardless of
      // CSP. The import runs for its side effect and must precede app.init().
      try {
        await import('pixi.js/unsafe-eval');
      } catch {
        /* older Pixi without the subpath export — ignore */
      }
      if (destroyed) return;
      mod.current = PIXI;
      const wrap = wrapRef.current!;
      const app = new PIXI.Application();
      await app.init({
        canvas: canvasRef.current!,
        width: wrap.clientWidth || 900,
        height: wrap.clientHeight || 600,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        backgroundAlpha: 0,
        autoStart: false,
        preference: 'webgl',
        powerPreference: 'high-performance',
      });
      if (destroyed) {
        app.destroy(true);
        return;
      }
      app.ticker.stop();
      const world = new PIXI.Container();
      const edges = new PIXI.Graphics();
      const arrows = new PIXI.Graphics();
      const nodeLayer = new PIXI.Container();
      const labelLayer = new PIXI.Container();
      world.addChild(edges);
      world.addChild(arrows);
      world.addChild(nodeLayer);
      app.stage.addChild(world);
      app.stage.addChild(labelLayer);

      const cg = new PIXI.Graphics().circle(0, 0, TEXR).fill(0xffffff);
      const tex = app.renderer.generateTexture({ target: cg, resolution: 2, antialias: true });
      cg.destroy();

      pixi.current = { app, world, edges, arrows, nodeLayer, labelLayer, tex, sprites: new Map(), labels: [], cols: getCols() };
      buildScene(); // builds from current data (or nothing yet)
    })();
    return () => {
      destroyed = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const p = pixi.current;
      if (p) {
        p.app.destroy(true, { children: true, texture: true });
        pixi.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pane ⋯ menu → "Copy screenshot": extract the Pixi stage to a PNG.
  // (Reading the WebGL canvas directly would be blank — no preserveDrawingBuffer.)
  useEffect(() => {
    const onShot = async () => {
      const p = pixi.current;
      if (!p) return;
      try {
        p.app.render();
        const src = p.app.renderer.extract.canvas(p.app.stage) as HTMLCanvasElement;
        const out = document.createElement('canvas');
        out.width = src.width;
        out.height = src.height;
        const ctx = out.getContext('2d')!;
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-primary').trim() || '#ffffff';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(src, 0, 0);
        const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'));
        if (!blob) throw new Error('toBlob failed');
        if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          useStore.getState().notify('Graph screenshot copied');
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'graph.png';
          a.click();
          URL.revokeObjectURL(a.href);
          useStore.getState().notify('Graph screenshot downloaded');
        }
      } catch {
        useStore.getState().notify('Screenshot failed');
      }
    };
    window.addEventListener('wo-graph-screenshot', onShot);
    return () => window.removeEventListener('wo-graph-screenshot', onShot);
  }, []);

  // fetch the raw graph once
  useEffect(() => {
    let cancelled = false;
    api
      .graph()
      .then((g) => {
        if (cancelled) return;
        rawRef.current = g as RawGraph;
        setRawVersion((v) => v + 1);
      })
      .catch(() => {
        rawRef.current = { nodes: [], edges: [] };
        setRawVersion((v) => v + 1);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // (re)build filtered graph + simulation whenever the structural filters change
  useEffect(() => {
    const raw = rawRef.current;
    if (!raw) return;
    const s = sref.current;
    let sim: Simulation<GNode, GLink> | null = null;

    try {
      const byId = new Map<string, GNode>();
      for (const n of raw.nodes) {
        if (n.kind === 'attachment' && !s.attachments) continue;
        if (n.kind === 'unresolved' && s.existingOnly) continue;
        byId.set(n.id, { id: n.id, label: n.label, kind: n.kind, tags: n.tags ?? [], deg: 0 });
      }
      if (s.tags) {
        for (const n of raw.nodes) {
          if (!byId.has(n.id) || !n.tags) continue;
          for (const tag of n.tags) {
            const id = `tag:${tag}`;
            if (!byId.has(id)) byId.set(id, { id, label: '#' + tag, kind: 'tag', tags: [], deg: 0 });
          }
        }
      }

      const pairs: { source: string; target: string }[] = [];
      for (const e of raw.edges) {
        if (byId.has(e.source) && byId.has(e.target)) pairs.push({ source: e.source, target: e.target });
      }
      if (s.tags) {
        for (const n of raw.nodes) {
          if (!byId.has(n.id) || !n.tags) continue;
          for (const tag of n.tags) pairs.push({ source: n.id, target: `tag:${tag}` });
        }
      }

      let nodeList = [...byId.values()];
      const q = s.search.trim().toLowerCase();
      if (q) {
        const keep = new Set(
          nodeList
            .filter((n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
            .map((n) => n.id),
        );
        nodeList = nodeList.filter((n) => keep.has(n.id));
      }

      let ids = new Set(nodeList.map((n) => n.id));
      let pairList = pairs.filter((l) => ids.has(l.source) && ids.has(l.target));

      const deg = new Map<string, number>();
      for (const l of pairList) {
        deg.set(l.source, (deg.get(l.source) ?? 0) + 1);
        deg.set(l.target, (deg.get(l.target) ?? 0) + 1);
      }
      nodeList.forEach((n) => (n.deg = deg.get(n.id) ?? 0));

      const orphanCount = nodeList.filter((n) => n.kind === 'note' && (deg.get(n.id) ?? 0) === 0).length;

      if (!s.orphans) {
        nodeList = nodeList.filter((n) => (deg.get(n.id) ?? 0) > 0);
        ids = new Set(nodeList.map((n) => n.id));
        pairList = pairList.filter((l) => ids.has(l.source) && ids.has(l.target));
      }

      const nodeMap = new Map(nodeList.map((n) => [n.id, n] as const));
      const linkList: GLink[] = [];
      const adj = new Map<GNode, Set<GNode>>();
      for (const l of pairList) {
        const a = nodeMap.get(l.source);
        const b = nodeMap.get(l.target);
        if (a && b) {
          linkList.push({ source: a, target: b });
          if (!adj.has(a)) adj.set(a, new Set());
          if (!adj.has(b)) adj.set(b, new Set());
          adj.get(a)!.add(b);
          adj.get(b)!.add(a);
        }
      }
      nodeList.forEach((n) => (n.fade = 1));
      adjRef.current = adj;

      nodesRef.current = nodeList;
      linksRef.current = linkList;
      setBuildError(null);
      setStats({
        total: raw.nodes.filter((n) => n.kind === 'note').length,
        shown: nodeList.length,
        orphans: orphanCount,
      });

      const wrap = wrapRef.current!;
      const W = wrap.clientWidth || 900;
      const H = wrap.clientHeight || 600;

      // Obsidian spawns every node at the origin and lets the sim "big-bang"
      // outward at fixed zoom. A tiny phyllotaxis disc at the center reproduces
      // that bloom without degenerate coincident points.
      nodeList.forEach((n, i) => {
        const r = 2 * Math.sqrt(i + 0.5);
        const a = i * 2.39996; // golden angle
        n.x = W / 2 + Math.cos(a) * r;
        n.y = H / 2 + Math.sin(a) * r;
      });

      // Obsidian's exact simulation (sim.js): d3-force with these params.
      simRef.current?.stop();
      sim = forceSimulation<GNode>(nodeList)
        .force('charge', forceManyBody<GNode>().strength(chargeStrength(s)).theta(0.9).distanceMin(30))
        .force('link', forceLink<GNode, GLink>(linkList).distance(linkDist(s)).strength(linkStrength(s)))
        .force('x', forceX(W / 2).strength(centerStr(s)))
        .force('y', forceY(H / 2).strength(centerStr(s)))
        .force('collide', forceCollide<GNode>(60).strength(0.5).iterations(1))
        .alpha(1)
        .alphaDecay(1 - Math.pow(0.001, 1 / 300))
        .velocityDecay(0.4);
      userMoved.current = false;
      sim.on('tick', () => scheduleRender(true));
      simRef.current = sim;
      setSceneVersion((v) => v + 1); // tell the renderer to (re)create sprites
    } catch (err) {
      console.error('Graph build failed:', err);
      simRef.current?.stop();
      simRef.current = null;
      nodesRef.current = [];
      linksRef.current = [];
      setBuildError('Could not render the graph with the current filters.');
      setSceneVersion((v) => v + 1);
    }

    return () => {
      sim?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawVersion, settings.tags, settings.attachments, settings.existingOnly, settings.orphans, settings.search]);

  // rebuild the Pixi scene whenever the data changes (and once Pixi is ready)
  useEffect(() => {
    if (pixi.current) buildScene();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneVersion]);

  // forces changed → update in place and reheat
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const s = sref.current;
    (sim.force('charge') as ReturnType<typeof forceManyBody<GNode>> | undefined)?.strength(chargeStrength(s));
    (sim.force('link') as ReturnType<typeof forceLink<GNode, GLink>> | undefined)?.distance(linkDist(s)).strength(linkStrength(s));
    (sim.force('x') as ReturnType<typeof forceX<GNode>> | undefined)?.strength(centerStr(s));
    (sim.force('y') as ReturnType<typeof forceY<GNode>> | undefined)?.strength(centerStr(s));
    sim.alpha(0.3).restart(); // Obsidian posts alpha .3 on force changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.repelForce, settings.linkForce, settings.linkDistance, settings.centerForce]);

  // display-only changes → re-tint / re-scale + repaint
  useEffect(() => {
    applyDisplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.nodeSize, settings.linkThickness, settings.textFade, settings.arrows, settings.groups]);

  // repaint + resize on container resize
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      resizeRenderer();
      scheduleRender(false);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // smooth cursor-anchored zoom (native non-passive wheel listener)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Obsidian's onWheel: targetScale ×= 1.5^(−ΔY/120) clamped to [1/128, 8]
    // (device scale); zooming IN anchors at the cursor, zooming OUT at the
    // viewport center. The actual scale eases toward the target in stepZoom().
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 40;
      else if (e.deltaMode === 2) dy *= 800;
      flyNode.current = null; // manual zoom cancels a fly-to-node in progress
      const t = Math.min(SCALE_MAX, Math.max(SCALE_MIN, zoomTarget.current * Math.pow(1.5, -dy / 120)));
      zoomTarget.current = t;
      if (t < cam.current.k * dprNow()) {
        zoomAnchor.current = null; // zoom out: anchor at viewport center
      } else {
        const rect = canvas.getBoundingClientRect();
        zoomAnchor.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }
      userMoved.current = true;
      scheduleRender(false);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- touch interactions (mobile): 1 finger = pan, pinch = zoom, tap = open node ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const st: {
      pts: Map<number, { x: number; y: number }>;
      mode: 'pan' | 'pinch' | 'node' | null;
      px: number;
      py: number;
      moved: number;
      dist: number;
      grabNode?: GNode | null;
      timer?: number;
    } = { pts: new Map(), mode: null, px: 0, py: 0, moved: 0, dist: 0, grabNode: null };

    const twoPts = () => {
      const v = [...st.pts.values()];
      return v.length >= 2 ? ([v[0], v[1]] as const) : null;
    };
    const mid = () => {
      const p = twoPts();
      return p ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : { x: 0, y: 0 };
    };
    const spread = () => {
      const p = twoPts();
      return p ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1 : 1;
    };

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) st.pts.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (st.pts.size === 1) {
        const p = [...st.pts.values()][0];
        st.mode = 'pan';
        st.px = p.x;
        st.py = p.y;
        st.moved = 0;
        // Long-press on a node grabs it for dragging (d3 fx/fy), like the
        // mouse drag; moving or lifting before the timer just pans/taps.
        const n = nodeAt(p.x, p.y);
        st.grabNode = n && n.kind !== 'tag' ? n : null;
        if (st.grabNode) {
          st.timer = window.setTimeout(() => {
            st.timer = undefined;
            if (st.mode === 'pan' && st.moved < 12 && st.grabNode) {
              st.mode = 'node';
              const w = toWorld(st.px, st.py);
              st.grabNode.fx = w.x;
              st.grabNode.fy = w.y;
              simRef.current?.alphaTarget(0.3).restart();
              flyNode.current = null;
              setHover(st.grabNode); // keep the node's relations lit while dragging
            }
          }, 300);
        }
      } else if (st.pts.size >= 2) {
        if (st.timer) { clearTimeout(st.timer); st.timer = undefined; }
        if (st.grabNode) {
          if (st.mode === 'node') { st.grabNode.fx = undefined; st.grabNode.fy = undefined; simRef.current?.alphaTarget(0); setHover(null); }
          st.grabNode = null;
        }
        const m = mid();
        st.mode = 'pinch';
        st.px = m.x;
        st.py = m.y;
        st.dist = spread();
        st.moved = 999; // a pinch that drops to one finger must not count as a tap
      }
    };
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!st.mode) return;
      for (const t of Array.from(e.changedTouches)) if (st.pts.has(t.identifier)) st.pts.set(t.identifier, { x: t.clientX, y: t.clientY });
      flyNode.current = null; // manual gesture cancels a fly-to-node in progress
      if (st.mode === 'node' && st.grabNode && st.pts.size === 1) {
        const p = [...st.pts.values()][0];
        const w = toWorld(p.x, p.y);
        st.grabNode.fx = w.x;
        st.grabNode.fy = w.y;
        st.px = p.x;
        st.py = p.y;
        st.moved = 999; // never treat as a tap
        userMoved.current = true;
        scheduleRender(true);
      } else if (st.mode === 'pinch' && st.pts.size >= 2) {
        const m = mid();
        const d = spread();
        cam.current.x += m.x - st.px;
        cam.current.y += m.y - st.py;
        const t = Math.min(SCALE_MAX, Math.max(SCALE_MIN, zoomTarget.current * (d / st.dist)));
        zoomTarget.current = t;
        const rect = canvas.getBoundingClientRect();
        zoomAnchor.current = t < cam.current.k * dprNow() ? null : { x: m.x - rect.left, y: m.y - rect.top };
        st.dist = d;
        st.px = m.x;
        st.py = m.y;
      } else if (st.mode === 'pan' && st.pts.size === 1) {
        const p = [...st.pts.values()][0];
        cam.current.x += p.x - st.px;
        cam.current.y += p.y - st.py;
        st.moved += Math.abs(p.x - st.px) + Math.abs(p.y - st.py);
        st.px = p.x;
        st.py = p.y;
      }
      userMoved.current = true;
      scheduleRender(false);
    };
    const onEnd = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) st.pts.delete(t.identifier);
      if (st.pts.size === 0) {
        if (st.timer) { clearTimeout(st.timer); st.timer = undefined; }
        if (st.mode === 'node' && st.grabNode) {
          st.grabNode.fx = undefined;
          st.grabNode.fy = undefined;
          st.grabNode = null;
          simRef.current?.alphaTarget(0);
          setHover(null); // touch has no mousemove to clear the highlight
        }
        if (st.mode === 'pan' && st.moved < 10) {
          const t0 = e.changedTouches[0];
          const n = nodeAt(t0.clientX, t0.clientY);
          if (n) {
            if (n.kind === 'note') openFile(n.id);
            else if (n.kind === 'tag') searchFor(`tag:${n.id.slice(4)}`);
          }
        }
        st.mode = null;
      } else if (st.pts.size === 1 && st.mode === 'pinch') {
        st.grabNode = null; // a leftover finger after pinch just pans
        st.mode = 'pan'; // one finger left after a pinch: keep panning
        const p = [...st.pts.values()][0];
        st.px = p.x;
        st.py = p.y;
      }
    };

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd, { passive: false });
    canvas.addEventListener('touchcancel', onEnd, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('touchcancel', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- pointer interactions ----------------------------------------------
  const nodeAt = (clientX: number, clientY: number): GNode | null => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const { x: cx, y: cy, k } = cam.current;
    const s = sref.current;
    let best: GNode | null = null;
    let bestD = Infinity;
    for (const n of nodesRef.current) {
      const px = (n.x ?? 0) * k + cx;
      const py = (n.y ?? 0) * k + cy;
      const d = Math.hypot(px - mx, py - my);
      if (d < Math.max(12, screenRadius(n, s, k) + 2) && d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  };

  const setHover = (n: GNode | null) => {
    if (n === hover.current) return;
    const p = pixi.current;
    if (p) {
      const prev = hover.current;
      if (prev) {
        const sp = p.sprites.get(prev);
        if (sp) sp.tint = colorOf(prev, p.cols);
      }
      if (n) {
        const sp = p.sprites.get(n);
        if (sp) sp.tint = p.cols.accentHover;
      }
    }
    hover.current = n;
    edgesDirty.current = true; // hovered node's edges get the highlight color
    if (canvasRef.current) canvasRef.current.style.cursor = n ? 'pointer' : 'grab';
    scheduleRender(false);
  };

  // "Find node" jump: fly the camera to the node (zoom in to at least 2× device
  // scale) and light it up like a hover until the user moves the mouse.
  const flyTo = (n: GNode) => {
    zoomTarget.current = Math.min(SCALE_MAX, Math.max(2, devScale(cam.current.k)));
    flyNode.current = n;
    userMoved.current = true;
    setHover(n);
    scheduleRender(false);
  };

  // Node drag (dragNode): pinching a node with the mouse sets d3 fx/fy and
  // reheats the sim (alphaTarget .3, like Obsidian's panel); releasing clears
  // the pin so physics resumes. Clicks without movement still open the note.
  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { x: cx, y: cy, k } = cam.current;
    return { x: (clientX - rect.left - cx) / k, y: (clientY - rect.top - cy) / k };
  };
  const onDown = (e: React.MouseEvent) => {
    const n = nodeAt(e.clientX, e.clientY);
    drag.current = { px: e.clientX, py: e.clientY, moved: 0, dragNode: n ?? undefined };
    if (n && n.kind !== 'tag') {
      const w = toWorld(e.clientX, e.clientY);
      n.fx = w.x; n.fy = w.y;
      dragNode.current = n;
      simRef.current?.alphaTarget(0.3).restart();
      flyNode.current = null;
      setHover(n); // highlight the node + its edges while dragging (Obsidian parity)
    }
  };
  const onMove = (e: React.MouseEvent) => {
    if (drag.current) {
      const dx = e.clientX - drag.current.px;
      const dy = e.clientY - drag.current.py;
      drag.current.px = e.clientX;
      drag.current.py = e.clientY;
      drag.current.moved += Math.abs(dx) + Math.abs(dy);
      if (dragNode.current) {
        const w = toWorld(e.clientX, e.clientY);
        dragNode.current.fx = w.x;
        dragNode.current.fy = w.y;
        userMoved.current = true;
        scheduleRender(true);
      } else {
        cam.current.x += dx;
        cam.current.y += dy;
        flyNode.current = null; // manual pan cancels a fly-to-node in progress
        userMoved.current = true;
        scheduleRender(false);
      }
    } else {
      setHover(nodeAt(e.clientX, e.clientY));
    }
  };
  const onUp = (e: React.MouseEvent) => {
    const d = drag.current;
    drag.current = null;
    if (dragNode.current) {
      dragNode.current.fx = undefined;
      dragNode.current.fy = undefined;
      dragNode.current = null;
      simRef.current?.alphaTarget(0);
    }
    if (d && d.moved < 5) {
      const n = nodeAt(e.clientX, e.clientY);
      if (!n) return;
      if (n.kind === 'note') openFile(n.id);
      else if (n.kind === 'tag') searchFor(`tag:${n.id.slice(4)}`);
    }
  };

  return (
    <div className="graph-view">
      <div className="graph-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          style={{ cursor: 'grab', position: 'absolute', inset: 0 }}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={() => {
            drag.current = null;
            setHover(null);
          }}
        />
        <div className="graph-node-search">
          <Icon name="search" size={14} />
          <input
            value={jumpQ}
            placeholder="Find node…"
            spellCheck={false}
            onChange={(e) => setJumpQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && jumpResults.length) {
                flyTo(jumpResults[0]);
                setJumpQ('');
              } else if (e.key === 'Escape') {
                setJumpQ('');
              }
            }}
          />
          {jumpQ.trim() !== '' && (
            <div className="graph-node-results">
              {jumpResults.length === 0 && <div className="graph-node-empty">No matching nodes</div>}
              {jumpResults.map((n) => (
                <button
                  key={n.id}
                  className="graph-node-result"
                  onClick={() => {
                    flyTo(n);
                    setJumpQ('');
                  }}
                >
                  <span className={`gnr-label gnr-${n.kind}`}>{n.label}</span>
                  {n.kind === 'note' && n.id !== n.label && <span className="gnr-path">{n.id}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="graph-hint">
          {stats.shown} / {stats.total} notes · {stats.orphans} orphans · scroll to zoom · drag to pan · click a tag to search
        </div>

        {buildError && (
          <div className="graph-error">
            <span>{buildError}</span>
            <button className="btn secondary" onClick={reset}>
              Reset filters
            </button>
          </div>
        )}

        {!panelOpen && (
          <button className="graph-panel-open" title="Show filters" onClick={() => setPanelOpen(true)}>
            <Icon name="settings" size={16} />
          </button>
        )}

        {panelOpen && (
          <FilterPanel
            settings={settings}
            patch={patch}
            reset={reset}
            onClose={() => setPanelOpen(false)}
            onAnimate={() => simRef.current?.alpha(0.9).restart()}
          />
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Filter panel (Obsidian parity)
// ----------------------------------------------------------------------------

const GROUP_COLORS = ['#e0a008', '#13a8cd', '#3aa757', '#e5534b', '#9b6dff', '#e668c0'];

function FilterPanel({
  settings: s,
  patch,
  reset,
  onClose,
  onAnimate,
}: {
  settings: GraphSettings;
  patch: (p: Partial<GraphSettings>) => void;
  reset: () => void;
  onClose: () => void;
  onAnimate: () => void;
}) {
  const addGroup = () =>
    patch({
      groups: [...s.groups, { query: '', color: GROUP_COLORS[s.groups.length % GROUP_COLORS.length] }],
    });
  const setGroup = (i: number, g: Partial<{ query: string; color: string }>) =>
    patch({ groups: s.groups.map((x, j) => (j === i ? { ...x, ...g } : x)) });
  const delGroup = (i: number) => patch({ groups: s.groups.filter((_, j) => j !== i) });

  return (
    <div className="graph-panel">
      <Section
        title="Filters"
        actions={
          <>
            <button className="nav-action" title="Reset to defaults" onClick={reset}>
              <Icon name="refresh-cw" size={14} />
            </button>
            <button className="nav-action" title="Close" onClick={onClose}>
              <Icon name="x" size={14} />
            </button>
          </>
        }
      >
        <input
          className="text-input"
          placeholder="Search files..."
          value={s.search}
          onChange={(e) => patch({ search: e.target.value })}
        />
        <Toggle label="Tags" checked={s.tags} onChange={(v) => patch({ tags: v })} />
        <Toggle label="Attachments" checked={s.attachments} onChange={(v) => patch({ attachments: v })} />
        <Toggle label="Existing files only" checked={s.existingOnly} onChange={(v) => patch({ existingOnly: v })} />
        <Toggle label="Orphans" checked={s.orphans} onChange={(v) => patch({ orphans: v })} />
      </Section>

      <Section title="Groups">
        <button className="btn" style={{ width: '100%' }} onClick={addGroup}>
          New group
        </button>
        {s.groups.map((g, i) => (
          <div className="graph-group-row" key={i}>
            <input
              type="color"
              className="graph-color"
              value={g.color}
              onChange={(e) => setGroup(i, { color: e.target.value })}
            />
            <input
              className="text-input"
              placeholder="Search query"
              value={g.query}
              onChange={(e) => setGroup(i, { query: e.target.value })}
            />
            <button className="nav-action" title="Remove group" onClick={() => delGroup(i)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </Section>

      <Section title="Display">
        <Toggle label="Arrows" checked={s.arrows} onChange={(v) => patch({ arrows: v })} />
        <Slider label="Text fade threshold" min={-3} max={3} step={0.1} value={s.textFade} onChange={(v) => patch({ textFade: v })} />
        <Slider label="Node size" min={0.1} max={5} step={0.1} value={s.nodeSize} onChange={(v) => patch({ nodeSize: v })} />
        <Slider label="Link thickness" min={0.1} max={5} step={0.1} value={s.linkThickness} onChange={(v) => patch({ linkThickness: v })} />
        <button className="btn" style={{ width: '100%', marginTop: 6 }} onClick={onAnimate}>
          Animate
        </button>
      </Section>

      <Section title="Forces">
        <Slider label="Center force" min={0} max={1} step={0.01} value={s.centerForce} onChange={(v) => patch({ centerForce: v })} />
        <Slider label="Repel force" min={0} max={20} step={0.1} value={s.repelForce} onChange={(v) => patch({ repelForce: v })} />
        <Slider label="Link force" min={0} max={1} step={0.01} value={s.linkForce} onChange={(v) => patch({ linkForce: v })} />
        <Slider label="Link distance" min={30} max={500} step={1} value={s.linkDistance} onChange={(v) => patch({ linkDistance: v })} />
      </Section>
    </div>
  );
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="graph-section">
      <div className="graph-section-head">
        <button className="graph-section-title" onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
          {title}
        </button>
        <span style={{ flex: 1 }} />
        {actions}
      </div>
      {open && <div className="graph-section-body">{children}</div>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="graph-row">
      <span className="graph-row-label">{label}</span>
      <button
        className={`graph-switch ${checked ? 'on' : ''}`}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span className="graph-knob" />
      </button>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="graph-slider">
      <span className="graph-row-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        title={String(value)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
