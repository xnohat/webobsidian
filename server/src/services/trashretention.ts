// Trash retention (FR-1): permanently delete items that have been in `.trash` longer than
// settings.vault.trashRetentionDays. The clock starts when an item was MOVED into the trash
// (recorded in the trash index), not at the file's own modified time. 0 = keep forever.
import { getSettings } from './settings.js';
import { getTrashRoot, purgeTrashEntry } from './vault.js';
import { reconcileAndFindExpired } from './trashindex.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000; // hourly; retention is measured in days

let running: Promise<number> | null = null;

/** Purge expired trash now. Returns how many items were permanently deleted. */
export function purgeExpiredTrash(): Promise<number> {
  // Never overlap runs (hourly timer + a settings change at the same moment).
  if (!running) {
    running = doPurge().finally(() => {
      running = null;
    });
  }
  return running;
}

async function doPurge(): Promise<number> {
  const days = (await getSettings()).vault.trashRetentionDays;
  if (!days || days < 0) return 0; // keep forever
  const now = Date.now();
  const trashRoot = await getTrashRoot();
  const expired = await reconcileAndFindExpired(trashRoot, now - days * DAY_MS, now);
  let purged = 0;
  for (const key of expired) {
    try {
      await purgeTrashEntry(key);
      purged++;
    } catch (e: any) {
      // Never log item names (vault content); counts only.
      console.warn('[trash] could not purge an expired item:', e?.message ?? 'error');
    }
  }
  if (purged) console.log(`[trash] retention: permanently deleted ${purged} item(s) older than ${days} day(s)`);
  return purged;
}

/** Run once at startup (shortly after boot) and then hourly. */
export function startTrashRetention(): void {
  const tick = () => void purgeExpiredTrash().catch((e) => console.warn('[trash] retention check failed:', e?.message ?? 'error'));
  setTimeout(tick, 15_000).unref();
  setInterval(tick, CHECK_EVERY_MS).unref();
}
