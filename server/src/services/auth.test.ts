import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable doubles so each test can toggle whether an override / user password exists.
const { cfg, settings } = vi.hoisted(() => ({
  cfg: { initialPassword: undefined as string | undefined },
  settings: { auth: { jwtSecret: 'x'.repeat(64), userPasswordHash: '', passwordHash: '' } },
}));

vi.mock('../config.js', () => ({ config: cfg }));
vi.mock('./settings.js', () => ({
  getSettings: vi.fn(async () => settings),
  updateSettings: vi.fn(),
}));

const { checkPassword, hasOverridePassword, changePassword } = await import('./auth.js');

beforeEach(() => {
  cfg.initialPassword = undefined;
  settings.auth.userPasswordHash = '';
  settings.auth.passwordHash = '';
});

describe('hasOverridePassword', () => {
  it('is false with no override configured', async () => {
    expect(await hasOverridePassword()).toBe(false);
  });
  it('is true when WEBOBSIDIAN_PASSWORD (config.initialPassword) is set', async () => {
    cfg.initialPassword = 'recovery';
    expect(await hasOverridePassword()).toBe(true);
  });
  it('is true when a manual auth.passwordHash is set', async () => {
    settings.auth.passwordHash = 'scrypt$00$00';
    expect(await hasOverridePassword()).toBe(true);
  });
});

describe('checkPassword — default (123456) gating via allowDefault', () => {
  it('accepts the default with zero config (lenient by default)', async () => {
    expect(await checkPassword('123456')).toBe(true);
  });
  it('rejects the default at login when an override exists (allowDefault: false)', async () => {
    cfg.initialPassword = 'recovery';
    expect(await checkPassword('123456', { allowDefault: false })).toBe(false);
  });
  it('still accepts the override password itself (recovery login)', async () => {
    cfg.initialPassword = 'recovery';
    expect(await checkPassword('recovery', { allowDefault: false })).toBe(true);
  });
  it('rejects an unrelated wrong password', async () => {
    expect(await checkPassword('hunter2')).toBe(false);
  });
});

describe('first-run password setup is not blocked by an override (regression for the #4 dead-end)', () => {
  it('login rejects 123456 under an override, but change-password still sets the real password', async () => {
    cfg.initialPassword = 'recovery'; // override active

    // Login path is hardened: the default is refused.
    expect(await checkPassword('123456', { allowDefault: false })).toBe(false);

    // But the authenticated first-run "set a password" flow (which submits 123456
    // as the current password) must still succeed and write the real hash.
    await expect(changePassword('123456', 'my-real-password')).resolves.toBeUndefined();
  });
});
