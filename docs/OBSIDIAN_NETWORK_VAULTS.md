# Obsidian does not refresh a shared Synology / SMB vault

When WebObsidian and the Obsidian desktop app use the same NAS folder, a change
can reach disk without appearing in the desktop app until it is restarted.
The **SMB Vault Watcher** community project provides periodic reconciliation
for shared-folder changes, including updates to an already open note.

Plugin source and upstream instructions:
[moorej2400/obsidian-smb-watcher](https://github.com/moorej2400/obsidian-smb-watcher).

## Symptoms and scope

Typical symptoms:

- A note deleted in WebObsidian remains in Obsidian's file explorer.
- New or renamed files appear only after restarting Obsidian.
- An open note continues to display its old text after an external save.

First check the actual shared folder with the OS file manager. If the change is
already on disk and restarting Obsidian makes it visible, the desktop client's
file observation or cache refresh is the likely issue. If the file on disk has
not changed, investigate the server mount or synchronization path first.

A possible arrangement is WebObsidian accessing a NAS folder through NFS
and Windows Obsidian opening the same folder over SMB, for example
`\\nas\obsidian\vaults`. These findings do not mean every network vault has the
same fault.

WebObsidian and Obsidian maintain separate indexes. Setting
`WEBOBSIDIAN_WATCH=polling` affects the **WebObsidian server** only; it does not
refresh the ordinary Obsidian client. See [server indexing](INDEXING.md) if changes
are missing in the web app instead.

## Watcher diagnostics and reconciliation

Record native filesystem watcher errors when diagnosing stale views. A closed
watcher, delayed metadata and an unchanged editor view are separate symptoms;
receiving a native event alone does not prove the editor has reconciled the file.

SMB Vault Watcher periodically compares disk metadata with Obsidian's cached
state and asks Obsidian to reconcile changed paths. It refreshes an existing
vault; it does not copy notes between devices or provide a synchronization server.

## Install in the Obsidian desktop app

The version referenced by this guide is **0.1.0**, upstream commit
[`33493007b8c8053da250db6c9f7ef84785f0157c`](https://github.com/moorej2400/obsidian-smb-watcher/tree/33493007b8c8053da250db6c9f7ef84785f0157c).
This guide uses manual installation; inclusion in Obsidian's built-in community
catalog was not verified.

1. Obtain `main.js` and `manifest.json` from the upstream project. For the exact
   tested version, build it in a separate source directory with Node.js and npm:

   ```sh
   git clone https://github.com/moorej2400/obsidian-smb-watcher.git
   cd obsidian-smb-watcher
   git checkout 33493007b8c8053da250db6c9f7ef84785f0157c
   npm ci --ignore-scripts
   npm test
   npm run build
   ```

2. Close Obsidian and copy **only `main.js` and `manifest.json`** into
   `<vault>/.obsidian/plugins/smb-watcher/`. Use your vault's configured
   configuration-folder name if it differs from `.obsidian`.
3. Open the vault in Obsidian. In **Settings → Community plugins**, enable
   community plugins if needed, then enable **SMB Vault Watcher**.
4. Review other watcher workarounds before enabling multiple reconciliation mechanisms.

Install this plugin in **ordinary Obsidian**, not WebObsidian's plugin interface.
Its files and enabled-plugin list live in the vault configuration folder, so a
shared or synchronized configuration can make it available to other desktop
clients too.

## Settings and expected delay

Start with the upstream defaults:

| Setting | Default |
|---|---|
| Full vault scan | Enabled, every 15 seconds |
| Active file check | Every 3 seconds |
| Mass-deletion guard | 25% |
| Change notifications and status-bar indicator | Enabled |

These are polling intervals, **not maximum update delays**. Scanning time and
filesystem caching can add latency. Lowering intervals increases NAS work and
does not guarantee immediate updates.

The plugin also provides **SMB Vault Watcher: Scan vault now** in the command
palette. A warning about mass disappearance can indicate a disconnected mount;
check NAS access before using the separate guard-override command.

## Verify with disposable notes

1. Create a temporary Markdown note in the shared folder through WebObsidian and
   wait for it to appear in Obsidian without restarting.
2. Open that note in Obsidian. Change its text through WebObsidian, leaving the
   Obsidian editor untouched, and check that the displayed text updates.
3. Rename and delete the temporary note through WebObsidian; check the file tree.
4. Restart Obsidian once and repeat a creation/deletion check to confirm that the
   plugin starts automatically.

Use only disposable notes for these checks; verify behavior on each client and
filesystem combination instead of assuming a successful restart proves live refresh.

## Limitations and removal

- **Desktop only.** This plugin does not fix Android. Diagnose how the Android
  vault receives files from the NAS separately.
- It uses Obsidian's undocumented `reconcileFile` method. Recheck compatibility
  after Obsidian updates; the plugin reports when that method is unavailable.
- Detection compares modification time and size. Content changes preserving both
  can go unnoticed; this is not a content-hash audit.
- Dot-prefixed folders, including `.obsidian`, `.git` and `.trash`, are excluded.
  Plugin/configuration changes are not covered by the note-refresh checks.
- External renames are treated as deletion plus creation; do not rely on this
  plugin to rewrite links to renamed notes.
- Polling does not make simultaneous editing on different devices conflict-free.
  Test concurrent editing and NAS outages separately.

To stop it, disable **SMB Vault Watcher** in **Settings → Community plugins**.
You can uninstall it from the same list. Notes remain in their existing folder;
without another working watcher or reconciliation mechanism, the original stale
view behavior may return.
