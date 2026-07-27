import { config } from '../config.js';

/**
 * The built-in default password (`123456`) is only accepted when NO other
 * credential has been configured.
 *
 * This condition previously looked at `userPasswordHash` alone, so an instance
 * that set `WEBOBSIDIAN_PASSWORD` (or a hand-edited `auth.passwordHash`) and
 * never opened the UI still accepted `123456` as a full owner session, which is
 * exactly the deployment path `.env.example` ("Initial master password") and
 * `docker-compose.yml` document.
 *
 * It lives in its own module because two places must share one condition:
 *  - `checkPassword()`: is the default accepted?
 *  - `hasCustomPassword()` -> `mustChangePassword`: must the user change it?
 *
 * Those two drifting apart is the root of the bug. Keeping a single function
 * also guarantees we never force a change to a default that no longer works:
 * the ForceChangePassword screen submits `changePassword('123456', ...)`, which
 * would fail if the two conditions disagreed.
 *
 * Takes just the two hashes rather than `Settings` so this module never imports
 * `settings.ts`, which would create an import cycle.
 */
export function isDefaultPasswordActive(auth: {
  userPasswordHash: string;
  passwordHash: string;
}): boolean {
  return !auth.userPasswordHash && !auth.passwordHash && !config.initialPassword;
}
