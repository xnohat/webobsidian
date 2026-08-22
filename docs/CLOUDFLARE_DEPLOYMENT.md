# Cloudflare Workers deployment

The contribution editor supports both Netlify Functions and Cloudflare Workers. Both
adapters call the same request handlers under `netlify/lib`, so authentication, GitHub
access, path validation, and pull-request behavior remain identical.

The first submission for a document creates a pull request. When a Markdown document is
opened, the editor queries GitHub for a pull request that changed that path. This makes
open contributions discoverable on another browser or device without relying on
`localStorage`. The status bar links directly to the matching GitHub pull request and
refreshes when the window regains focus or after one minute.

After a pull request is merged, its saved association is removed automatically. A local
draft is also removed when it still matches the exact content submitted from that
browser. If the draft contains newer edits, the editor preserves it. Closed, unmerged
pull requests keep their local drafts.

Pull requests created before this tracking feature can be selected from the submission
dialog. The API lists only open `contrib/YYYYMMDD-xxxxxxxx` branches owned by the
configured fork and targeting the staging branch, then verifies the selected pull
request again before adding a commit.

## Prerequisites

- Node.js 20 or newer
- Wrangler 4.36 or newer
- A Cloudflare account
- A GitHub token owned by the `cherryLucas` contribution account

The GitHub token must be able to create branches and commits in
`cherryLucas/USC-wiki`, and open pull requests against
`hzxyayaya/USC-wiki:contributions`.

## Public access

This deployment sets `PUBLIC_EDITOR=true` in `wrangler.jsonc`. Visitors enter the editor
without a password or session cookie and can submit changes through the configured
GitHub contribution account. Server-side validation still limits changes to Markdown
under `docs/**`, targets pull requests at `contributions`, and never writes directly to
`main`. Contribution POST requests remain rate-limited.

Remove `PUBLIC_EDITOR` (or set it to `false`) to restore password authentication for a
different deployment.

## Local development

Copy `.dev.vars.example` to `.dev.vars` and set the GitHub token:

```text
GITHUB_TOKEN=...
```

The checked-in public mode does not use `EDITOR_PASSWORD` or `SESSION_SECRET`. Never
commit `.dev.vars`.

Build the contribution-mode frontend and start the local Worker:

```powershell
npm run build:contribution
wrangler dev
```

## Production secrets

The repository owner, fork owner, repository, and staging branch are non-secret values
stored in `wrangler.jsonc`. Store credentials only as encrypted Worker secrets:

```powershell
wrangler secret put GITHUB_TOKEN
```

## Deploy

```powershell
npm run build:contribution
wrangler deploy
```

After deployment, verify the configuration without exposing secret values:

```powershell
curl.exe https://YOUR-WORKER.workers.dev/api/health
```

The response should report both `githubConfigured` and `authConfigured` as `true`.

## Automatic deployment from GitHub

The `deploy-cloudflare.yml` workflow verifies and deploys the editor whenever the
`cloudflare-production` branch changes. Neither `main` nor feature branches deploy
automatically.

Add these repository Actions secrets under **Settings → Secrets and variables →
Actions**:

- `CLOUDFLARE_API_TOKEN`: an API token created from Cloudflare's **Edit Cloudflare
  Workers** template and restricted to the deployment account.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID that owns `usc-wiki-editor`.

The application secret (`GITHUB_TOKEN`) stays on the Worker and is preserved by
deployments. Do not copy it into the GitHub workflow. Existing password/session secrets
may remain stored but are ignored while `PUBLIC_EDITOR=true`.

After reviewing a release, promote the exact tested commit without merging it into
`main`:

```powershell
git push origin codex/update-contribution-pr:cloudflare-production
```

That push starts verification and deploys only if every check succeeds.

## Routing and rate limits

- `/api/*` and `/auth/*` run through `cloudflare/worker.ts` first.
- Other requests are served from `server/public` with SPA fallback to `index.html`.
- Unknown API routes return JSON `404`, never the SPA document.
- Password-protected deployments limit login to 5 requests per minute per source
  address and Cloudflare location. Public mode does not call the login endpoint.
- Contribution submission is limited to 10 requests per minute per source address and
  Cloudflare location.

The rate-limit namespace identifiers in `wrangler.jsonc` must be unique within the
Cloudflare account. Change `41001` and `41002` if those identifiers are already used by
another Worker.
