import type { EditorConfig } from './config.js';
import { getStagingDocuments, getStagingTree } from './github.js';
import { isMarkdownPath, isReadableTreePath } from './paths.js';

export interface ReadNote {
  path: string;
  title: string;
  body: string;
  tags: string[];
  links: string[];
  properties: Record<string, unknown>;
}

export interface SearchHit {
  path: string;
  title: string;
  score: number;
  tags: string[];
  snippet: string;
}

export interface NoteMatches {
  path: string;
  count: number;
  contexts: Array<{
    text: string;
    ranges: Array<[number, number]>;
    pre: boolean;
    post: boolean;
  }>;
}

export interface ContributionReadModel {
  sha: string;
  notes: ReadNote[];
}

let cachedKey = '';
let cachedAt = 0;
let cachedModel: ContributionReadModel | undefined;
let pendingModel: Promise<ContributionReadModel> | undefined;
const CACHE_RECHECK_MS = 30_000;

function configKey(config: EditorConfig): string {
  return `${config.upstreamOwner}/${config.repo}@${config.stagingBranch}`;
}

function scalar(value: string): unknown {
  const text = value.trim().replace(/^['"]|['"]$/g, '');
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith('[') && text.endsWith(']')) {
    return text.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  return text;
}

function frontmatter(raw: string): { body: string; properties: Record<string, unknown> } {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) return { body: raw, properties: {} };
  const normalized = raw.replaceAll('\r\n', '\n');
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) return { body: raw, properties: {} };
  const properties: Record<string, unknown> = {};
  let listKey = '';
  for (const line of normalized.slice(4, end).split('\n')) {
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && listKey) {
      const values = Array.isArray(properties[listKey]) ? properties[listKey] as unknown[] : [];
      values.push(scalar(item[1]));
      properties[listKey] = values;
      continue;
    }
    const match = line.match(/^([^:#][^:]*):\s*(.*)$/);
    if (!match) continue;
    listKey = match[1].trim();
    properties[listKey] = match[2].trim() ? scalar(match[2]) : [];
  }
  return { body: normalized.slice(end + 5), properties };
}

function parseNote(path: string, raw: string): ReadNote {
  const parsed = frontmatter(raw);
  const links = [...parsed.body.matchAll(/!?\[\[([^\]]+?)\]\]/g)]
    .map((match) => match[1].split('|')[0].split('#')[0].trim())
    .filter(Boolean);
  const inlineTags = [...parsed.body.matchAll(/(?:^|\s)#([\p{L}\p{N}_\-/]*\p{L}[\p{L}\p{N}_\-/]*)/gu)]
    .map((match) => match[1]);
  const propertyTags = parsed.properties.tags;
  const tags = new Set(inlineTags);
  if (Array.isArray(propertyTags)) propertyTags.forEach((tag) => tags.add(String(tag).replace(/^#/, '')));
  else if (typeof propertyTags === 'string') {
    propertyTags.split(/[\s,]+/).filter(Boolean).forEach((tag) => tags.add(tag.replace(/^#/, '')));
  }
  const fallbackTitle = path.slice(path.lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, '');
  return {
    path,
    title: typeof parsed.properties.title === 'string' && parsed.properties.title
      ? parsed.properties.title
      : fallbackTitle,
    body: parsed.body,
    tags: [...tags],
    links: [...new Set(links)],
    properties: parsed.properties,
  };
}

async function buildReadModel(config: EditorConfig): Promise<ContributionReadModel> {
  const tree = await getStagingTree(config);
  const entries = tree.tree.filter(
    (entry) => entry.type === 'blob' && isReadableTreePath(entry.path) && isMarkdownPath(entry.path),
  );
  if (cachedModel && cachedKey === configKey(config) && cachedModel.sha === tree.sha) {
    cachedAt = Date.now();
    return cachedModel;
  }
  const documents = await getStagingDocuments(config, entries);
  const model = { sha: tree.sha, notes: documents.map((document) => parseNote(document.path, document.content)) };
  cachedKey = configKey(config);
  cachedAt = Date.now();
  cachedModel = model;
  return model;
}

export async function contributionReadModel(config: EditorConfig): Promise<ContributionReadModel> {
  if (cachedModel && cachedKey === configKey(config) && Date.now() - cachedAt < CACHE_RECHECK_MS) {
    return cachedModel;
  }
  if (!pendingModel) pendingModel = buildReadModel(config).finally(() => { pendingModel = undefined; });
  return pendingModel;
}

function cleanLine(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').replace(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, '$2$1').trim();
}

export function searchNotes(model: ContributionReadModel, query: string, limit = 0): SearchHit[] {
  const filters: Record<'tag' | 'path' | 'title', string[]> = { tag: [], path: [], title: [] };
  const remaining = query.replace(
    /(?:^|\s)(tag|path|title):(?:"([^"]+)"|'([^']+)'|(\S+))/gi,
    (_match, field: 'tag' | 'path' | 'title', doubleQuoted: string, singleQuoted: string, bare: string) => {
      filters[field.toLocaleLowerCase() as keyof typeof filters].push(
        (doubleQuoted ?? singleQuoted ?? bare).toLocaleLowerCase(),
      );
      return ' ';
    },
  );
  const terms = remaining.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length && !Object.values(filters).some((values) => values.length)) return [];
  const hits: SearchHit[] = [];
  for (const note of model.notes) {
    const searchableTags = note.tags.map((tag) => tag.toLocaleLowerCase());
    if (!filters.tag.every((filter) => searchableTags.some((tag) => tag.includes(filter)))) continue;
    if (!filters.path.every((filter) => note.path.toLocaleLowerCase().includes(filter))) continue;
    if (!filters.title.every((filter) => note.title.toLocaleLowerCase().includes(filter))) continue;
    const fields = `${note.title}\n${note.path}\n${note.tags.join(' ')}\n${note.body}`.toLocaleLowerCase();
    if (!terms.every((term) => fields.includes(term))) continue;
    const score = Math.max(1, terms.reduce((total, term) => total + (fields.split(term).length - 1), 0));
    const matchedLine = note.body.split(/\r?\n/).find(
      (line) => terms.some((term) => line.toLocaleLowerCase().includes(term)),
    );
    hits.push({
      path: note.path,
      title: note.title,
      score,
      tags: note.tags,
      snippet: cleanLine(matchedLine ?? note.body.slice(0, 160)),
    });
  }
  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return limit > 0 ? hits.slice(0, limit) : hits;
}

export function allTags(model: ContributionReadModel): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const note of model.notes) {
    for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function propertyType(key: string, value: unknown): string {
  if (['tags', 'aliases', 'cssclasses'].includes(key) || Array.isArray(value)) return 'list';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) return 'datetime';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
  return 'text';
}

export function allProperties(
  model: ContributionReadModel,
): Array<{ key: string; type: string; count: number }> {
  const counts = new Map<string, number>();
  const types = new Map<string, Map<string, number>>();
  for (const key of ['tags', 'aliases', 'cssclasses']) {
    counts.set(key, 0);
    types.set(key, new Map([['list', 1]]));
  }
  for (const note of model.notes) {
    for (const [key, value] of Object.entries(note.properties)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const type = propertyType(key, value);
      const typeCounts = types.get(key) ?? new Map<string, number>();
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      types.set(key, typeCounts);
    }
  }
  return [...counts.entries()].map(([key, count]) => {
    const type = [...(types.get(key) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'text';
    return { key, type, count };
  }).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function linkKey(target: string): string {
  return target.replace(/\.(md|markdown)$/i, '').toLocaleLowerCase();
}

export function backlinksFor(model: ContributionReadModel, path: string): string[] {
  const basename = path.slice(path.lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, '').toLocaleLowerCase();
  const pathKey = linkKey(path);
  return model.notes
    .filter((note) => note.path !== path && note.links.some((target) => {
      const key = linkKey(target);
      return key === basename || key === pathKey;
    }))
    .map((note) => note.path)
    .sort();
}

export function resolveLink(model: ContributionReadModel, target: string): string | undefined {
  const key = linkKey(target.split('|')[0].split('#')[0].trim());
  if (!key) return undefined;
  return model.notes.find((note) => linkKey(note.path) === key)?.path
    ?? model.notes.find((note) => linkKey(note.path.slice(note.path.lastIndexOf('/') + 1)) === key)?.path;
}

export interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    kind: 'note' | 'attachment' | 'unresolved';
    tags: string[];
  }>;
  edges: Array<{ source: string; target: string }>;
}

const ATTACHMENT_RE =
  /\.(png|jpe?g|gif|svg|webp|bmp|ico|avif|pdf|mp4|webm|mov|mkv|mp3|wav|ogg|m4a|flac|zip|docx?|xlsx?|pptx?)$/i;

export function graphData(model: ContributionReadModel): GraphData {
  const nodes: GraphData['nodes'] = model.notes.map((note) => ({
    id: note.path,
    label: note.path.slice(note.path.lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, ''),
    kind: 'note',
    tags: note.tags,
  }));
  const edges: GraphData['edges'] = [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgeIds = new Set<string>();
  for (const note of model.notes) {
    for (const target of note.links) {
      const resolved = resolveLink(model, target);
      const destination = resolved
        ?? (ATTACHMENT_RE.test(target) ? `attachment:${target.toLocaleLowerCase()}` : `unresolved:${linkKey(target)}`);
      if (destination === note.path) continue;
      if (!nodeIds.has(destination)) {
        nodes.push({
          id: destination,
          label: target.slice(target.lastIndexOf('/') + 1),
          kind: ATTACHMENT_RE.test(target) ? 'attachment' : 'unresolved',
          tags: [],
        });
        nodeIds.add(destination);
      }
      const edgeId = `${note.path}\0${destination}`;
      if (!edgeIds.has(edgeId)) {
        edges.push({ source: note.path, target: destination });
        edgeIds.add(edgeId);
      }
    }
  }
  return { nodes, edges };
}

export function matchesFor(
  model: ContributionReadModel,
  path: string,
  terms: string[],
  caseSensitive = false,
): NoteMatches {
  const note = model.notes.find((candidate) => candidate.path === path);
  const needles = terms.map((term) => caseSensitive ? term : term.toLocaleLowerCase()).filter(Boolean);
  if (!note || !needles.length) return { path, count: 0, contexts: [] };
  const haystack = caseSensitive ? note.body : note.body.toLocaleLowerCase();
  const raw: Array<{ start: number; length: number }> = [];
  for (const needle of needles) {
    for (let start = haystack.indexOf(needle); start >= 0; start = haystack.indexOf(needle, start + needle.length)) {
      raw.push({ start, length: needle.length });
    }
  }
  raw.sort((a, b) => a.start - b.start || b.length - a.length);
  const occurrences: typeof raw = [];
  let lastEnd = -1;
  for (const occurrence of raw) {
    if (occurrence.start >= lastEnd) {
      occurrences.push(occurrence);
      lastEnd = occurrence.start + occurrence.length;
    }
  }
  const contexts: NoteMatches['contexts'] = [];
  let group: typeof raw = [];
  const flush = () => {
    if (!group.length || contexts.length >= 20) {
      group = [];
      return;
    }
    const windowStart = Math.max(0, group[0].start - 32);
    const last = group[group.length - 1];
    const windowEnd = Math.min(note.body.length, last.start + last.length + 32);
    const untrimmed = note.body.slice(windowStart, windowEnd).replace(/[\n\r\t]/g, ' ');
    const leading = untrimmed.length - untrimmed.replace(/^\s+/, '').length;
    const text = untrimmed.trim();
    const ranges = group
      .map((occurrence) => [Math.max(0, occurrence.start - windowStart - leading), occurrence.length] as [number, number])
      .filter(([start]) => start < text.length);
    contexts.push({ text, ranges, pre: windowStart > 0, post: windowEnd < note.body.length });
    group = [];
  };
  for (const occurrence of occurrences) {
    const previous = group[group.length - 1];
    if (previous && occurrence.start - (previous.start + previous.length) > 64) flush();
    group.push(occurrence);
  }
  flush();
  return { path, count: occurrences.length, contexts };
}
