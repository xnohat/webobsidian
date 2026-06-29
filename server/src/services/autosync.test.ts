import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { settings, syncMock } = vi.hoisted(() => ({
  settings: { git: { enabled: true, autoSync: true, remote: 'https://x', intervalSec: 60 } },
  syncMock: vi.fn(async () => ({ ok: true, log: [] as string[] })),
}));
vi.mock('./settings.js', () => ({ getSettings: vi.fn(async () => settings) }));
vi.mock('./git.js', () => ({ sync: syncMock }));

let startAutoSync: () => void;

beforeEach(async () => {
  settings.git.enabled = true;
  settings.git.autoSync = true;
  settings.git.remote = 'https://x';
  settings.git.intervalSec = 60;
  syncMock.mockReset();
  syncMock.mockResolvedValue({ ok: true, log: [] });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  // Reset module-private lastRun/running/timer between tests.
  vi.resetModules();
  ({ startAutoSync } = await import('./autosync.js'));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('autosync tick — gating', () => {
  it('does not sync when git is disabled', async () => {
    settings.git.enabled = false;
    startAutoSync();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('does not sync when autoSync is off', async () => {
    settings.git.autoSync = false;
    startAutoSync();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('does not sync when no remote is configured', async () => {
    settings.git.remote = '';
    startAutoSync();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(syncMock).not.toHaveBeenCalled();
  });
});

describe('autosync tick — interval rate limit', () => {
  it('syncs on the first tick, then waits out intervalSec before the next', async () => {
    startAutoSync();
    await vi.advanceTimersByTimeAsync(30_000); // tick @30s → first sync
    expect(syncMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000); // tick @60s → only 30s since last → skip
    expect(syncMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000); // tick @90s → 60s since last → sync
    expect(syncMock).toHaveBeenCalledTimes(2);
  });
});

describe('autosync tick — reentrancy guard', () => {
  it('does not start a second sync while one is still in flight', async () => {
    let resolveSync: (v: unknown) => void = () => {};
    syncMock.mockImplementation(() => new Promise((res) => { resolveSync = res; }));

    startAutoSync();
    await vi.advanceTimersByTimeAsync(30_000); // tick 1 → sync starts, stays pending
    expect(syncMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000); // tick 2 → blocked by `running`
    expect(syncMock).toHaveBeenCalledTimes(1);

    resolveSync({ ok: true, log: [] }); // first sync completes, guard releases
    await vi.advanceTimersByTimeAsync(120_000); // flush + advance past the interval
    expect(syncMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
