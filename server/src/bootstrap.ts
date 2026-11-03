import { loadSettings as _load, getSettings } from './services/settings.js';
import { config } from './config.js';
import { effectiveOverridePassword } from './services/password-policy.js';

export { getSettings };

export async function loadSettings() {
  return _load();
}

/**
 * WEBOBSIDIAN_PASSWORD is no longer written to settings.json; it's used as an
 * override (recovery) password, checked directly at login. The default login
 * password is 123456. We only log here to signal the override is active.
 */
export async function setPasswordIfInitial(): Promise<void> {
  if (effectiveOverridePassword(config.initialPassword)) {
    console.log('[boot] WEBOBSIDIAN_PASSWORD active as recovery/override password');
  } else if (config.initialPassword) {
    console.warn('[boot] Legacy default WEBOBSIDIAN_PASSWORD ignored as a recovery override; choose a private password to enable recovery.');
  }
}
