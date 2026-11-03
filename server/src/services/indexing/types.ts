import type { ParsedNote } from '../markdown.js';
import type { ProjectionState } from './projection.js';

export interface FileStamp { size: number; mtimeMs: number; ctimeMs: number; dev?: number; ino?: number }
export interface InventoryRecord { stamp: FileStamp; sha256?: string; lastReadAt?: string; lastHashVerifiedAt?: string }
export interface InventoryScan { files: Map<string, FileStamp>; complete: boolean; failedPrefixes: string[] }
export type ReadResult = { kind: 'ok'; stamp: FileStamp; sha256: string; parsed?: ParsedNote } | { kind: 'missing' } | { kind: 'retry'; code: string };
export interface VaultIdentity { root: string; policy: string }
export interface SnapshotPayload {
  schemaVersion: 1; parserVersion: 1; identity: VaultIdentity; generation: string; revision: number; savedAt: string;
  records: [string, InventoryRecord][]; projection: ProjectionState; lastHashAuditAt: string | null; changesSinceBuild: number; lastBuildAt?: string;
}
export interface IndexStatus {
  phase: 'starting' | 'reconciling' | 'ready' | 'rebuilding' | 'degraded';
  available: boolean; initialScanComplete: boolean; generation: string; revision: number;
  watcherMode: 'native' | 'polling'; indexedNotes: number; pendingPaths: number; errorCount: number;
  lastReconcileAt: string | null; lastHashAuditAt: string | null; persistenceError: boolean;
}
