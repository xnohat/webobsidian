import path from 'node:path';
import { listMarkdownFiles, readFileText } from './vault.js';
import { parseNote, linkKey } from './markdown.js';

interface LinkGraph {
  /** outgoing[rel] = set of target keys */
  outgoing: Map<string, Set<string>>;
  /** keyToPath[linkKey] = rel path (for resolving wikilinks to files) */
  keyToPath: Map<string, string>;
  /** rawLinks[rel] = original wikilink targets (before normalization) */
  rawLinks: Map<string, string[]>;
  /** tags[rel] = tags declared in the note */
  tags: Map<string, string[]>;
}

let graph: LinkGraph = {
  outgoing: new Map(),
  keyToPath: new Map(),
  rawLinks: new Map(),
  tags: new Map(),
};

export async function buildLinkGraph(): Promise<void> {
  const files = await listMarkdownFiles();
  const outgoing = new Map<string, Set<string>>();
  const keyToPath = new Map<string, string>();
  const rawLinks = new Map<string, string[]>();
  const tags = new Map<string, string[]>();

  for (const rel of files) {
    const base = path.basename(rel).replace(/\.(md|markdown)$/i, '').toLowerCase();
    keyToPath.set(base, rel);
    keyToPath.set(rel.replace(/\.(md|markdown)$/i, '').toLowerCase(), rel);
  }

  for (const rel of files) {
    try {
      const note = parseNote(rel, await readFileText(rel));
      outgoing.set(rel, new Set(note.links.map(linkKey)));
      rawLinks.set(rel, note.links);
      tags.set(rel, note.tags);
    } catch {
      outgoing.set(rel, new Set());
      rawLinks.set(rel, []);
      tags.set(rel, []);
    }
  }
  graph = { outgoing, keyToPath, rawLinks, tags };
}

const stripExt = (rel: string) => rel.replace(/\.(md|markdown)$/i, '').toLowerCase();

/**
 * Incrementally update the link graph for a single markdown file. Far cheaper
 * than buildLinkGraph() (which re-reads every file in the vault) — used by the
 * fs watcher so an external edit doesn't reparse thousands of notes each time.
 */
export async function updateLinkGraphForFile(rel: string, removed = false): Promise<void> {
  // Files under a dot-dir (`.trash`, `.obsidian`, …) are not link targets — mirror
  // listMarkdownFiles() so a note moved to `.trash` doesn't get re-added by the
  // incremental watcher and shadow a real file with the same basename.
  if (rel.split('/').some((seg) => seg.startsWith('.'))) return;
  const base = path.basename(rel).replace(/\.(md|markdown)$/i, '').toLowerCase();
  const relKey = stripExt(rel);

  if (removed) {
    graph.outgoing.delete(rel);
    graph.rawLinks.delete(rel);
    graph.tags.delete(rel);
    // only drop key→path entries that still point at this file (basenames can collide)
    if (graph.keyToPath.get(base) === rel) graph.keyToPath.delete(base);
    if (graph.keyToPath.get(relKey) === rel) graph.keyToPath.delete(relKey);
    return;
  }

  graph.keyToPath.set(base, rel);
  graph.keyToPath.set(relKey, rel);
  try {
    const note = parseNote(rel, await readFileText(rel));
    graph.outgoing.set(rel, new Set(note.links.map(linkKey)));
    graph.rawLinks.set(rel, note.links);
    graph.tags.set(rel, note.tags);
  } catch {
    graph.outgoing.set(rel, new Set());
    graph.rawLinks.set(rel, []);
    graph.tags.set(rel, []);
  }
}

/** Resolve a wikilink target key to a known graph key.
 *
 *  Obsidian-style resolution: a link written with a folder prefix that is not
 *  vault-relative (e.g. `contenedores/duckdns` inside a note under `homelab/`)
 *  must still resolve to the note by basename. Try the exact (path) key first
 *  so `Server kike/Red` and `Motoledo/Red` keep resolving independently, then
 *  fall back to the basename key.
 */
function lookupLinkKey(target: string): string | undefined {
  const exact = linkKey(target);
  if (graph.keyToPath.has(exact)) return exact;
  if (target.includes("/")) {
    const base = exact.split("/").pop();
    if (base && graph.keyToPath.has(base)) return base;
  }
  return undefined;
}

export function resolveLink(target: string): string | undefined {
  const k = lookupLinkKey(target);
  return k ? graph.keyToPath.get(k) : undefined;
}

/** Notes that link *to* the given vault-relative path. */
export function backlinksFor(rel: string): string[] {
  const targetKey = path.basename(rel).replace(/\.(md|markdown)$/i, '').toLowerCase();
  const relKey = rel.replace(/\.(md|markdown)$/i, '').toLowerCase();
  const out: string[] = [];
  for (const [source, targets] of graph.outgoing) {
    if (source === rel) continue;
    if (targets.has(targetKey) || targets.has(relKey)) out.push(source);
  }
  return out.sort();
}

/** node kinds drive client-side filtering (Tags / Attachments / Existing files only). */
export type GraphNodeKind = 'note' | 'attachment' | 'unresolved';

export interface GraphNode {
  id: string;
  label: string;
  kind: GraphNodeKind;
  tags: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Embed targets ending in one of these are treated as attachment nodes, not notes. */
const ATTACHMENT_RE =
  /\.(png|jpe?g|gif|svg|webp|bmp|ico|avif|pdf|mp4|webm|mov|mkv|mp3|wav|ogg|m4a|flac|zip|docx?|xlsx?|pptx?)$/i;

export function graphData(): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenNode = new Set<string>();
  const seenEdge = new Set<string>();

  const addNode = (n: GraphNode) => {
    if (seenNode.has(n.id)) return;
    seenNode.add(n.id);
    nodes.push(n);
  };
  const addEdge = (source: string, target: string) => {
    if (source === target) return;
    const k = `${source}\0${target}`;
    if (seenEdge.has(k)) return;
    seenEdge.add(k);
    edges.push({ source, target });
  };

  for (const rel of graph.outgoing.keys()) {
    addNode({
      id: rel,
      label: path.basename(rel).replace(/\.(md|markdown)$/i, ''),
      kind: 'note',
      tags: graph.tags.get(rel) ?? [],
    });
  }

  for (const [source, targets] of graph.rawLinks) {
    for (const target of targets) {
      const k = lookupLinkKey(target);
      const dest = k ? graph.keyToPath.get(k) : undefined;
      if (dest) {
        addEdge(source, dest);
      } else if (ATTACHMENT_RE.test(target)) {
        const id = `attachment:${target.toLowerCase()}`;
        addNode({ id, label: path.basename(target), kind: 'attachment', tags: [] });
        addEdge(source, id);
      } else {
        const id = `unresolved:${linkKey(target)}`;
        addNode({ id, label: target, kind: 'unresolved', tags: [] });
        addEdge(source, id);
      }
    }
  }

  return { nodes, edges };
}
