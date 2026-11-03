# Community plugins in WebObsidian

WebObsidian exposes a limited browser implementation of the Obsidian API. A
plugin being installed or enabled does not prove that its features work. The
Community Plugins settings show the runtime state and a failure stage/reason.

## Execution and isolation

The loader imports an authenticated same-origin ESM module containing a CommonJS
factory. The server checks JavaScript syntax without executing plugin code. The
main page retains its CSP without `unsafe-eval`. A plugin's own use of dynamic
execution can still be blocked by CSP.

This runtime executes trusted installed JavaScript in the application page; it is
not a sandbox. It does not grant Node.js, Electron, server command execution, or
automatic access to unsupported CodeMirror/internal Obsidian APIs. Unknown modules
and unsupported operations fail explicitly rather than silently succeeding.

The implementation uses Node's `vm.Script` only to parse the wrapper. No
`runInContext`, `runInNewContext`, or `runInThisContext` executes plugin code on the
server. This replaces the plan's proposed esbuild parser and avoids a new native
production dependency; the browser receives ordinary JavaScript module syntax.

## Code and settings

Existing `.obsidian/plugins` bundles can be discovered for reading. New web
installations and versioned updates live in DATA_DIR per vault/plugin, separately
from the desktop installation. Web plugin settings also live in DATA_DIR; saving
them does not overwrite the desktop plugin's `data.json`. Keep DATA_DIR backups
private because they can include plugin settings.

Enable/disable preferences are WebObsidian settings, not Obsidian's desktop
`community-plugins.json`. The web runtime must unload registered resources on
disable, logout and vault change. Plugin writes use the same content-version
conflict protection as the editor; create must not overwrite an existing note.

## Compatibility evidence

Reference plugin versions were tested read-only on 2026-10-30. Only
manifest/main/CSS files were copied; no user notes or plugin `data.json` were used.
The isolated browser uses synthetic notes, a local origin, no production session,
and no Node/Electron privileges. Compilation is tested separately from execution.

| Plugin | Version | Static dependencies beyond `obsidian` | Feature validation |
|---|---|---|---|
| Advanced Canvas | 6.0.0 | `@codemirror/view` | Unsupported: `@codemirror/view` during module initialization |
| Automatic Table Of Contents | 1.8.0 | None found in literal `require` calls | Unsupported: plugin settings-tab registration during onload |
| Editing Toolbar | 3.2.7 | None found in literal `require` calls | Unsupported: `obsidian.moment` during module initialization |
| Templater | 2.18.1 | `util`, `child_process`, `@codemirror/language`, `@codemirror/state` | Unsupported: `obsidian.FuzzySuggestModal` during module initialization |

All four parse as ESM factories with the new compiler. That is a syntax result,
not a claim that onload or their features work. A literal require can be in an
unreached conditional branch; static dependency discovery alone does not prove a
runtime failure. Detailed measured results are recorded in
[the validation report](superpowers/plans/2026-10-30-plugin-runtime-validation.md).

No tested real plugin reached its feature action in this initial matrix. The browser reported no CSP violations, performed no synthetic note writes, and retained no command registrations after cleanup. This records explicit limitations rather than claiming that TOC, toolbar, Canvas or templates work.

## Built-in code viewer

WebObsidian includes a CodeMirror-based viewer inspired by Code File Viewer. This does not implement `TextFileView`, `registerExtensions` or `loadPrism`, and does not make the original Obsidian plugins compatible. The format list is adapted from [qojis/obsidian-code-file-viewer main.ts](https://github.com/qojis/obsidian-code-file-viewer/blob/69a928b413af492259179c3911dd409a34f61670/main.ts) (Unlicense); the rendering uses existing WebObsidian CodeMirror components.
