import {t as uiText} from "./i18n/runtime";
import { useSyncExternalStore } from 'react';
import { api, type IndexStatus } from './api';

let state: { status: IndexStatus | null; refresh: number } = { status: null, refresh: 0 };
let epoch = 0;
const listeners = new Set<() => void>();
function publish(next: typeof state) {
  state = next;
  for (const listener of listeners) listener();
}
export const getIndexState = () => state;
export function applyIndexStatus(status: IndexStatus) {
  if (state.status?.generation === status.generation && state.status.revision > status.revision) return;
  publish({ ...state, status });
}
export function resetIndexStatus() {
  epoch++;
  publish({ status: null, refresh: state.refresh + 1 });
}
export async function refreshIndexStatus() {
  const at = epoch;
  const before = state.status;
  const status = await api.indexStatus();
  if (at !== epoch) return;
  // WebSocket publication received after the request started is newer evidence.
  if (state.status === before) applyIndexStatus(status);
  publish({ ...state, refresh: state.refresh + 1 });
}
export function useIndexStatus() {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, getIndexState, getIndexState);
}
export function indexStatusMessage(status: IndexStatus | null): string {
  if (!status) return '';
  if (status.phase === 'degraded') return uiText("webobsidian.index-updates-are-delayed-results-may-be-outdate-7e121c");
  if (!status.initialScanComplete) return status.available ? uiText("webobsidian.checking-changes-cached-results-are-preliminary-543f34") : uiText("webobsidian.indexing-notes-1f3004");
  if (status.phase === 'rebuilding') return uiText("webobsidian.rebuilding-index-showing-the-previous-results-9c544d");
  if (status.phase === 'reconciling') return uiText("webobsidian.checking-changes-326126");
  if (status.persistenceError) return uiText("webobsidian.index-is-current-but-its-cache-could-not-be-save-d752e4");
  return '';
}
