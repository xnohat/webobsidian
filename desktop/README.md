# WebObsidian Desktop (Electron)

Packages WebObsidian as an installable desktop app for **macOS / Windows / Linux**
(arm64 · x64 · ia32). It is a thin **Electron shell** around the unchanged
`server/` (Express) + `web/` (SPA): the shell spawns the server as a child process
bound to `127.0.0.1` on a random free port and loads it in a `BrowserWindow`.

Because the server has **no runtime native modules**, the whole server is bundled
into a single `.mjs` with esbuild, and every CPU arch is produced just by packing
the matching prebuilt Electron binary — no cross-compilation, no `node-gyp`.

## How it works

- **First launch** prompts for a vault folder (default `~/Documents/WebObsidianVault`).
- App data (`settings.json`, search index) lives in Electron's per-user `userData` dir.
- A random per-install password is generated, passed to the server as
  `WEBOBSIDIAN_PASSWORD`, and used to **auto-login** — no password prompt.
  _Fork note:_ because that secret counts as configured, the well-known default `123456` is never
  valid on the desktop's loopback server (auth hardening in this fork). The desktop **bundles the
  server**, so it also carries every merged upstream PR listed in
  [`docs/UPSTREAM_PR_MERGES.md`](../docs/UPSTREAM_PR_MERGES.md).
- Menu **File → Switch Vault…** changes the vault (relaunches to re-index);
  **Open Vault/Data Folder** and **Open Logs** help debugging.
- Git sync needs `git` on the machine; without it the app still works for local editing.

## Build locally

From the **repo root** (builds web + server first, then the desktop app):

```bash
npm install
npm run desktop          # build everything + launch the app (dev)
npm run desktop:dist     # build installers for THIS platform → desktop/release/
```

Or directly inside `desktop/` (assumes `npm run build` already ran at the root):

```bash
npm run build        # esbuild: dist/ (main+preload) + .gen/server/ (server bundle + SPA)
npm start            # launch with the already-built bundle
npm run dist         # electron-builder → installers in desktop/release/
npm run dist:dir     # fast unpacked build (no installer), for smoke testing
```

> Note: this environment may export `ELECTRON_RUN_AS_NODE=1` globally (Electron then
> behaves as plain Node and `require('electron')` returns a path). When launching
> Electron by hand, clear it: `env -u ELECTRON_RUN_AS_NODE electron dist/main.js`.
> Packaged apps are unaffected. The shell sets `ELECTRON_RUN_AS_NODE=1` only for the
> server child it spawns.

## Releasing (GitHub Releases)

CI workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) runs on
a version tag and builds on three native runners in parallel:

Enable GitHub Actions in the fork before releasing. The publish target in
`desktop/package.json` is `lakylekidd/webobsidian`; the workflow uses the fork's
`GITHUB_TOKEN` with `contents: write`, so no personal access token is needed.

Following the v0.1.1 release convention, bump both the root and desktop versions
(the private server/web workspace versions remain unchanged), commit the release
changes, and push an annotated tag matching the desktop version:

```bash
npm version 0.1.2 --no-git-tag-version
npm version 0.1.2 --workspace desktop --no-git-tag-version
npm run typecheck
npm --workspace desktop run typecheck
npm run build
npm --workspace desktop run build
git add package.json package-lock.json desktop/package.json README.md desktop/README.md IMPLEMENTATION_PLAN.md
git commit -m "chore(release): v0.1.2"
git tag -a v0.1.2 -m "WebObsidian v0.1.2"
git push origin main
git push origin v0.1.2
```

Each runner (macOS/Windows/Ubuntu) packages its platform's installers and uploads
them to a **draft** GitHub Release for the tag. When all three finish, open the draft
release at [the fork's Releases page](https://github.com/lakylekidd/webobsidian/releases),
add release notes, and click **Publish**. For v0.1.2, the changes since v0.1.1 are
the dark-mode text contrast and editor cursor fixes (#19), plus fork release metadata
and documentation.

Artifacts:

| Platform | Formats | Arch |
|----------|---------|------|
| macOS    | `.dmg`, `.zip`         | arm64, x64 |
| Windows  | NSIS `.exe`, portable `.exe` | x64, arm64, ia32 |
| Linux    | `.AppImage`, `.deb`    | x64, arm64 |

The apps are **not code-signed/notarized**, so users will see a Gatekeeper /
SmartScreen warning on first launch (expected for a free self-hosted build).
