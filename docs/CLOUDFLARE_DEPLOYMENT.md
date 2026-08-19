# Cloudflare Workers deployment

The contribution editor supports both Netlify Functions and Cloudflare Workers. Both
adapters call the same request handlers under `netlify/lib`, so authentication, GitHub
access, path validation, and pull-request behavior remain identical.

The first submission for a document creates a pull request. The browser remembers that
contribution branch locally, so later submissions add commits to the same open pull
request. Clear the saved contribution from the submission dialog after the pull request
is merged or closed to begin a new review.

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

## Local development

Copy `.dev.vars.example` to `.dev.vars` and fill in the three secrets:

```text
GITHUB_TOKEN=...
EDITOR_PASSWORD=...
SESSION_SECRET=...
```

`EDITOR_PASSWORD` must contain at least 8 characters. `SESSION_SECRET` must contain at
least 32 characters. Never commit `.dev.vars`.

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
wrangler secret put EDITOR_PASSWORD
wrangler secret put SESSION_SECRET
```

Generate a session secret in PowerShell if needed:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
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
`cloudflare-production` branch changes. It can also be started manually from the
GitHub Actions page. Neither `main` nor feature branches deploy automatically.

Add these repository Actions secrets under **Settings → Secrets and variables →
Actions**:

- `CLOUDFLARE_API_TOKEN`: an API token created from Cloudflare's **Edit Cloudflare
  Workers** template and restricted to the deployment account.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID that owns `usc-wiki-editor`.

The application secrets (`GITHUB_TOKEN`, `EDITOR_PASSWORD`, and `SESSION_SECRET`) stay
on the Worker and are preserved by deployments. Do not copy them into the GitHub
workflow.

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
- Login is limited to 5 requests per minute per source address and Cloudflare location.
- Contribution submission is limited to 10 requests per minute per source address and
  Cloudflare location.

The rate-limit namespace identifiers in `wrangler.jsonc` must be unique within the
Cloudflare account. Change `41001` and `41002` if those identifiers are already used by
another Worker.
