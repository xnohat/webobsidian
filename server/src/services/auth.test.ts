import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable doubles so each test can toggle whether an override / user password exists.
const { cfg, settings } = vi.hoisted(() => ({
  cfg: { initialPassword: undefined as string | undefined },
  settings: { auth: { jwtSecret: 'x'.repeat(64), userPasswordHash: '', passwordHash: '' } },
}));

vi.mock('../config.js', () => ({ config: cfg }));
vi.mock('./settings.js', () => ({
  getSettings: vi.fn(async () => settings),
  updateSettings: vi.fn(async (mutate: (draft: typeof settings) => void) => mutate(settings)),
}));

const { checkPassword, hasOverridePassword, hasCustomPassword, changePassword } = await import('./auth.js');

beforeEach(() => {
  cfg.initialPassword = undefined;
  settings.auth.userPasswordHash = '';
  settings.auth.passwordHash = '';
});

describe('hasOverridePassword', () => {
  it('ignores the legacy CLI default as a recovery override', async () => {
    cfg.initialPassword = '123456';
    expect(await hasOverridePassword()).toBe(false);
    expect(await hasCustomPassword()).toBe(false);
  });
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

describe('legacy CLI default', () => {
  it('expires after the user chooses a password', async () => {
    cfg.initialPassword = '123456';
    await changePassword('123456', 'my-real-password');
    expect(await hasCustomPassword()).toBe(true);
    expect(await checkPassword('my-real-password')).toBe(true);
    expect(await checkPassword('123456')).toBe(false);
    await expect(changePassword('123456', 'another-password')).rejects.toThrow('Current password');
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

describe('one condition gates login, change-password and mustChangePassword (#4 + #15 merged)', () => {
  it('fresh install: the default works everywhere, so the change screen is shown', async () => {
    expect(await checkPassword('123456')).toBe(true);
    // hasCustomPassword=false ⇒ the UI forces the first-run change…
    expect(await hasCustomPassword()).toBe(false);
    // …and that screen submits 123456 as the current password, which must succeed.
    await expect(changePassword('123456', 'my-real-password')).resolves.toBeUndefined();
  });

  it('override configured: the default is refused, so nothing asks to change it', async () => {
    cfg.initialPassword = 'recovery'; // override active

    // Login path is hardened: the default is refused (#4 explicit + #15 policy).
    expect(await checkPassword('123456', { allowDefault: false })).toBe(false);
    // …and refused as a "current password" too: under an override 123456 is not a
    // credential at all, so accepting it here would contradict #15's shared
    // condition and re-open the same hole behind requireAuth.
    expect(await checkPassword('123456')).toBe(false);

    // Consequence: the instance counts as "off the default", so the UI does not
    // demand a change to a password that no longer works (PR #15).
    expect(await hasCustomPassword()).toBe(true);

    // A deliberate change still works — the override is the current password.
    await expect(changePassword('recovery', 'my-real-password')).resolves.toBeUndefined();
  });
});
