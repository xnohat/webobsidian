import { QmdEngine, publishQmd, type QmdState } from '../search.js';
import type { ParsedNote } from '../markdown.js';
import { publishLinkState, applyPublishedLink, type LinkState } from '../links.js';
import { publishFilePaths, indexFile, unindexFile } from '../fileindex.js';
import { isVisiblePath } from './inventory.js';

export interface ProjectionState { search: QmdState; links: LinkState; files: string[] }

/** A complete, independently buildable generation of every derived index. */
export class IndexProjection {
  private static active?:IndexProjection;
  readonly search: QmdEngine;
  private notes = new Map<string, { links: string[]; tags: string[] }>();
  private files = new Set<string>();
  constructor(search = new QmdEngine()) { this.search = search; this.search.markReady(); }
  get noteCount(): number { return this.search.documentCount; }
  applyNote(rel: string, parsed: ParsedNote): void {
    if (!isVisiblePath(rel)) return;
    this.search.applyParsed(rel, parsed);
    this.notes.set(rel, { links: [...parsed.links], tags: [...parsed.tags] });
    this.files.add(rel);
    if(IndexProjection.active===this){applyPublishedLink(rel,parsed);indexFile(rel);}
  }
  applyFile(rel: string): void { if (isVisiblePath(rel)){this.files.add(rel);if(IndexProjection.active===this)indexFile(rel);} }
  remove(rel: string): void { this.search.remove(rel); this.notes.delete(rel); this.files.delete(rel);if(IndexProjection.active===this){applyPublishedLink(rel);unindexFile(rel);} }
  exportState(): ProjectionState { return { search: this.search.exportState(), links: { notes: [...this.notes] }, files: [...this.files] }; }
  static fromState(state: ProjectionState): IndexProjection {
    const p = new IndexProjection(QmdEngine.fromState(state.search));
    p.notes = new Map(state.links.notes); p.files = new Set(state.files);
    return p;
  }
  publish(): void { publishQmd(this.search); publishLinkState({ notes: [...this.notes] }); publishFilePaths([...this.files]);IndexProjection.active=this; }
}
