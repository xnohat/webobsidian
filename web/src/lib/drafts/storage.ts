import type { DraftKey, DraftRecord } from './types';
let channel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
        channel = new BroadcastChannel('webobsidian-draft-events');
        channel.onmessage = () => window.dispatchEvent(new Event('local-drafts-changed'));
    }
    catch { /* Transactions remain authoritative without messaging. */ }
}
function changed() { if (typeof window !== 'undefined' && window.dispatchEvent) {
    window.dispatchEvent(new Event('local-drafts-changed'));
    channel?.postMessage({ type: 'changed' });
} }
const key = (k: DraftKey) => [k.scopeId, k.path, k.writerId];
function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('webobsidian-drafts', 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('drafts'))
            request.result.createObjectStore('drafts', { keyPath: ['scopeId', 'path', 'writerId'] }); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Draft storage upgrade blocked by another tab'));
    });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, set: (result: T) => void) => void): Promise<T> {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
        let result: T;
        const tx = db.transaction('drafts', mode);
        tx.oncomplete = () => { db.close(); if (mode === 'readwrite')
            changed(); resolve(result); };
        tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Draft transaction failed')); };
        try {
            action(tx.objectStore('drafts'), v => { result = v; });
        }
        catch (error) {
            tx.abort();
            reject(error);
        }
    });
}
export function putDraft(record: DraftRecord): Promise<void> { return transaction('readwrite', (store, set) => { const get = store.get(key(record)); get.onsuccess = () => { if (!get.result || get.result.revision <= record.revision)
    store.put(record); set(undefined); }; }); }
export function listDrafts(scopeId: string): Promise<DraftRecord[]> { return transaction('readonly', (store, set) => { const get = store.getAll(); get.onsuccess = () => set((get.result as DraftRecord[]).filter(r => r.scopeId === scopeId)); }); }
export function deleteDraftIfRevision(k: DraftKey, revision: number, canDelete: (record: DraftRecord) => boolean = () => true): Promise<boolean> { return transaction('readwrite', (store, set) => { const get = store.get(key(k)); get.onsuccess = () => { const matches = get.result?.revision === revision && canDelete(get.result); if (matches)
    store.delete(key(k)); set(matches); }; }); }
export function remapDrafts(scopeId: string, from: string, to: string): Promise<void> { return transaction('readwrite', (store, set) => { const get = store.getAll(); get.onsuccess = () => { for (const r of get.result as DraftRecord[]) {
    if (r.scopeId !== scopeId || !(r.path === from || r.path.startsWith(from + '/')))
        continue;
    const moved = { ...r, path: to + r.path.slice(from.length) };
    const existing = store.get(key(moved));
    existing.onsuccess = () => { if (existing.result)
        return; store.put(moved); store.delete(key(r)); };
} set(undefined); }; }); }
