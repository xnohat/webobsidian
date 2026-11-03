import type { GraphData } from './links.js';

/** Verified against Obsidian 1.14.5 MetadataCache.updateUserIgnoreFilters. */
export function isUserIgnored(path: string, filters: readonly string[] | null | undefined): boolean {
  return (filters ?? []).some(raw => {
    const filter = raw.trim();
    if (!filter) return false;
    if (filter.length > 2 && filter.startsWith('/') && filter.endsWith('/')) {
      try { return new RegExp(filter.slice(1, -1), 'i').test(path); } catch { return false; }
    }
    return path.toLowerCase().startsWith(filter.toLowerCase());
  });
}

/** Presentation projection only: never alter the reference or file inventory. */
export function filterGraph(graph: GraphData, filters: readonly string[]): GraphData {
  const nodes = graph.nodes.filter(node => !isUserIgnored(node.id.replace(/^(attachment|unresolved):/, ''), filters));
  const visible = new Set(nodes.map(node => node.id));
  return { nodes, edges: graph.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target)) };
}
