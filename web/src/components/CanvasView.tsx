import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useStore, type ContextMenuItem } from '../lib/store';
import { api, type TreeNode } from '../lib/api';
import { useIsMobile } from '../lib/useIsMobile';
import Icon from './Icon';
import Preview from './Preview';
import {
  parseCanvas,
  serializeCanvas,
  resolveColor,
  PRESET_COLORS,
  nodesBBox,
  sideAnchor,
  autoSides,
  edgePath,
  nearestSide,
  snapMove,
  type CanvasData,
  type CanvasNode,
  type CanvasEdge,
  type CanvasSide,
  type TextNode,
  type SnapGuide,
  type Rect,
} from '../lib/canvas';

type Sel = { nodes: Set<string>; edges: Set<string> };
const EMPTY_SEL: Sel = { nodes: new Set(), edges: new Set() };
type TextAlign = 'left' | 'center' | 'right';

const SIDES: CanvasSide[] = ['top', 'right', 'bottom', 'left'];
const IMG_RE = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i;
const MD_RE = /\.(md|markdown)$/i;
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
// Obsidian's object-snap distance is 15px at 100%; it grows as you zoom out.
const SNAP_BASE = 15;
/** Snapping is on by default; holding Alt (Ctrl on macOS) frees the drag. */
const snapEnabled = (e: { altKey: boolean; ctrlKey: boolean }) => (IS_MAC ? !e.ctrlKey : !e.altKey);

type Drag =
  | { mode: 'pan'; sx: number; sy: number; tx: number; ty: number; moved: boolean }
  | { mode: 'move'; cx: number; cy: number; orig: Map<string, { x: number; y: number }>; moved: boolean }
  | { mode: 'resize'; id: string; handle: string; rect0: { x: number; y: number; width: number; height: number }; cx: number; cy: number }
  | { mode: 'marquee'; cx: number; cy: number; additive: boolean }
  | { mode: 'connect'; fromNode: string; fromSide: CanvasSide }
  | { mode: 'reconnect'; edgeId: string; end: 'from' | 'to' }
  | null;

/** Markdown / image / link body rendered inside a file node. */
function FileNodeBody({ file }: { file: string }) {
  const languageRevision = useLanguage().revision;

  const [md, setMd] = useState<string | null>(null);
  const isImg = IMG_RE.test(file);
  const isMd = MD_RE.test(file);
  useEffect(() => {
    if (!isMd) return;
    let cancelled = false;
    api
      .read(file)
      .then((r) => !cancelled && setMd(typeof r === 'string' ? r : r.content))
      .catch(() => !cancelled && setMd(null));
    return () => {
      cancelled = true;
    };
  }, [file, isMd]);

  if (isImg) {
    return (
      <div className="canvas-file-img">
        <img src={api.rawUrl(file)} alt={file} draggable={false} />
      </div>
    );
  }
  const name = file.split('/').pop() ?? file;
  return (
    <div className="canvas-file-note">
      <div className="canvas-file-head">
        <Icon name="file-text" size={13} />
        <span className="title">{name.replace(MD_RE, '')}</span>
      </div>
      <div className="canvas-file-body markdown-preview">
        {isMd ? (md != null ? <Preview source={md} sourcePath={file} /> : <div className="canvas-loading">{uiText("webobsidian.loading-33ce41")}</div>) : (
          <div className="canvas-file-generic">
            <Icon name="file" size={28} />
            <span>{name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CanvasView() {
  const languageRevision = useLanguage().revision;

  const activePath = useStore((s) => s.activePath);
  const storeContent = useStore((s) => s.content);
  const setContent = useStore((s) => s.setContent);
  const save = useStore((s) => s.save);
  const openFile = useStore((s) => s.openFile);
  const tree = useStore((s) => s.tree);
  const notify = useStore((s) => s.notify);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const isMobile = useIsMobile();

  const [data, setData] = useState<CanvasData>(() => parseCanvas(storeContent));
  const [view, setView] = useState({ tx: 60, ty: 60, scale: 1 });
  const [sel, setSel] = useState<Sel>(EMPTY_SEL);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingEdge, setEditingEdge] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Alignment guide lines shown while dragging nodes (Obsidian's canvas-snaps).
  const [snap, setSnap] = useState<{ x: SnapGuide | null; y: SnapGuide | null } | null>(null);
  const [connectTo, setConnectTo] = useState<{ x: number; y: number; node: string | null; side?: CanvasSide } | null>(null);
  const [connecting, setConnecting] = useState(false); // dragging a connection → show all node anchors
  const [notePicker, setNotePicker] = useState(false);
  const [noteFilter, setNoteFilter] = useState('');
  const [showColors, setShowColors] = useState(false);
  const [showDir, setShowDir] = useState(false);
  // When an edge endpoint is dragged onto empty canvas: offer to create a node there.
  const [edgeDrop, setEdgeDrop] = useState<{ sx: number; sy: number; cx: number; cy: number; edgeId: string; end: 'from' | 'to' } | null>(null);
  // Right-click formatting menu while editing a text card.
  const [textMenu, setTextMenu] = useState<{ x: number; y: number } | null>(null);
  const editTaRef = useRef<HTMLTextAreaElement | null>(null);
  // "Add link" note-search dropdown (inserts a [[wikilink]] into the editing card).
  const [linkPicker, setLinkPicker] = useState<{ x: number; y: number } | null>(null);
  const [linkFilter, setLinkFilter] = useState('');
  const linkInsertPos = useRef<{ start: number; end: number } | null>(null);
  // Pending edge endpoint to attach to a note chosen from the picker.
  const pendingConnect = useRef<{ edgeId: string; end: 'from' | 'to'; cx: number; cy: number } | null>(null);
  const [histV, setHistV] = useState(0); // bump to re-render undo/redo button state

  const vpRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<Drag>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const space = useRef(false);
  const idSeed = useRef(0);
  const lastWritten = useRef(storeContent);
  const dataRef = useRef(data);
  dataRef.current = data;
  const viewRef = useRef(view);
  viewRef.current = view;
  const selRef = useRef(sel);
  selRef.current = sel; // always-current selection for menu/handler callbacks
  const editingNodeRef = useRef<string | null>(null);
  editingNodeRef.current = editingNode; // current edit target for blur/tap-outside commit
  const lastTap = useRef<{ id: string; t: number } | null>(null); // touch double-tap detector
  const fittedFor = useRef<string | null>(null); // canvas we've already zoom-fitted

  // Commit the text card currently being edited and exit edit mode. Idempotent:
  // multiple calls in the same tick (e.g. tap-outside + blur on desktop) no-op after
  // the first. The doc-level listener below makes saving reliable on Android Chrome,
  // where dismissing the soft keyboard often does NOT fire the textarea's blur event.
  const commitTextEdit = (raw?: string) => {
    const id = editingNodeRef.current;
    if (!id) return;
    const text = raw ?? editTaRef.current?.value ?? '';
    editingNodeRef.current = null; // guard re-entry before React re-renders
    updateNodes((x) => (x.id === id ? ({ ...x, text } as CanvasNode) : x));
    setTextMenu(null);
    setEditingNode(null);
  };

  // Type/file/link node activation (double-tap / double-click target action).
  const activateNode = (id: string) => {
    const n = dataRef.current.nodes.find((x) => x.id === id);
    if (!n) return;
    if (n.type === 'text') setEditingNode(id);
    else if (n.type === 'file') openFile((n as any).file);
    else if (n.type === 'link') window.open((n as any).url, '_blank', 'noopener');
  };

  const newId = () => {
    idSeed.current += 1;
    // 16 hex chars, time-seeded — round-trips through the JSON Canvas format.
    return (Date.now().toString(16) + Math.floor(Math.random() * 0xfffff).toString(16) + idSeed.current.toString(16))
      .replace(/[^0-9a-f]/g, '')
      .padEnd(16, '0')
      .slice(0, 16);
  };

  // Adopt external content (file switch / remote update) we didn't write ourselves.
  useEffect(() => {
    if (storeContent !== lastWritten.current) {
      setData(parseCanvas(storeContent));
      lastWritten.current = storeContent;
      setSel(EMPTY_SEL);
      setEditingNode(null);
      setEditingEdge(null);
    }
  }, [storeContent]);

  // Reset selection/history when opening a different canvas file. View is set by
  // the zoom-to-fit effect below (so a freshly opened canvas fits the viewport).
  useEffect(() => {
    setSel(EMPTY_SEL);
    undoStack.current = [];
    redoStack.current = [];
    fittedFor.current = null;
    setHistV((v) => v + 1);
  }, [activePath]);

  // Zoom-to-fit once per opened canvas (after its data is parsed + viewport sized).
  // Guard: do nothing until the canvas actually has nodes — otherwise the rAF could
  // fire before content loads, fit an empty bbox (→ 100%), and mark the canvas as
  // fitted so the real data (one tick later) never re-fits. We only mark `fittedFor`
  // after a real fit, so the effect re-runs (via the `data` dep) until nodes exist.
  useEffect(() => {
    if (!activePath || fittedFor.current === activePath) return;
    if (data.nodes.length === 0) return;
    const id = requestAnimationFrame(() => {
      if (!vpRef.current || !dataRef.current.nodes.length) return;
      fittedFor.current = activePath;
      zoomFit();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, data]);

  // Two-finger pinch-to-zoom + two-finger pan (touch). Capture-phase listeners run
  // before React's node/viewport handlers, so a second finger always starts a pinch
  // (cancelling any single-finger drag) regardless of what's under the fingers.
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const pts = new Map<number, { x: number; y: number }>();
    let start: { dist: number; cx: number; cy: number; tx: number; ty: number; scale: number } | null = null;
    const snapshot = () => {
      const a = [...pts.values()];
      const r = vp.getBoundingClientRect();
      const dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
      const cx = (a[0].x + a[1].x) / 2 - r.left;
      const cy = (a[0].y + a[1].y) / 2 - r.top;
      const v = viewRef.current;
      start = { dist, cx, cy, tx: v.tx, ty: v.ty, scale: v.scale };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        drag.current = null; // cancel any single-finger drag → pinch takes over
        setConnecting(false);
        e.stopPropagation();
        snapshot();
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (start && pts.size >= 2) {
        e.preventDefault();
        e.stopPropagation();
        const a = [...pts.values()];
        const r = vp.getBoundingClientRect();
        const dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
        const mx = (a[0].x + a[1].x) / 2 - r.left;
        const my = (a[0].y + a[1].y) / 2 - r.top;
        const scale = Math.min(4, Math.max(0.1, start.scale * (dist / start.dist)));
        const k = scale / start.scale;
        setView({ scale, tx: mx - (start.cx - start.tx) * k, ty: my - (start.cy - start.ty) * k });
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) start = null;
    };
    vp.addEventListener('pointerdown', down, { capture: true });
    vp.addEventListener('pointermove', move, { capture: true, passive: false });
    vp.addEventListener('pointerup', up, { capture: true });
    vp.addEventListener('pointercancel', up, { capture: true });
    return () => {
      vp.removeEventListener('pointerdown', down, { capture: true } as any);
      vp.removeEventListener('pointermove', move, { capture: true } as any);
      vp.removeEventListener('pointerup', up, { capture: true } as any);
      vp.removeEventListener('pointercancel', up, { capture: true } as any);
    };
  }, []);

  // Reliable "tap/click outside → save the editing card" for ALL platforms.
  // Android Chrome frequently does NOT fire a textarea blur when the soft keyboard is
  // dismissed, so editing was lost. A capture-phase document pointerdown commits the
  // card whenever the press lands outside the textarea and its helper menus/pickers.
  useEffect(() => {
    if (!editingNode) return;
    const onDocDown = (e: PointerEvent) => {
      const ta = editTaRef.current;
      const t = e.target as HTMLElement | null;
      if (!ta || !t) return;
      if (t === ta || ta.contains(t)) return; // inside the textarea — keep editing
      // Helper UIs that legitimately steal focus while editing must not commit.
      if (t.closest('.canvas-textmenu, .canvas-linkpicker, .canvas-notepicker')) return;
      commitTextEdit();
    };
    document.addEventListener('pointerdown', onDocDown, true);
    return () => document.removeEventListener('pointerdown', onDocDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingNode]);

  // Apply a canvas state to the store (marks dirty) WITHOUT touching history.
  const applyData = useCallback(
    (next: CanvasData) => {
      setData(next);
      const s = serializeCanvas(next);
      lastWritten.current = s;
      setContent(s);
    },
    [setContent, languageRevision],
  );

  // Commit a user edit: record the prior state for undo, then apply.
  const commit = useCallback(
    (next: CanvasData) => {
      undoStack.current.push(serializeCanvas(dataRef.current));
      if (undoStack.current.length > 200) undoStack.current.shift();
      redoStack.current = [];
      setHistV((v) => v + 1);
      applyData(next);
    },
    [applyData, languageRevision],
  );

  const undo = useCallback(() => {
    if (!undoStack.current.length) return;
    redoStack.current.push(serializeCanvas(dataRef.current));
    applyData(parseCanvas(undoStack.current.pop()!));
    setSel(EMPTY_SEL);
    setEditingNode(null);
    setEditingEdge(null);
    setHistV((v) => v + 1);
  }, [applyData, languageRevision]);

  const redo = useCallback(() => {
    if (!redoStack.current.length) return;
    undoStack.current.push(serializeCanvas(dataRef.current));
    applyData(parseCanvas(redoStack.current.pop()!));
    setSel(EMPTY_SEL);
    setEditingNode(null);
    setEditingEdge(null);
    setHistV((v) => v + 1);
  }, [applyData, languageRevision]);

  useEffect(() => {
    const id = window.setTimeout(() => { void save().catch(() => {}); }, 900);
    return () => window.clearTimeout(id);
  }, [data, save]);

  // Track spacebar (hold-to-pan) + delete/escape.
  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        // ⌘Z / ⌘⇧Z — undo / redo (only when the canvas is focused / not typing).
        if (isTyping(e.target)) return;
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        if (isTyping(e.target)) return;
        e.preventDefault();
        redo();
        return;
      }
      if (e.code === 'Space' && !isTyping(e.target)) {
        space.current = true;
        if (vpRef.current) vpRef.current.style.cursor = 'grab';
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping(e.target) && !editingNode) {
        deleteSelection();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        setEditingNode(null);
        setEditingEdge(null);
        setSel(EMPTY_SEL);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        space.current = false;
        if (vpRef.current) vpRef.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingNode, sel]);

  const toCanvas = (clientX: number, clientY: number) => {
    const r = vpRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.tx) / v.scale, y: (clientY - r.top - v.ty) / v.scale };
  };

  const nodeAt = (cx: number, cy: number): CanvasNode | null => {
    const ns = dataRef.current.nodes;
    // topmost first; groups are at the back so check non-groups first
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      if (n.type === 'group') continue;
      if (cx >= n.x && cx <= n.x + n.width && cy >= n.y && cy <= n.y + n.height) return n;
    }
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      if (n.type !== 'group') continue;
      if (cx >= n.x && cx <= n.x + n.width && cy >= n.y && cy <= n.y + n.height) return n;
    }
    return null;
  };

  // ---- Mutations -----------------------------------------------------------
  const updateNodes = (fn: (n: CanvasNode) => CanvasNode) =>
    commit({ ...dataRef.current, nodes: dataRef.current.nodes.map(fn) });

  const deleteSelection = () => {
    const d = dataRef.current;
    const s = selRef.current;
    if (!s.nodes.size && !s.edges.size) return;
    const nodes = d.nodes.filter((n) => !s.nodes.has(n.id));
    const edges = d.edges.filter(
      (e) => !s.edges.has(e.id) && !s.nodes.has(e.fromNode) && !s.nodes.has(e.toNode),
    );
    commit({ nodes, edges });
    setSel(EMPTY_SEL);
  };

  const setColor = (color: string | undefined) => {
    const d = dataRef.current;
    const s = selRef.current;
    const nodes = d.nodes.map((n) => (s.nodes.has(n.id) ? { ...n, color } : n));
    const edges = d.edges.map((e) => (s.edges.has(e.id) ? { ...e, color } : e));
    commit({ nodes, edges });
    setShowColors(false);
  };

  // Set the text alignment of the selected text card(s). While editing, keep the
  // textarea's current (uncommitted) value so the commit doesn't revert typing.
  const setTextAlign = (align: TextAlign) => {
    const editId = editingNodeRef.current;
    const curText = editId ? editTaRef.current?.value : undefined;
    const targets = new Set<string>(editId ? [editId] : selRef.current.nodes);
    if (!targets.size) return;
    commit({
      ...dataRef.current,
      nodes: dataRef.current.nodes.map((n) => {
        if (n.type !== 'text' || !targets.has(n.id)) return n;
        const next: TextNode = { ...n, textAlign: align };
        if (n.id === editId && curText != null) next.text = curText;
        return next;
      }),
    });
  };

  // Duplicate the selected nodes (+ edges fully within the selection) with an offset.
  const duplicateSelection = () => {
    const d = dataRef.current;
    const s = selRef.current;
    if (!s.nodes.size) return;
    const idMap = new Map<string, string>();
    const dups = d.nodes
      .filter((n) => s.nodes.has(n.id))
      .map((n) => { const id = newId(); idMap.set(n.id, id); return { ...n, id, x: n.x + 40, y: n.y + 40 }; });
    const dupEdges = d.edges
      .filter((e) => s.nodes.has(e.fromNode) && s.nodes.has(e.toNode))
      .map((e) => ({ ...e, id: newId(), fromNode: idMap.get(e.fromNode)!, toNode: idMap.get(e.toNode)! }));
    commit({ nodes: [...d.nodes, ...dups], edges: [...d.edges, ...dupEdges] });
    setSel({ nodes: new Set(dups.map((n) => n.id)), edges: new Set() });
  };

  // z-order = array order (later = on top). Move selection to front / back.
  const bringToFront = () => {
    const d = dataRef.current, s = selRef.current;
    commit({ ...d, nodes: [...d.nodes.filter((n) => !s.nodes.has(n.id)), ...d.nodes.filter((n) => s.nodes.has(n.id))] });
  };
  const sendToBack = () => {
    const d = dataRef.current, s = selRef.current;
    commit({ ...d, nodes: [...d.nodes.filter((n) => s.nodes.has(n.id)), ...d.nodes.filter((n) => !s.nodes.has(n.id))] });
  };

  // Align the selected nodes' edges/centers (multi-select).
  const alignSelection = (kind: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
    const d = dataRef.current, s = selRef.current;
    const ns = d.nodes.filter((n) => s.nodes.has(n.id));
    if (ns.length < 2) return;
    const minX = Math.min(...ns.map((n) => n.x)), maxX = Math.max(...ns.map((n) => n.x + n.width));
    const minY = Math.min(...ns.map((n) => n.y)), maxY = Math.max(...ns.map((n) => n.y + n.height));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const adj = (n: CanvasNode): Partial<CanvasNode> => {
      switch (kind) {
        case 'left': return { x: Math.round(minX) };
        case 'right': return { x: Math.round(maxX - n.width) };
        case 'hcenter': return { x: Math.round(cx - n.width / 2) };
        case 'top': return { y: Math.round(minY) };
        case 'bottom': return { y: Math.round(maxY - n.height) };
        case 'vcenter': return { y: Math.round(cy - n.height / 2) };
      }
    };
    commit({ ...d, nodes: d.nodes.map((n) => (s.nodes.has(n.id) ? { ...n, ...adj(n) } as CanvasNode : n)) });
  };

  // Right-click a node → Obsidian-style context menu with many actions.
  const openNodeMenu = (e: React.MouseEvent, node: CanvasNode) => {
    e.preventDefault();
    e.stopPropagation();
    // If the node isn't part of the current selection, select just it.
    let selNodes = selRef.current.nodes;
    if (!selNodes.has(node.id)) {
      selNodes = new Set([node.id]);
      setSel({ nodes: selNodes, edges: new Set() });
      selRef.current = { nodes: selNodes, edges: new Set() };
    }
    const multi = selNodes.size > 1;
    const colorNames: Record<string, string> = { '1': 'Red', '2': 'Orange', '3': 'Yellow', '4': 'Green', '5': 'Cyan', '6': 'Purple' };
    const colorSub: ContextMenuItem[] = [
      { get label() {return uiText("webobsidian.default-808d7d");}, onClick: () => setColor(undefined) },
      ...Object.keys(PRESET_COLORS).map((k) => ({ label: colorNames[k] ?? uiText("webobsidian.color-value0-e68c76", {value0: k}), onClick: () => setColor(k) })),
    ];
    const items: ContextMenuItem[] = [
      ...(node.type === 'text' ? [{ get label() {return uiText("interface.menu.edit");}, icon: 'pencil', onClick: () => setEditingNode(node.id) }] : []),
      ...(node.type === 'file' ? [{ get label() {return uiText("webobsidian.open-cf9b77");}, icon: 'arrow-up-right', onClick: () => openFile((node as any).file) }] : []),
      ...(node.type === 'link' ? [{ get label() {return uiText("webobsidian.open-link-d2de1a");}, icon: 'globe', onClick: () => window.open((node as any).url, '_blank', 'noopener') }] : []),
      { get label() {return uiText("plugins.canvas.action-set-color");}, icon: 'palette', submenu: colorSub },
      { get label() {return uiText("webobsidian.duplicate-972d57");}, icon: 'file-plus', onClick: duplicateSelection },
      { get label() {return uiText("plugins.canvas.action-zoom-to-selection");}, icon: 'zoom-in', onClick: zoomToSelection },
      { label: '', separator: true },
      { get label() {return uiText("webobsidian.bring-to-front-1f65ed");}, onClick: bringToFront },
      { get label() {return uiText("webobsidian.send-to-back-e259d4");}, onClick: sendToBack },
      ...(multi
        ? [{
            get label() {return uiText("plugins.canvas.action-align");}, icon: 'columns', submenu: [
              { get label() {return uiText("webobsidian.align-left-b442b4");}, onClick: () => alignSelection('left') },
              { get label() {return uiText("webobsidian.align-center-horizontally-0f49ab");}, onClick: () => alignSelection('hcenter') },
              { get label() {return uiText("webobsidian.align-right-9bb446");}, onClick: () => alignSelection('right') },
              { get label() {return uiText("plugins.canvas.action-align-top");}, onClick: () => alignSelection('top') },
              { get label() {return uiText("webobsidian.align-center-vertically-685eac");}, onClick: () => alignSelection('vcenter') },
              { get label() {return uiText("plugins.canvas.action-align-bottom");}, onClick: () => alignSelection('bottom') },
            ],
          }]
        : []),
      { label: '', separator: true },
      { get label() {return uiText("webobsidian.remove-e96390");}, icon: 'trash', danger: true, onClick: deleteSelection },
    ];
    openContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Set arrow direction on the selected edges (Obsidian's dropdown):
  // non = no arrows, uni = arrow at the `to` end, bi = arrows at both ends.
  const setEdgeDirection = (kind: 'non' | 'uni' | 'bi') => {
    const ends =
      kind === 'non' ? { fromEnd: 'none' as const, toEnd: 'none' as const }
      : kind === 'bi' ? { fromEnd: 'arrow' as const, toEnd: 'arrow' as const }
      : { fromEnd: 'none' as const, toEnd: 'arrow' as const };
    commit({
      ...dataRef.current,
      edges: dataRef.current.edges.map((e) => (selRef.current.edges.has(e.id) ? { ...e, ...ends } : e)),
    });
    setShowDir(false);
  };

  const removeEdgeLabel = () => {
    commit({
      ...dataRef.current,
      edges: dataRef.current.edges.map((e) => (selRef.current.edges.has(e.id) ? { ...e, label: undefined } : e)),
    });
  };

  // Wrap the current selection in the editing textarea with markdown markers.
  // (Buttons preventDefault on mousedown so the textarea keeps focus.)
  const applyFormat = (before: string, after = before, blockPrefix = false) => {
    const ta = editTaRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    if (blockPrefix) {
      // Insert prefix at the start of the line containing the caret.
      const lineStart = v.lastIndexOf('\n', s - 1) + 1;
      ta.value = v.slice(0, lineStart) + before + v.slice(lineStart);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = e + before.length;
    } else {
      const selected = v.slice(s, e);
      ta.value = v.slice(0, s) + before + selected + after + v.slice(e);
      ta.focus();
      ta.selectionStart = s + before.length;
      ta.selectionEnd = e + before.length + selected.length;
    }
  };

  // Toggle a symmetric inline marker (bold/italic/…) around the selection:
  // wraps if absent, unwraps if the markers are already inside or just outside it.
  const toggleWrap = (mark: string) => {
    const ta = editTaRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    const sel = v.slice(s, e);
    const m = mark.length;
    if (sel.length >= 2 * m && sel.startsWith(mark) && sel.endsWith(mark)) {
      const inner = sel.slice(m, sel.length - m);
      ta.value = v.slice(0, s) + inner + v.slice(e);
      ta.focus();
      ta.selectionStart = s; ta.selectionEnd = s + inner.length;
    } else if (v.slice(s - m, s) === mark && v.slice(e, e + m) === mark) {
      ta.value = v.slice(0, s - m) + sel + v.slice(e + m);
      ta.focus();
      ta.selectionStart = s - m; ta.selectionEnd = e - m;
    } else {
      ta.value = v.slice(0, s) + mark + sel + mark + v.slice(e);
      ta.focus();
      ta.selectionStart = s + m; ta.selectionEnd = e + m + sel.length;
    }
  };

  // Obsidian editor hotkeys, on the plain textarea (parity with the main editor's
  // obsidianKeymap): ⌘B bold · ⌘I italic · ⌘K add link · ⌘L task · ⌘/ comment.
  const onTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { (e.target as HTMLTextAreaElement).blur(); return; }
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); toggleWrap('**'); }
    else if (k === 'i') { e.preventDefault(); toggleWrap('*'); }
    else if (k === 'k') { e.preventDefault(); openLinkPicker(); }
    else if (k === 'l') { e.preventDefault(); setLinePrefix('- [ ] '); }
    else if (k === '/') { e.preventDefault(); toggleWrap('%%'); }
  };

  // Replace the block prefix (heading/list/quote) on the caret's line.
  const setLinePrefix = (prefix: string) => {
    const ta = editTaRef.current;
    if (!ta) return;
    const v = ta.value, s = ta.selectionStart;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = v.indexOf('\n', s);
    if (lineEnd < 0) lineEnd = v.length;
    let line = v.slice(lineStart, lineEnd);
    line = line.replace(/^(\s*)(#{1,6}\s+|>\s+|-\s\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+)/, '$1');
    const newLine = prefix + line;
    ta.value = v.slice(0, lineStart) + newLine + v.slice(lineEnd);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + (newLine.length - (lineEnd - lineStart));
  };

  // Insert text at the caret, replacing any selection.
  const insertAtCaret = (text: string) => {
    const ta = editTaRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    ta.value = v.slice(0, s) + text + v.slice(e);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + text.length;
  };

  // Strip inline markdown markers from the selection.
  const clearFormatting = () => {
    const ta = editTaRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    const sel = v.slice(s, e).replace(/(\*\*|__|~~|==|\*|_|`|\$|%%)/g, '');
    ta.value = v.slice(0, s) + sel + v.slice(e);
    ta.focus();
    ta.selectionStart = s; ta.selectionEnd = s + sel.length;
  };

  const doClipboard = (kind: 'cut' | 'copy') => { try { document.execCommand(kind); } catch { /* ignore */ } };
  const doPaste = async () => { try { insertAtCaret(await navigator.clipboard.readText()); } catch { /* ignore */ } };

  // "Add link" → open a note-search dropdown anchored at the caret.
  const openLinkPicker = () => {
    const ta = editTaRef.current;
    if (!ta) return;
    linkInsertPos.current = { start: ta.selectionStart, end: ta.selectionEnd };
    const r = ta.getBoundingClientRect();
    setLinkFilter('');
    setLinkPicker({ x: r.left, y: Math.min(r.bottom, window.innerHeight - 300) });
  };

  // Insert [[name]] at the saved caret and keep editing.
  const insertWikilink = (path: string, name: string) => {
    const ta = editTaRef.current;
    const pos = linkInsertPos.current;
    if (!ta || !pos) return;
    const base = name.replace(/\.md$/i, '');
    const link = `[[${base}]]`;
    ta.value = ta.value.slice(0, pos.start) + link + ta.value.slice(pos.end);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = pos.start + link.length;
    setLinkPicker(null);
    void path;
  };

  // Obsidian editor context-menu structure (mined from obsidian.asar i18n).
  const textMenuItems = (): FmtItem[] => [
    { get label() {return uiText("interface.formatting.insert-link");}, act: openLinkPicker },
    { get label() {return uiText("interface.formatting.insert-external-link");}, act: () => applyFormat('[', '](https://)') },
    { sep: true },
    { get label() {return uiText("interface.formatting.label-formatting");}, sub: [
      { get label() {return uiText("webobsidian.bold-19e074");}, act: () => toggleWrap('**') },
      { get label() {return uiText("interface.formatting.toggle-italics");}, act: () => toggleWrap('*') },
      { get label() {return uiText("webobsidian.strikethrough-a93b9a");}, act: () => toggleWrap('~~') },
      { get label() {return uiText("webobsidian.highlight-e1da92");}, act: () => toggleWrap('==') },
      { get label() {return uiText("webobsidian.code-adac69");}, act: () => toggleWrap('`') },
      { get label() {return uiText("webobsidian.math-3edf0d");}, act: () => toggleWrap('$') },
      { get label() {return uiText("webobsidian.comment-153d7a");}, act: () => toggleWrap('%%') },
      { sep: true },
      { get label() {return uiText("webobsidian.clear-formatting-6c8a26");}, act: clearFormatting },
    ] },
    { get label() {return uiText("interface.formatting.label-paragraph");}, sub: [
      { get label() {return uiText("interface.formatting.toggle-bullet-list");}, act: () => setLinePrefix('- ') },
      { get label() {return uiText("interface.formatting.toggle-numbered-list");}, act: () => setLinePrefix('1. ') },
      { get label() {return uiText("interface.formatting.toggle-checklist");}, act: () => setLinePrefix('- [ ] ') },
      { sep: true },
      ...[1, 2, 3, 4, 5, 6].map((l) => ({ get label() {return uiText("webobsidian.heading-value0-390a28", {value0: l});}, act: () => setLinePrefix('#'.repeat(l) + ' ') })),
      { get label() {return uiText("webobsidian.body-718a7e");}, act: () => setLinePrefix('') },
      { sep: true },
      { get label() {return uiText("webobsidian.quote-309028");}, act: () => setLinePrefix('> ') },
    ] },
    { get label() {return uiText("plugins.canvas.action-align");}, sub: [
      { get label() {return uiText("webobsidian.align-left-b442b4");}, act: () => setTextAlign('left') },
      { get label() {return uiText("webobsidian.align-center-97b689");}, act: () => setTextAlign('center') },
      { get label() {return uiText("webobsidian.align-right-9bb446");}, act: () => setTextAlign('right') },
    ] },
    { get label() {return uiText("interface.formatting.label-insert");}, sub: [
      { get label() {return uiText("webobsidian.table-0424f6");}, act: () => insertAtCaret('\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n') },
      { get label() {return uiText("webobsidian.callout-f1647a");}, act: () => insertAtCaret('> [!note]\n> ') },
      { get label() {return uiText("interface.formatting.insert-code-block");}, act: () => applyFormat('```\n', '\n```') },
      { get label() {return uiText("interface.formatting.insert-math-block");}, act: () => applyFormat('$$\n', '\n$$') },
      { get label() {return uiText("interface.formatting.insert-horizontal-rule");}, act: () => insertAtCaret('\n\n---\n\n') },
      { get label() {return uiText("webobsidian.footnote-40e31a");}, act: () => insertAtCaret('[^1]') },
    ] },
    { sep: true },
    { get label() {return uiText("interface.menu.cut");}, act: () => doClipboard('cut') },
    { get label() {return uiText("interface.menu.copy");}, act: () => doClipboard('copy') },
    { get label() {return uiText("interface.menu.paste");}, act: () => { void doPaste(); } },
    { get label() {return uiText("webobsidian.select-all-913aff");}, act: () => editTaRef.current?.select() },
  ];

  const addTextNode = (cx: number, cy: number) => {
    const node: TextNode = {
      id: newId(),
      type: 'text',
      text: '',
      x: Math.round(cx - 125),
      y: Math.round(cy - 30),
      width: 250,
      height: 60,
    };
    commit({ ...dataRef.current, nodes: [...dataRef.current.nodes, node] });
    setSel({ nodes: new Set([node.id]), edges: new Set() });
    setEditingNode(node.id);
  };

  /** Canvas coords at the center of the visible viewport. */
  const viewCenter = () => {
    const r = vpRef.current!.getBoundingClientRect();
    return { x: (r.width / 2 - view.tx) / view.scale, y: (r.height / 2 - view.ty) / view.scale };
  };

  /** Drop a file node (note embed or image) at a canvas point. */
  const addFileNode = (file: string, cx: number, cy: number) => {
    const isImg = IMG_RE.test(file);
    const node: CanvasNode = {
      id: newId(),
      type: 'file',
      file,
      x: Math.round(cx - (isImg ? 150 : 200)),
      y: Math.round(cy - (isImg ? 100 : 130)),
      width: isImg ? 300 : 400,
      height: isImg ? 200 : 260,
    };
    commit({ ...dataRef.current, nodes: [...dataRef.current.nodes, node] });
    setSel({ nodes: new Set([node.id]), edges: new Set() });
  };

  /** Attach an edge endpoint to a freshly created node, side facing the fixed end. */
  const attachEnd = (edges: CanvasEdge[], nodes: CanvasNode[], edgeId: string, end: 'from' | 'to', newId2: string) => {
    const ed = edges.find((x) => x.id === edgeId);
    const fixedId = ed ? (end === 'from' ? ed.toNode : ed.fromNode) : null;
    const fixed = nodes.find((n) => n.id === fixedId);
    const target = nodes.find((n) => n.id === newId2)!;
    const side = fixed ? nearestSide(target, centerOf(fixed).x, centerOf(fixed).y) : 'left';
    return edges.map((x) =>
      x.id === edgeId
        ? end === 'from'
          ? { ...x, fromNode: newId2, fromSide: side }
          : { ...x, toNode: newId2, toSide: side }
        : x,
    );
  };

  /** Drop a new text card at (cx,cy) and connect the dragged edge end to it. */
  const addConnectedTextNode = (cx: number, cy: number, edgeId: string, end: 'from' | 'to') => {
    const node: TextNode = { id: newId(), type: 'text', text: '', x: Math.round(cx - 125), y: Math.round(cy - 30), width: 250, height: 60 };
    const nodes = [...dataRef.current.nodes, node];
    const edges = attachEnd(dataRef.current.edges, nodes, edgeId, end, node.id);
    commit({ nodes, edges });
    setSel({ nodes: new Set([node.id]), edges: new Set() });
    setEditingNode(node.id);
  };

  /** Drop a file node at (cx,cy) and connect the dragged edge end to it. */
  const addConnectedFileNode = (file: string, cx: number, cy: number, edgeId: string, end: 'from' | 'to') => {
    const isImg = IMG_RE.test(file);
    const node: CanvasNode = { id: newId(), type: 'file', file, x: Math.round(cx - (isImg ? 150 : 200)), y: Math.round(cy - (isImg ? 100 : 130)), width: isImg ? 300 : 400, height: isImg ? 200 : 260 };
    const nodes = [...dataRef.current.nodes, node];
    const edges = attachEnd(dataRef.current.edges, nodes, edgeId, end, node.id);
    commit({ nodes, edges });
    setSel({ nodes: new Set([node.id]), edges: new Set() });
  };

  // Compute a resized rect from a resize drag + current canvas point (used by move + up).
  const resizeRect = (dr: { handle: string; rect0: { x: number; y: number; width: number; height: number }; cx: number; cy: number }, c: { x: number; y: number }) => {
    const dx = c.x - dr.cx, dy = c.y - dr.cy;
    const r = { ...dr.rect0 };
    const minW = 60, minH = 40;
    if (dr.handle.includes('e')) r.width = Math.max(minW, dr.rect0.width + dx);
    if (dr.handle.includes('s')) r.height = Math.max(minH, dr.rect0.height + dy);
    if (dr.handle.includes('w')) { const w = Math.max(minW, dr.rect0.width - dx); r.x = dr.rect0.x + (dr.rect0.width - w); r.width = w; }
    if (dr.handle.includes('n')) { const h = Math.max(minH, dr.rect0.height - dy); r.y = dr.rect0.y + (dr.rect0.height - h); r.height = h; }
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  };

  const onImagePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const { path } = await api.upload(f, undefined, activePath ?? '');
      const c = viewCenter();
      addFileNode(path, c.x, c.y);
      notify(uiText("webobsidian.inserted-value0-dac12f", {value0: path}));
    } catch (err: any) {
      notify(err?.message ?? uiText("webobsidian.upload-failed-ad0d06"));
    }
  };

  const noteList = useMemo(() => flattenFiles(tree), [tree, languageRevision]);
  const filteredNotes = useMemo(() => {
    const q = noteFilter.trim().toLowerCase();
    const list = q ? noteList.filter((f) => f.path.toLowerCase().includes(q)) : noteList;
    return list.slice(0, 50);
  }, [noteList, noteFilter, languageRevision]);

  const filteredLinks = useMemo(() => {
    const q = linkFilter.trim().toLowerCase();
    const list = q ? noteList.filter((f) => f.path.toLowerCase().includes(q)) : noteList;
    return list.slice(0, 50);
  }, [noteList, linkFilter, languageRevision]);

  // ---- Pointer handling on the viewport ------------------------------------
  const onViewportPointerDown = (e: React.PointerEvent) => {
    // Middle- or right-drag pans from anywhere (Obsidian parity), even over a node.
    if (e.button === 1 || e.button === 2) {
      try { vpRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty, moved: false };
      if (vpRef.current) vpRef.current.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.canvas-node, .canvas-handle, .canvas-port, .canvas-edge-hit, .canvas-edge-endpoint, .canvas-toolbar, .canvas-menu, .canvas-notepicker, .canvas-dropmenu, .canvas-textmenu, .canvas-edge-label')) {
      return; // handled by the element's own onPointerDown
    }
    if (edgeDrop) setEdgeDrop(null);
    if (textMenu) setTextMenu(null);
    if (linkPicker) {
      // Dismiss the link dropdown → commit the card and finish editing.
      setLinkPicker(null);
      commitTextEdit();
    }
    try { vpRef.current?.setPointerCapture(e.pointerId); } catch { /* synthetic/inactive pointer */ }
    // Plain left-drag on empty canvas = PAN (per user preference); Shift+drag (mouse)
    // = marquee select. Pan also via Space-drag and middle/right-drag (handled above);
    // a single finger pans on touch (two fingers pinch/zoom).
    if (e.shiftKey && !space.current && e.pointerType !== 'touch') {
      const c = toCanvas(e.clientX, e.clientY);
      drag.current = { mode: 'marquee', cx: c.x, cy: c.y, additive: true };
    } else {
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty, moved: false };
      if (vpRef.current && e.pointerType !== 'touch') vpRef.current.style.cursor = 'grabbing';
    }
  };

  const beginNodeDrag = (e: React.PointerEvent, id: string) => {
    // Let clicks on internal links / anchors follow through (don't start a drag,
    // which would capture the pointer and swallow the click). Viewport pan is
    // still suppressed because the target is inside .canvas-node.
    if ((e.target as HTMLElement).closest('[data-wikilink], a')) return;
    // Let middle/right buttons bubble to the viewport so a pan can start over a node.
    if (e.button !== 0) return;
    e.stopPropagation();
    // Touch double-tap → activate (edit text / open file / open link). Android Chrome
    // does not reliably synthesize dblclick from two taps, so detect it ourselves.
    if (e.pointerType === 'touch') {
      const last = lastTap.current;
      if (last && last.id === id && e.timeStamp - last.t < 350) {
        lastTap.current = null;
        activateNode(id);
        return;
      }
      lastTap.current = { id, t: e.timeStamp };
    }
    // NOTE: do NOT setPointerCapture here — capturing on pointerdown retargets the
    // subsequent click/dblclick to the viewport, which would break double-click-to-edit.
    // We capture lazily on the first real move (see onViewportPointerMove 'move').
    if (space.current) {
      try { vpRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty, moved: false };
      return;
    }
    // selection logic
    let nextNodes: Set<string>;
    if (e.shiftKey) {
      nextNodes = new Set(sel.nodes);
      nextNodes.has(id) ? nextNodes.delete(id) : nextNodes.add(id);
    } else if (sel.nodes.has(id)) {
      nextNodes = sel.nodes;
    } else {
      nextNodes = new Set([id]);
    }
    const nextSel = { nodes: nextNodes, edges: e.shiftKey ? sel.edges : new Set<string>() };
    setSel(nextSel);
    const orig = new Map<string, { x: number; y: number }>();
    for (const n of dataRef.current.nodes) if (nextNodes.has(n.id)) orig.set(n.id, { x: n.x, y: n.y });
    const c = toCanvas(e.clientX, e.clientY);
    drag.current = { mode: 'move', cx: c.x, cy: c.y, orig, moved: false };
  };

  const beginResize = (e: React.PointerEvent, id: string, handle: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    try { vpRef.current?.setPointerCapture(e.pointerId); } catch { /* synthetic/inactive pointer */ }
    const n = dataRef.current.nodes.find((x) => x.id === id);
    if (!n) return;
    const c = toCanvas(e.clientX, e.clientY);
    drag.current = { mode: 'resize', id, handle, rect0: { x: n.x, y: n.y, width: n.width, height: n.height }, cx: c.x, cy: c.y };
  };

  const beginConnect = (e: React.PointerEvent, id: string, side: CanvasSide) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    try { vpRef.current?.setPointerCapture(e.pointerId); } catch { /* synthetic/inactive pointer */ }
    drag.current = { mode: 'connect', fromNode: id, fromSide: side };
    const c = toCanvas(e.clientX, e.clientY);
    setConnectTo({ x: c.x, y: c.y, node: null });
    setConnecting(true);
  };

  // Grab an existing edge's endpoint and drag it out (reconnect / extend), like Obsidian.
  const beginReconnect = (e: React.PointerEvent, edgeId: string, end: 'from' | 'to') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    try { vpRef.current?.setPointerCapture(e.pointerId); } catch { /* synthetic/inactive pointer */ }
    drag.current = { mode: 'reconnect', edgeId, end };
    const c = toCanvas(e.clientX, e.clientY);
    setConnectTo({ x: c.x, y: c.y, node: null });
    setConnecting(true);
  };

  /** The node id at the OTHER end of an edge (the one that stays fixed). */
  const fixedEndNode = (edgeId: string, end: 'from' | 'to') => {
    const ed = dataRef.current.edges.find((x) => x.id === edgeId);
    return ed ? (end === 'from' ? ed.toNode : ed.fromNode) : null;
  };

  const onViewportPointerMove = (e: React.PointerEvent) => {
    const dr = drag.current;
    if (!dr) return;
    if (dr.mode === 'pan') {
      const ddx = e.clientX - dr.sx, ddy = e.clientY - dr.sy;
      if (Math.abs(ddx) > 2 || Math.abs(ddy) > 2) dr.moved = true;
      setView((v) => ({ ...v, tx: dr.tx + ddx, ty: dr.ty + ddy }));
      return;
    }
    const c = toCanvas(e.clientX, e.clientY);
    if (dr.mode === 'move') {
      let dx = c.x - dr.cx;
      let dy = c.y - dr.cy;
      // Shift while moving locks to the dominant axis (Obsidian parity).
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        // Capture on the first real move so the drag survives the cursor leaving a
        // node — but NOT on pointerdown, so a plain click/dblclick still targets the node.
        if (!dr.moved) { try { vpRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
        dr.moved = true;
      }
      // Alignment snapping: line the moving rects' edges/centers up with the other
      // nodes, and draw guide lines (skipped while Alt/Ctrl frees the drag).
      let gx: SnapGuide | null = null, gy: SnapGuide | null = null;
      if (dr.moved && snapEnabled(e)) {
        const moving: Rect[] = [];
        const statics: Rect[] = [];
        for (const n of dataRef.current.nodes) {
          const o = dr.orig.get(n.id);
          if (o) moving.push({ x: o.x + dx, y: o.y + dy, width: n.width, height: n.height });
          else if (n.type !== 'group') statics.push({ x: n.x, y: n.y, width: n.width, height: n.height });
        }
        const dist = Math.ceil(SNAP_BASE / viewRef.current.scale);
        const s = snapMove(moving, statics, dist);
        dx += s.dx; dy += s.dy; gx = s.x; gy = s.y;
      }
      setSnap(gx || gy ? { x: gx, y: gy } : null);
      setData((d) => ({
        ...d,
        nodes: d.nodes.map((n) => {
          const o = dr.orig.get(n.id);
          return o ? { ...n, x: Math.round(o.x + dx), y: Math.round(o.y + dy) } : n;
        }),
      }));
    } else if (dr.mode === 'resize') {
      const r = resizeRect(dr, c);
      setData((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === dr.id ? { ...n, ...r } : n)) }));
    } else if (dr.mode === 'marquee') {
      setMarquee({
        x: Math.min(dr.cx, c.x),
        y: Math.min(dr.cy, c.y),
        w: Math.abs(c.x - dr.cx),
        h: Math.abs(c.y - dr.cy),
      });
    } else if (dr.mode === 'connect') {
      const over = nodeAt(c.x, c.y);
      const node = over && over.id !== dr.fromNode ? over.id : null;
      setConnectTo({ x: c.x, y: c.y, node, side: node ? nearestSide(over!, c.x, c.y) : undefined });
    } else if (dr.mode === 'reconnect') {
      const over = nodeAt(c.x, c.y);
      const fixed = fixedEndNode(dr.edgeId, dr.end);
      const node = over && over.id !== fixed ? over.id : null;
      setConnectTo({ x: c.x, y: c.y, node, side: node ? nearestSide(over!, c.x, c.y) : undefined });
    }
  };

  const onViewportPointerUp = (e: React.PointerEvent) => {
    const dr = drag.current;
    drag.current = null;
    setSnap(null); // drop any alignment guides
    try { vpRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (vpRef.current) vpRef.current.style.cursor = space.current ? 'grab' : '';
    if (!dr) return;
    if (dr.mode === 'pan') {
      // A click on empty canvas (no real drag) clears the selection.
      if (!dr.moved) {
        setSel(EMPTY_SEL);
        setEditingNode(null);
        setEditingEdge(null);
        if (notePicker) setNotePicker(false);
      }
    } else if (dr.mode === 'move' && dr.moved) {
      commit(dataRef.current); // persist new positions
    } else if (dr.mode === 'resize') {
      // Commit the freshly-computed rect (don't rely on possibly-stale dataRef).
      const c = toCanvas(e.clientX, e.clientY);
      const r = resizeRect(dr, c);
      commit({ ...dataRef.current, nodes: dataRef.current.nodes.map((n) => (n.id === dr.id ? { ...n, ...r } : n)) });
    } else if (dr.mode === 'marquee') {
      const m = marquee;
      setMarquee(null);
      if (!m || (m.w < 3 && m.h < 3)) {
        // A plain left-click on empty canvas (no drag) clears the selection.
        if (!dr.additive) {
          setSel(EMPTY_SEL);
          setEditingNode(null);
          setEditingEdge(null);
          if (notePicker) setNotePicker(false);
        }
        return;
      }
      const hit = dataRef.current.nodes.filter(
        (n) => n.x < m.x + m.w && n.x + n.width > m.x && n.y < m.y + m.h && n.y + n.height > m.y,
      );
      setSel((prev) => {
        const nodes = dr.additive ? new Set(prev.nodes) : new Set<string>();
        hit.forEach((n) => nodes.add(n.id));
        return { nodes, edges: dr.additive ? prev.edges : new Set() };
      });
    } else if (dr.mode === 'connect') {
      setConnectTo(null);
      setConnecting(false);
      // Compute the drop target from the event directly (React state lags one frame).
      const c = toCanvas(e.clientX, e.clientY);
      const over = nodeAt(c.x, c.y);
      if (over && over.id !== dr.fromNode) {
        const toSide = nearestSide(over, c.x, c.y); // snap to the anchor nearest the cursor
        const edge: CanvasEdge = {
          id: newId(),
          fromNode: dr.fromNode,
          fromSide: dr.fromSide,
          toNode: over.id,
          toSide,
          toEnd: 'arrow',
        };
        commit({ ...dataRef.current, edges: [...dataRef.current.edges, edge] });
        setSel({ nodes: new Set(), edges: new Set([edge.id]) });
      }
    } else if (dr.mode === 'reconnect') {
      setConnectTo(null);
      setConnecting(false);
      const c = toCanvas(e.clientX, e.clientY);
      const over = nodeAt(c.x, c.y);
      const fixed = fixedEndNode(dr.edgeId, dr.end);
      if (over && over.id !== fixed) {
        const side = nearestSide(over, c.x, c.y);
        commit({
          ...dataRef.current,
          edges: dataRef.current.edges.map((ed) =>
            ed.id === dr.edgeId
              ? dr.end === 'from'
                ? { ...ed, fromNode: over.id, fromSide: side }
                : { ...ed, toNode: over.id, toSide: side }
              : ed,
          ),
        });
        setSel({ nodes: new Set(), edges: new Set([dr.edgeId]) });
      } else {
        // Dropped on empty canvas → offer to create a node here, connected.
        setEdgeDrop({ sx: e.clientX, sy: e.clientY, cx: c.x, cy: c.y, edgeId: dr.edgeId, end: dr.end });
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    // Plain wheel zooms toward the cursor, like Obsidian Canvas.
    const r = vpRef.current!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    setView((v) => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const scale = Math.min(4, Math.max(0.1, v.scale * factor));
      const k = scale / v.scale;
      return { scale, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
    });
  };

  const zoomBy = (factor: number) => {
    const r = vpRef.current!.getBoundingClientRect();
    const px = r.width / 2, py = r.height / 2;
    setView((v) => {
      const scale = Math.min(4, Math.max(0.1, v.scale * factor));
      const k = scale / v.scale;
      return { scale, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
    });
  };

  const zoomFit = () => {
    const bb = nodesBBox(dataRef.current.nodes);
    const r = vpRef.current!.getBoundingClientRect();
    if (!bb) {
      setView({ tx: r.width / 2, ty: r.height / 2, scale: 1 });
      return;
    }
    const pad = 80;
    const scale = Math.max(0.1, Math.min((r.width - pad) / bb.width, (r.height - pad) / bb.height, 1));
    const tx = r.width / 2 - (bb.x + bb.width / 2) * scale;
    const ty = r.height / 2 - (bb.y + bb.height / 2) * scale;
    setView({ tx, ty, scale });
  };

  const resetZoom = () => {
    const r = vpRef.current!.getBoundingClientRect();
    setView((v) => {
      const px = r.width / 2, py = r.height / 2;
      const k = 1 / v.scale;
      return { scale: 1, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
    });
  };

  /** Canvas-space bbox of the current selection (selected nodes + edge endpoints). */
  const selectionBBox = () => {
    const d = dataRef.current;
    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
    const add = (x: number, y: number, w = 0, h = 0) => {
      any = true;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    };
    d.nodes.forEach((n) => sel.nodes.has(n.id) && add(n.x, n.y, n.width, n.height));
    d.edges.forEach((e) => {
      if (!sel.edges.has(e.id)) return;
      const a = byId.get(e.fromNode), b = byId.get(e.toNode);
      if (!a || !b) return;
      const sides = e.fromSide && e.toSide ? { from: e.fromSide, to: e.toSide } : autoSides(a, b);
      const p1 = sideAnchor(a, e.fromSide ?? sides.from);
      const p2 = sideAnchor(b, e.toSide ?? sides.to);
      add(p1.x, p1.y); add(p2.x, p2.y);
    });
    return any ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
  };

  const zoomToSelection = () => {
    const bb = selectionBBox();
    const r = vpRef.current!.getBoundingClientRect();
    if (!bb) return;
    const pad = 120;
    const scale = Math.min(2, Math.max(0.1, Math.min((r.width - pad) / Math.max(bb.width, 1), (r.height - pad) / Math.max(bb.height, 1))));
    setView({
      scale,
      tx: r.width / 2 - (bb.x + bb.width / 2) * scale,
      ty: r.height / 2 - (bb.y + bb.height / 2) * scale,
    });
  };

  const onBackgroundDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.canvas-node, .canvas-toolbar, .canvas-menu, .canvas-notepicker')) return;
    const c = toCanvas(e.clientX, e.clientY);
    addTextNode(c.x, c.y);
  };

  // Accept note/image drops from the file tree (it sets text/wo-path to the path).
  const onDrop = (e: React.DragEvent) => {
    const path =
      e.dataTransfer.getData('text/wo-path') ||
      e.dataTransfer.getData('text/plain') ||
      e.dataTransfer.getData('text/uri-list');
    if (!path) return;
    e.preventDefault();
    const c = toCanvas(e.clientX, e.clientY);
    const isImg = IMG_RE.test(path);
    const node: CanvasNode = {
      id: newId(),
      type: 'file',
      file: path,
      x: Math.round(c.x - (isImg ? 150 : 200)),
      y: Math.round(c.y - (isImg ? 100 : 130)),
      width: isImg ? 300 : 400,
      height: isImg ? 200 : 260,
    };
    commit({ ...dataRef.current, nodes: [...dataRef.current.nodes, node] });
    setSel({ nodes: new Set([node.id]), edges: new Set() });
  };

  // ---- Render --------------------------------------------------------------
  const worldStyle: React.CSSProperties = {
    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
    transformOrigin: '0 0',
  };
  const gridStyle: React.CSSProperties = {
    backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
    backgroundPosition: `${view.tx}px ${view.ty}px`,
  };

  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));

  const selBBoxScreen = (() => {
    const bb = selectionBBox();
    if (!bb) return null;
    return { left: bb.x * view.scale + view.tx, top: bb.y * view.scale + view.ty, width: bb.width * view.scale };
  })();
  const onlyEdges = sel.edges.size > 0 && sel.nodes.size === 0;
  const selEdgeHasLabel = onlyEdges && data.edges.some((e) => sel.edges.has(e.id) && e.label);
  // Native Edit action applies to a single selected text card.
  const singleTextNode = sel.nodes.size === 1 && sel.edges.size === 0
    ? data.nodes.find((n) => sel.nodes.has(n.id) && n.type === 'text')
    : undefined;
  // Current color of the selection (first selected node/edge) → highlight its swatch.
  const selColor: string | undefined = (() => {
    const n = data.nodes.find((x) => sel.nodes.has(x.id));
    if (n) return n.color;
    const e = data.edges.find((x) => sel.edges.has(x.id));
    return e?.color;
  })();
  const isCustomColor = !!selColor && selColor.startsWith('#');
  const curDir: 'non' | 'uni' | 'bi' = (() => {
    const e = data.edges.find((x) => sel.edges.has(x.id));
    if (!e) return 'uni';
    const f = e.fromEnd ?? 'none', t = e.toEnd ?? 'arrow';
    if (f === 'arrow' && t === 'arrow') return 'bi';
    if (f === 'none' && t === 'none') return 'non';
    return 'uni';
  })();

  return (
    <div
      className="canvas-view"
      ref={vpRef}
      style={gridStyle}
      onPointerDown={onViewportPointerDown}
      onPointerMove={onViewportPointerMove}
      onPointerUp={onViewportPointerUp}
      onWheel={onWheel}
      onDoubleClick={onBackgroundDoubleClick}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="canvas-world" style={worldStyle}>
        {/* Group nodes (behind everything) */}
        {data.nodes.filter((n) => n.type === 'group').map((n) => {
          const col = resolveColor(n.color);
          return (
            <div
              key={n.id}
              className={`canvas-node canvas-group ${sel.nodes.has(n.id) ? 'selected' : ''}`}
              style={{ left: n.x, top: n.y, width: n.width, height: n.height, '--c': col ?? 'var(--text-faint)' } as React.CSSProperties}
              onPointerDown={(e) => beginNodeDrag(e, n.id)}
              onPointerEnter={() => setHoverNode(n.id)}
              onPointerLeave={() => setHoverNode((h) => (h === n.id ? null : h))}
              onContextMenu={(e) => openNodeMenu(e, n)}
            >
              <div className="canvas-group-label">{(n as any).label ?? uiText("plugins.bases.label-group")}</div>
              {renderHandlesAndPorts(n, sel.nodes.has(n.id), hoverNode === n.id || sel.nodes.has(n.id))}
            </div>
          );
        })}

        {/* Edges */}
        <svg className="canvas-edges" style={{ overflow: 'visible', position: 'absolute', left: 0, top: 0, width: 1, height: 1 }}>
          <defs>
            {/* auto-start-reverse → the `from` arrowhead points outward (back toward
                its node) and sits ON the line instead of hidden under the node. */}
            <marker id="cv-arrow" markerWidth="14" markerHeight="14" refX="10.4" refY="6.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse" overflow="visible">
              <path d="M0,0 L10.4,6.5 L0,13 Z" fill="context-stroke" stroke="context-stroke" strokeWidth="1" strokeLinejoin="round" />
            </marker>
          </defs>
          {data.edges.map((edge) => {
            const a = nodeById.get(edge.fromNode);
            const b = nodeById.get(edge.toNode);
            if (!a || !b) return null;
            const sides = edge.fromSide && edge.toSide
              ? { from: edge.fromSide, to: edge.toSide }
              : autoSides(a, b);
            const from = sideAnchor(a, edge.fromSide ?? sides.from);
            const to = sideAnchor(b, edge.toSide ?? sides.to);
            const { d, mid } = edgePath(from, edge.fromSide ?? sides.from, to, edge.toSide ?? sides.to);
            const col = resolveColor(edge.color) ?? 'var(--canvas-edge, #888)';
            const selected = sel.edges.has(edge.id);
            return (
              <g key={edge.id} style={{ color: col }}>
                <path
                  className="canvas-edge-hit"
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16 / view.scale}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSel({ nodes: new Set(), edges: new Set([edge.id]) });
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingEdge(edge.id);
                  }}
                />
                <path
                  className={`canvas-edge ${selected ? 'selected' : ''}`}
                  d={d}
                  fill="none"
                  stroke={col}
                  strokeWidth={(selected ? 3 : 2) / view.scale}
                  markerEnd={(edge.toEnd ?? 'arrow') === 'arrow' ? 'url(#cv-arrow)' : undefined}
                  markerStart={edge.fromEnd === 'arrow' ? 'url(#cv-arrow)' : undefined}
                />
                {selected && (
                  <>
                    <circle
                      className="canvas-edge-endpoint"
                      cx={from.x} cy={from.y} r={6 / view.scale}
                      onPointerDown={(e) => beginReconnect(e, edge.id, 'from')}
                    />
                    <circle
                      className="canvas-edge-endpoint"
                      cx={to.x} cy={to.y} r={6 / view.scale}
                      onPointerDown={(e) => beginReconnect(e, edge.id, 'to')}
                    />
                  </>
                )}
                {edge.label && editingEdge !== edge.id && (
                  <foreignObject x={mid.x - 100} y={mid.y - 16} width={200} height={32} style={{ overflow: 'visible' }}>
                    <div className="canvas-edge-label-wrap">
                      <div
                        className="canvas-edge-label"
                        onPointerDown={(e) => { e.stopPropagation(); setSel({ nodes: new Set(), edges: new Set([edge.id]) }); }}
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingEdge(edge.id); }}
                      >
                        {edge.label}
                      </div>
                    </div>
                  </foreignObject>
                )}
                {editingEdge === edge.id && (
                  <foreignObject x={mid.x - 100} y={mid.y - 16} width={200} height={32} style={{ overflow: 'visible' }}>
                    <div className="canvas-edge-label-wrap">
                    <input
                      className="canvas-edge-input"
                      autoFocus
                      defaultValue={edge.label ?? ''}
                      onPointerDown={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const label = e.target.value.trim();
                        commit({
                          ...dataRef.current,
                          edges: dataRef.current.edges.map((x) => (x.id === edge.id ? { ...x, label: label || undefined } : x)),
                        });
                        setEditingEdge(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingEdge(null);
                      }}
                    />
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
          {/* connect / reconnect preview */}
          {connectTo && drag.current?.mode === 'connect' && (() => {
            const a = nodeById.get((drag.current as any).fromNode);
            if (!a) return null;
            const from = sideAnchor(a, (drag.current as any).fromSide);
            // Snap the preview end to the target node's nearest anchor.
            const to = connectTo.node && connectTo.side
              ? sideAnchor(nodeById.get(connectTo.node)!, connectTo.side)
              : connectTo;
            return <path d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} fill="none" stroke="var(--interactive-accent, #7b6cff)" strokeWidth={2 / view.scale} strokeDasharray={`${6 / view.scale}`} />;
          })()}
          {connectTo && drag.current?.mode === 'reconnect' && (() => {
            const dr = drag.current as any;
            const fixedId = fixedEndNode(dr.edgeId, dr.end);
            const a = fixedId ? nodeById.get(fixedId) : null;
            if (!a) return null;
            const from = centerOf(a);
            const to = connectTo.node && connectTo.side
              ? sideAnchor(nodeById.get(connectTo.node)!, connectTo.side)
              : connectTo;
            return <path d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} fill="none" stroke="var(--interactive-accent, #7b6cff)" strokeWidth={2 / view.scale} strokeDasharray={`${6 / view.scale}`} />;
          })()}
        </svg>

        {/* Text / file / link nodes */}
        {data.nodes.filter((n) => n.type !== 'group').map((n) => {
          const col = resolveColor(n.color);
          const selected = sel.nodes.has(n.id);
          // While dragging a connection, reveal anchors on EVERY node (like Obsidian's
          // is-connecting mode) so you can aim at a specific anchor on the target.
          const showPorts = hoverNode === n.id || selected || connecting;
          const activeSide = connecting && connectTo?.node === n.id ? connectTo.side : undefined;
          return (
            <div
              key={n.id}
              className={`canvas-node canvas-${n.type} ${selected ? 'selected' : ''}`}
              style={{ left: n.x, top: n.y, width: n.width, height: n.height, '--canvas-node-height': `${n.height}px`, ...(col ? ({ '--c': col, borderColor: col } as React.CSSProperties) : {}) } as React.CSSProperties}
              onPointerDown={(e) => beginNodeDrag(e, n.id)}
              onPointerEnter={() => setHoverNode(n.id)}
              onPointerLeave={() => setHoverNode((h) => (h === n.id ? null : h))}
              onContextMenu={(e) => openNodeMenu(e, n)}
              onClickCapture={(e) => {
                // External links inside a card open in a new browser tab.
                const a = (e.target as HTMLElement).closest('a[href]');
                const href = a?.getAttribute('href');
                if (href && /^https?:\/\//i.test(href)) {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(href, '_blank', 'noopener');
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                activateNode(n.id);
              }}
            >
              {n.type === 'text' && (
                editingNode === n.id ? (
                  <textarea
                    className="canvas-text-edit"
                    autoFocus
                    ref={(el) => { editTaRef.current = el; }}
                    defaultValue={(n as TextNode).text}
                    onPointerDown={(e) => e.stopPropagation()}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setTextMenu({ x: e.clientX, y: e.clientY }); }}
                    onBlur={(e) => {
                      // Keep editing while the link dropdown is open (it takes focus).
                      if (linkPicker) return;
                      // The format menu preventDefaults blur, so a real blur = done editing.
                      // (On Android the doc-level pointerdown listener also commits — both
                      // paths route through commitTextEdit, which is idempotent.)
                      commitTextEdit(e.target.value);
                    }}
                    onKeyDown={onTextKeyDown}
                    style={{ textAlign: (n as TextNode).textAlign ?? 'left' }}
                  />
                ) : (
                  <div className="canvas-text-body" style={{ textAlign: (n as TextNode).textAlign ?? 'left' }}>
                    {(n as TextNode).text.trim() ? <Preview source={(n as TextNode).text} fontSize={16} /> : <span className="canvas-placeholder">{uiText("webobsidian.empty-card-double-click-to-edit-e21e85")}</span>}
                  </div>
                )
              )}
              {n.type === 'file' && <FileNodeBody file={(n as any).file} />}
              {n.type === 'link' && (
                <a className="canvas-link-body" href={(n as any).url} target="_blank" rel="noopener" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.preventDefault()}>
                  <Icon name="globe" size={22} />
                  <span className="url">{(n as any).url}</span>
                </a>
              )}
              {renderHandlesAndPorts(n, selected, showPorts, activeSide)}
            </div>
          );
        })}

        {/* Marquee */}
        {marquee && (
          <div className="canvas-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />
        )}

        {/* Alignment guides (Obsidian's canvas-snaps) — drawn while dragging nodes */}
        {snap && (snap.x || snap.y) && (
          <svg className="canvas-snaps" style={{ overflow: 'visible', position: 'absolute', left: 0, top: 0, width: 1, height: 1 }}>
            {snap.x && <SnapLine g={snap.x} axis="x" scale={view.scale} />}
            {snap.y && <SnapLine g={snap.y} axis="y" scale={view.scale} />}
          </svg>
        )}
      </div>

      {/* Selection menu — parity with Obsidian Canvas (Remove / Set color /
          Zoom to selection / (edges:) Arrow direction / Edit label). */}
      {(sel.nodes.size > 0 || sel.edges.size > 0) && selBBoxScreen && (
        <div
          className="canvas-menu"
          style={{ left: Math.max(8, selBBoxScreen.left + selBBoxScreen.width / 2), top: Math.max(8, selBBoxScreen.top - 12) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="canvas-menu-row">
            <button className="canvas-menu-btn" title={uiText("webobsidian.remove-e96390")} onClick={deleteSelection}>
              <Icon name="trash" size={16} />
            </button>
            <button className={`canvas-menu-btn ${showColors ? 'active' : ''}`} title={uiText("plugins.canvas.action-set-color")} onClick={() => setShowColors((v) => !v)}>
              <Icon name="palette" size={16} />
            </button>
            <button className="canvas-menu-btn" title={uiText("plugins.canvas.action-zoom-to-selection")} onClick={zoomToSelection}>
              <Icon name="zoom-to-selection" size={16} />
            </button>
            {singleTextNode && (
              <button className="canvas-menu-btn" title={uiText("interface.menu.edit")} onClick={() => activateNode(singleTextNode.id)}>
                <Icon name="square-pen" size={16} />
              </button>
            )}
            {onlyEdges && (
              <>
                <span className="canvas-dir-wrap">
                  <button className={`canvas-menu-btn ${showDir ? 'active' : ''}`} title={uiText("webobsidian.arrow-direction-d8e9ea")} onClick={() => setShowDir((v) => !v)}>
                    <Icon name={curDir === 'non' ? 'minus' : curDir === 'bi' ? 'arrow-left-right' : 'arrow-right'} size={16} />
                  </button>
                  {showDir && (
                    <div className="canvas-dir-menu">
                      {([['non', 'minus', 'Nondirectional'], ['uni', 'arrow-right', 'Unidirectional'], ['bi', 'arrow-left-right', 'Bidirectional']] as const).map(([k, ic, lbl]) => (
                        <button key={k} className="canvas-dir-item" onClick={() => setEdgeDirection(k)}>
                          <Icon name={ic} size={15} />
                          <span className="lbl">{lbl}</span>
                          {curDir === k && <Icon name="check" size={14} />}
                        </button>
                      ))}
                    </div>
                  )}
                </span>
                {selEdgeHasLabel && (
                  <button className="canvas-menu-btn" title={uiText("plugins.canvas.action-remove-label")} onClick={removeEdgeLabel}>
                    <Icon name="x" size={16} />
                  </button>
                )}
                <button
                  className="canvas-menu-btn"
                  title={uiText("plugins.canvas.action-edit-label")}
                  onClick={() => { const id = Array.from(sel.edges)[0]; if (id) setEditingEdge(id); }}
                >
                  <Icon name="pencil" size={16} />
                </button>
              </>
            )}
          </div>
          {showColors && (
            <div className="canvas-menu-colors">
              <button
                className={`canvas-swatch canvas-swatch-default ${!selColor ? 'selected' : ''}`}
                title={uiText("webobsidian.default-color-60ea2b")}
                onClick={() => setColor(undefined)}
              />
              {Object.entries(PRESET_COLORS).map(([k, hex]) => (
                <button
                  key={k}
                  className={`canvas-swatch ${selColor === k ? 'selected' : ''}`}
                  style={{ background: hex }}
                  title={uiText("webobsidian.color-value0-e68c76", {value0: k})}
                  onClick={() => setColor(k)}
                />
              ))}
              <label className={`canvas-swatch canvas-swatch-custom ${isCustomColor ? 'selected' : ''}`} title={uiText("webobsidian.custom-color-856257")}>
                <input
                  type="color"
                  value={isCustomColor ? (selColor as string) : '#e93147'}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* Zoom / control toolbar (bottom-left) */}
      <div className="canvas-toolbar canvas-toolbar-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button title={uiText("commands.zoom-out")} onClick={() => zoomBy(1 / 1.2)}><Icon name="indent-decrease" size={16} /></button>
        <button title={uiText("webobsidian.reset-zoom-100-8e1bda")} className="canvas-zoom-pct" onClick={resetZoom}>{Math.round(view.scale * 100)}%</button>
        <button title={uiText("commands.zoom-in")} onClick={() => zoomBy(1.2)}><Icon name="indent-increase" size={16} /></button>
        <span className="canvas-tb-sep" />
        <button title={uiText("plugins.canvas.action-zoom-to-fit")} onClick={zoomFit}><Icon name="graph" size={16} /></button>
        <span className="canvas-tb-sep" />
        <button title={uiText("webobsidian.undo-z-b35df2")} disabled={undoStack.current.length === 0} onClick={undo}><Icon name="undo" size={16} /></button>
        <button title={uiText("webobsidian.redo-z-b09f9e")} disabled={redoStack.current.length === 0} onClick={redo}><Icon name="redo" size={16} /></button>
        <span style={{ display: 'none' }}>{histV}</span>
      </div>

      {/* Add toolbar (bottom-center) — card / note / image, like Obsidian */}
      <div className="canvas-toolbar canvas-toolbar-add" onPointerDown={(e) => e.stopPropagation()}>
        <button title={uiText("webobsidian.add-card-or-double-click-canvas-c4198b")} onClick={() => { const c = viewCenter(); addTextNode(c.x, c.y); }}>
          <Icon name="file-plus" size={18} />
        </button>
        <button title={uiText("webobsidian.add-card-from-note-9e31f2")} onClick={() => { setNoteFilter(''); setNotePicker((v) => !v); }}>
          <Icon name="file-text" size={18} />
        </button>
        <button title={uiText("webobsidian.add-image-537563")} onClick={() => fileInputRef.current?.click()}>
          <Icon name="image" size={18} />
        </button>
      </div>

      {/* Note picker popup (Add card from note) */}
      {notePicker && (
        <div className="canvas-notepicker" onPointerDown={(e) => e.stopPropagation()}>
          <input
            className="canvas-notepicker-input"
            autoFocus
            placeholder={uiText("webobsidian.search-notes-300225")}
            value={noteFilter}
            onChange={(e) => setNoteFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNotePicker(false)}
          />
          <div className="canvas-notepicker-list">
            {filteredNotes.length === 0 && <div className="canvas-notepicker-empty">{uiText("webobsidian.no-files-ccc17f")}</div>}
            {filteredNotes.map((f) => (
              <button
                key={f.path}
                className="canvas-notepicker-item"
                onClick={() => {
                  const pc = pendingConnect.current;
                  if (pc) {
                    addConnectedFileNode(f.path, pc.cx, pc.cy, pc.edgeId, pc.end);
                    pendingConnect.current = null;
                  } else {
                    const c = viewCenter();
                    addFileNode(f.path, c.x, c.y);
                  }
                  setNotePicker(false);
                }}
              >
                <Icon name={IMG_RE.test(f.name) ? 'image' : 'file-text'} size={14} />
                <span className="name">{f.name}</span>
                <span className="dir">{f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Drop-an-edge-on-empty menu (Add card / Add note from vault), like Obsidian */}
      {edgeDrop && (
        <div
          className="canvas-dropmenu"
          style={{ left: Math.min(edgeDrop.sx, window.innerWidth - 200), top: Math.min(edgeDrop.sy, window.innerHeight - 90) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            className="canvas-dropmenu-item"
            onClick={() => { addConnectedTextNode(edgeDrop.cx, edgeDrop.cy, edgeDrop.edgeId, edgeDrop.end); setEdgeDrop(null); }}
          >
            <Icon name="file-plus" size={15} /> {uiText("plugins.canvas.action-add-card")} </button>
          <button
            className="canvas-dropmenu-item"
            onClick={() => {
              pendingConnect.current = { edgeId: edgeDrop.edgeId, end: edgeDrop.end, cx: edgeDrop.cx, cy: edgeDrop.cy };
              setNoteFilter('');
              setNotePicker(true);
              setEdgeDrop(null);
            }}
          >
            <Icon name="file-text" size={15} /> {uiText("plugins.canvas.action-add-note")} </button>
        </div>
      )}

      {/* Text-card formatting menu (right-click inside an editing card) — Obsidian parity */}
      {textMenu && (
        <TextFormatMenu items={textMenuItems()} x={textMenu.x} y={textMenu.y} onClose={() => setTextMenu(null)} />
      )}

      {/* "Add link" note-search dropdown */}
      {linkPicker && (
        <div
          className="canvas-notepicker canvas-linkpicker"
          style={{ left: Math.min(linkPicker.x, window.innerWidth - 380), top: linkPicker.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            className="canvas-notepicker-input"
            autoFocus
            placeholder={uiText("webobsidian.link-to-note-ac6487")}
            value={linkFilter}
            onChange={(e) => setLinkFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setLinkPicker(null); editTaRef.current?.focus(); }
              else if (e.key === 'Enter' && filteredLinks[0]) insertWikilink(filteredLinks[0].path, filteredLinks[0].name);
            }}
          />
          <div className="canvas-notepicker-list">
            {filteredLinks.length === 0 && <div className="canvas-notepicker-empty">{uiText("webobsidian.no-files-ccc17f")}</div>}
            {filteredLinks.map((f) => (
              <button
                key={f.path}
                className="canvas-notepicker-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertWikilink(f.path, f.name)}
              >
                <Icon name={IMG_RE.test(f.name) ? 'image' : 'file-text'} size={14} />
                <span className="name">{f.name.replace(/\.md$/i, '')}</span>
                <span className="dir">{f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onImagePicked} />
    </div>
  );

  function renderHandlesAndPorts(n: CanvasNode, selected = false, showPorts = false, activeSide?: CanvasSide) {
    const showGrip = isMobile || selected || hoverNode === n.id;
    return (
      <>
        {showGrip && (
          <div
            className="canvas-node-grip"
            title={uiText("webobsidian.drag-to-move-0d84b3")}
            onPointerDown={(e) => beginNodeDrag(e, n.id)}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Icon name="grip" size={14} />
          </div>
        )}
        {showPorts &&
          SIDES.map((s) => {
            const cls = `canvas-port port-${s}${activeSide === s ? ' active' : ''}`;
            return <div key={s} className={cls} onPointerDown={(e) => beginConnect(e, n.id, s)} />;
          })}
        {selected && (
          <>
            {/* edge resize strips (drag the border to resize; mid-edge port stays for connecting) */}
            {(['n', 's', 'e', 'w'] as const).map((h) => (
              <div key={h} className={`canvas-edge-resize resize-${h}`} onPointerDown={(e) => beginResize(e, n.id, h)} />
            ))}
            {/* corner handles (diagonal resize) */}
            {(['nw', 'ne', 'se', 'sw'] as const).map((h) => (
              <div key={h} className={`canvas-handle handle-${h}`} onPointerDown={(e) => beginResize(e, n.id, h)} />
            ))}
          </>
        )}
      </>
    );
  }
}

function centerOf(n: { x: number; y: number; width: number; height: number }) {
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
}

/** One alignment guide line + endpoint dots (canvas coords; thickness kept
    constant on screen by dividing by scale). axis 'x' = vertical line. */
function SnapLine({ g, axis, scale }: { g: SnapGuide; axis: 'x' | 'y'; scale: number }) {
  const languageRevision = useLanguage().revision;

  const x1 = axis === 'x' ? g.coord : g.min;
  const y1 = axis === 'x' ? g.min : g.coord;
  const x2 = axis === 'x' ? g.coord : g.max;
  const y2 = axis === 'x' ? g.max : g.coord;
  const r = 2.5 / scale;
  return (
    <g className="canvas-snap-guide">
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={1 / scale} />
      <circle cx={x1} cy={y1} r={r} />
      <circle cx={x2} cy={y2} r={r} />
    </g>
  );
}

/** Hierarchical text-card formatting menu (Obsidian parity). Buttons preventDefault
    on mousedown so the editing textarea keeps focus + selection. */
type FmtItem = { label?: string; act?: () => void; sub?: FmtItem[]; sep?: boolean };
function TextFormatMenu({ items, x, y, onClose }: { items: FmtItem[]; x: number; y: number; onClose: () => void }) {
  const languageRevision = useLanguage().revision;

  const [open, setOpen] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  // Open at the cursor, then measure and nudge fully on-screen (shift up/left if it
  // would overflow the bottom/right edge). Runs before paint → no visible jump.
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = 8;
    const r = el.getBoundingClientRect();
    let left = x, top = y;
    if (left + r.width > window.innerWidth - m) left = window.innerWidth - r.width - m;
    if (top + r.height > window.innerHeight - m) top = window.innerHeight - r.height - m;
    setPos({ left: Math.max(m, left), top: Math.max(m, top) });
  }, [x, y]);
  return (
    <div
      ref={ref}
      className="canvas-textmenu"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="canvas-textmenu-sep" />
        ) : it.sub ? (
          <div
            key={i}
            className="canvas-textmenu-parent"
            onMouseEnter={() => setOpen(i)}
            onMouseLeave={() => setOpen((o) => (o === i ? -1 : o))}
          >
            <button className="canvas-textmenu-item has-sub">
              {it.label}
              <Icon name="chevron-right" size={13} />
            </button>
            {open === i && (
              <div className="canvas-textmenu canvas-textmenu-sub">
                {it.sub.map((s, j) =>
                  s.sep ? (
                    <div key={j} className="canvas-textmenu-sep" />
                  ) : (
                    <button key={j} className="canvas-textmenu-item" onClick={() => { s.act?.(); onClose(); }}>
                      {s.label}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ) : (
          <button key={i} className="canvas-textmenu-item" onClick={() => { it.act?.(); onClose(); }}>
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}

/** Flatten the vault tree to a flat list of files (notes + images). */
function flattenFiles(node: TreeNode | null): { path: string; name: string }[] {
  if (!node) return [];
  const out: { path: string; name: string }[] = [];
  const walk = (n: TreeNode) => {
    if (n.type === 'file') out.push({ path: n.path, name: n.name });
    n.children?.forEach(walk);
  };
  node.children?.forEach(walk);
  return out;
}
