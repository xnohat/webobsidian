const DB_NAME = 'uscwiki-editor-drafts';
const STORE_NAME = 'assets';
const DB_VERSION = 1;

export const CONTRIBUTION_IMAGE_RE = /\.(avif|bmp|gif|jpe?g|png|webp)$/i;
export const MAX_DRAFT_IMAGE_BYTES = 2 * 1024 * 1024;

export interface DraftAsset {
  path: string;
  notePath: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

const objectUrls = new Map<string, string>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'path' });
        store.createIndex('notePath', 'notePath', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open attachment drafts'));
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Attachment draft operation failed'));
  });
}

async function allAssets(): Promise<DraftAsset[]> {
  const database = await openDatabase();
  try {
    return await idbRequest(database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll());
  } finally {
    database.close();
  }
}

function cacheObjectUrl(asset: DraftAsset): void {
  const previous = objectUrls.get(asset.path);
  if (previous) URL.revokeObjectURL(previous);
  objectUrls.set(asset.path, URL.createObjectURL(asset.blob));
}

export async function warmDraftAssetUrls(): Promise<DraftAsset[]> {
  if (typeof indexedDB === 'undefined') return [];
  let assets: DraftAsset[];
  try {
    assets = await allAssets();
  } catch {
    return [];
  }
  const currentPaths = new Set(assets.map((asset) => asset.path));
  for (const [path, url] of objectUrls) {
    if (!currentPaths.has(path)) {
      URL.revokeObjectURL(url);
      objectUrls.delete(path);
    }
  }
  assets.forEach(cacheObjectUrl);
  return assets;
}

export function draftAssetUrl(path: string): string | null {
  return objectUrls.get(path) ?? null;
}

export async function saveDraftAsset(asset: Omit<DraftAsset, 'createdAt'>): Promise<DraftAsset> {
  if (!CONTRIBUTION_IMAGE_RE.test(asset.path)) throw new Error('不支持这种图片格式');
  if (asset.size > MAX_DRAFT_IMAGE_BYTES) throw new Error('单张图片不能超过 2 MiB');
  const record: DraftAsset = { ...asset, createdAt: Date.now() };
  const database = await openDatabase();
  try {
    await idbRequest(database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record));
  } finally {
    database.close();
  }
  cacheObjectUrl(record);
  return record;
}

export async function draftAssetsForNote(notePath: string): Promise<DraftAsset[]> {
  if (typeof indexedDB === 'undefined') return [];
  const database = await openDatabase();
  try {
    return await idbRequest(
      database.transaction(STORE_NAME).objectStore(STORE_NAME).index('notePath').getAll(notePath),
    );
  } finally {
    database.close();
  }
}

export async function getDraftAsset(path: string): Promise<DraftAsset | null> {
  if (typeof indexedDB === 'undefined') return null;
  const database = await openDatabase();
  try {
    return (await idbRequest(
      database.transaction(STORE_NAME).objectStore(STORE_NAME).get(path),
    )) ?? null;
  } finally {
    database.close();
  }
}

export async function removeDraftAsset(path: string): Promise<void> {
  const database = await openDatabase();
  try {
    await idbRequest(database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(path));
  } finally {
    database.close();
  }
  const url = objectUrls.get(path);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(path);
}

export async function reassignDraftAssets(from: string, to: string): Promise<void> {
  const assets = await draftAssetsForNote(from);
  if (!assets.length) return;
  const database = await openDatabase();
  try {
    const store = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    await Promise.all(assets.map((asset) => idbRequest(store.put({ ...asset, notePath: to }))));
  } finally {
    database.close();
  }
}

export async function removeDraftAssets(notePath: string): Promise<void> {
  const assets = await draftAssetsForNote(notePath);
  if (!assets.length) return;
  await Promise.all(assets.map((asset) => removeDraftAsset(asset.path)));
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
