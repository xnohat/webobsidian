# Plugin runtime validation and deployment record

Date: 2026-10-30. Status: implemented; isolated validation recorded below.

## Fixture and boundaries

Read-only snapshots of four reference plugin versions were copied into gitignored
`.superpowers/sdd/2026-10-30-plugin-runtime-fixes/fixtures`. Their manifests, main
JavaScript and optional CSS were copied; data.json, desktop enable preferences,
user notes and production credentials were excluded. SHA-256 inventory is stored
in the fixture directory for reproducibility.

| Id | Version | main.js bytes |
|---|---|---:|
| advanced-canvas | 6.0.0 | 368265 |
| automatic-table-of-contents | 1.8.0 | 9307 |
| editing-toolbar | 3.2.7 | 668076 |
| templater-obsidian | 2.18.1 | 339564 |

The original diagnosis used a synthetic plugin under production-equivalent CSP.
It reproduced EvalError/blocked eval; a control without CSP loaded the plugin.
A 401 HTML asset was misclassified as incompatible API. See the earlier review
document and its diagnostic evidence for that baseline.

## Compiler validation

All four real main.js files passed `compilePluginModule` using Node vm.Script as
a syntax-only parser and producing an ESM default factory. Their code was not
executed on the server. This approach is a recorded implementation ruling: it
avoids adding an esbuild native runtime dependency while retaining syntax
validation and same-origin module loading under the existing CSP.

Command: `node --import tsx .superpowers/sdd/2026-10-30-plugin-runtime-fixes/compile-fixtures.mjs`.

## Isolated browser validation

The actual new loadPlugins/manager/shim ran in a sandboxed Electron browser with
Node integration disabled, context isolation enabled, production-equivalent CSP
and all requests outside the local fixture origin blocked. The API used only a
synthetic Markdown note and canvas entry. It did not receive production cookies,
keys, settings or data.

Initial results:

| Plugin | Stage | Actual failure |
|---|---|---|
| Advanced Canvas | instantiate | unsupported-module: @codemirror/view |
| Automatic Table Of Contents | onload | unsupported-api: plugin settings tabs |
| Editing Toolbar | instantiate | unsupported-api: obsidian.moment |
| Templater | instantiate | unsupported-api: obsidian.FuzzySuggestModal (after interop correction) |

Every case had zero CSP violations, zero synthetic note writes and zero remaining
command registrations after stop. None reached its feature action, so none is
claimed compatible. An initial Templater probe caught __esModule packaging metadata being mistaken
for a missing API. The interop flag was corrected. A second probe exposed a
TypeError from a copied module namespace losing missing-export diagnostics;
throwing enumerable capability descriptors now expose the real limitation,
obsidian.FuzzySuggestModal. The final four-plugin run reports the table above.
No real plugin feature action completed, so no full plugin is claimed supported.

Command: `node .superpowers/sdd/2026-10-30-plugin-runtime-fixes/real-browser-probe.mjs`.
Evidence JSON and the fixture runner remain in the gitignored task workspace.

## Functional synthetic-plugin browser regression

`web/tests/pluginApiBrowser.test.ts` passes in an isolated sandboxed Electron
browser using the real shim and registration registry. It verifies a command
callback executes, a Markdown processor changes the DOM, unload removes both,
Setting.setValue().onChange() drives a real input, Markdown filtering and missing
lookup work, and plugin data survives a new instance. Writes require the captured
vault scope. Create-existing uses baseVersion empty and fails without overwriting;
read then external edit then modify fails with 409. Re-reading the same TFile with
a changed version is rejected rather than replacing its unconsumed pin; an
explicit fresh TFile/read can then modify using the new version.

This verifies actual actions of the supported API subset; it does not substitute
for the real-plugin limitations in the matrix.

## Final validation and independent review

Parent-coordinated release gates: server **283 passed / 10 skipped** (38 files),
web **417 passed**, MCP **3 passed**; workspace typechecks, full build and desktop
bundle build passed. Windows-skipped symlink behavior was additionally exercised
in the Linux release preflight.

The server code was reviewed independently by the validation agent; the browser
code was reviewed independently by the server agent. Server review found two
material diagnostic integration issues: broken enabled bundles disappeared from
the catalog, and compile errors could be shown as plain HTTP errors. Broken
entries now retain sanitized availability errors, and the web loader recognizes
the compiler error prefix as syntax. A missing enabled entry can be disabled.

The final real-plugin browser matrix was repeated using the exact copied manifest
metadata as well as exact main.js bytes. All four limitations remained as in the
table, with zero CSP violations, zero synthetic note writes, and zero remaining
commands after cleanup. No tested real plugin is claimed functionally compatible.
