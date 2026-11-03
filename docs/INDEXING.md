# Indexing and external file changes

WebObsidian maintains a server-side cache of full-text search, tags, properties,
tasks, links and file names. Markdown files remain the source of truth. The cache
is independent of Obsidian's IndexedDB and `.obsidian` configuration.

If changes appear correctly in WebObsidian but the ordinary Obsidian desktop app
only notices them after a restart, see [shared Synology/SMB vault troubleshooting](OBSIDIAN_NETWORK_VAULTS.md).
The SMB Vault Watcher plugin described there runs in Obsidian; the settings below
control the WebObsidian server.

## Startup and freshness

The HTTP service starts before indexing finishes. A compatible
`DATA_DIR/vault-index-v1.json` snapshot restores the previous index, then a
background inventory checks current file paths and metadata. Unchanged Markdown
bodies are not read for this initial metadata check. Changed files are read,
hashed with SHA-256, and parsed only when their content changed. Renames still
update path-dependent titles and links.

Web search can show cached preliminary results while changes are checked. A first
launch or unusable cache requires an initial build. Search-dependent operations
return `503 INDEX_NOT_READY` until ready, instead of reporting an authoritative
empty result. Direct file reading can remain available. Search, tags and backlinks
through the Agent API and both MCP transports use the same index.

The previous `qmd-index.json` is not trusted as a complete snapshot. The first
launch of the new cache builds a fresh snapshot; keep the old file for rollback.
An empty vault is valid. A damaged cache or one for a different vault/schema is
rebuilt. A snapshot stores derived data and file hashes, not another full copy of
all Markdown bodies. Treat DATA_DIR and its backups as private vault data.

## Watcher and reconciliation

```dotenv
WEBOBSIDIAN_WATCH=polling
WEBOBSIDIAN_RECONCILE_INTERVAL_MS=60000
WEBOBSIDIAN_HASH_AUDIT_INTERVAL_MS=1800000
```

Use `polling` for NFS/SMB: writes from a different client may not emit native
notifications. Polling checks Markdown every 1000 ms and binary file metadata
every 3000 ms. NAS metadata caching can add seconds of delay. `auto` uses native
watching and falls back to polling on ENOSPC/EMFILE; it does not detect that a
filesystem is a network mount.

Watcher events and successful web/agent writes enter the same queue. Repeated
events are coalesced; indexing reads the current file rather than trusting the
order of old add/change/delete events. Metadata reconciliation runs every minute
by default and recovers missed events. A background hash audit every 30 minutes
also detects changed contents whose file metadata did not change. These are check
intervals, not guaranteed maximum visibility delays: scan time, a busy queue and
NAS caching add latency. Hashes do not make reading files free; auditing every
file still reads all Markdown bytes.

Retries and later checks retain the previous successful entry after read errors.
An incomplete inventory must not be treated as an empty vault. Missing entries
are confirmed before removal, with an additional delay for mass disappearance.
An unavailable NAS, a permissions error and an accidentally empty mount can look
similar. The application cannot prove that a responsive empty mount is the
intended NAS; monitor the mount at the host level as well.

Automatic MiniSearch vacuum remains disabled because of a previously observed
crash. Periodic full rebuilding removes discarded terms after sustained edit/delete
activity. Rebuilds publish a replacement generation while retaining previous
results; they require temporary extra memory. Existing container/heap limits must
be verified on the intended vault before deployment.

## Status and manual repair

Settings → **Vault & Files → Search index** shows readiness, note count, watcher
mode, pending changes and the last successful check. **Check for changes** requests
reconciliation; **Rebuild index** requests a complete rebuild. Search refreshes
automatically after published index changes and after reconnecting, including
highlight snippets. A network/index error is shown separately from zero results.

Session-authenticated endpoints:

| Endpoint | Result |
| --- | --- |
| `GET /api/index/status` | Phase, generation/revision, availability, queue/counts, timestamps and error indicators |
| `POST /api/index/jobs` with `{"mode":"reconcile"}` or `{"mode":"rebuild"}` | `202 {"jobId":"…"}`; equivalent running jobs are coalesced |
| `POST /api/reindex` | Compatibility operation: waits for rebuild, then returns `{"ok":true}` |

Phases are `starting`, `reconciling`, `ready`, `rebuilding`, and `degraded`.
`available` means a published index exists. `initialScanComplete` additionally
means this process has successfully checked the vault; it is never blindly
restored from disk. `degraded` or `persistenceError` needs attention even when
cached search results remain available. `/healthz` checks the process, not index
freshness. WebSocket `index` messages carry status after index changes.

For Perplexity, an `INDEX_NOT_READY` tool error means retry after indexing has
finished, not that the requested note does not exist. A degraded status means
results may be outdated. Example: “Use WebObsidian to search for an example note. If the index
is not ready, report that explicitly. Read the matching note by its exact path.”

## Reproducible measurements

Run `npm --workspace server run build`, then
`node scripts/indexing-benchmark.mjs --compiled` from the repository to measure
the production JavaScript. Without `--compiled`, it runs source through tsx and
includes its loader overhead. It creates only its
own temporary synthetic vault, runs cold/warm and edit/delete churn checks under
a 256 MiB Node heap limit, reports HTTP latency, read counts, peak RSS and timings,
and removes the fixture. Its HTTP probe checks event-loop responsiveness during
indexing; it is not an end-to-end reverse-proxy or real-NAS measurement. The
default dataset is 10,000 × 4 KiB plus 100 × 128 KiB Markdown files. Repeat on the
target NAS before deployment; local disk numbers do not establish NFS latency.
