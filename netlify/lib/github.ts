import type { EditorConfig } from './config.js';

const GITHUB_API = 'https://api.github.com';

interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

export interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
}

export interface ContributionFile {
  path: string;
  content: string;
}

export interface CreateContributionInput {
  title: string;
  contributorName: string;
  files: ContributionFile[];
  branch?: string;
}

export interface CreatedContribution {
  action: 'created' | 'updated';
  branch: string;
  commitSha: string;
  pullNumber: number;
  pullUrl: string;
}

export interface ContributionReview {
  branch: string;
  pullNumber: number;
  pullUrl: string;
  title: string;
  status: 'open' | 'merged' | 'closed';
  updatedAt: string;
}

function pullBody(config: EditorConfig, input: CreateContributionInput, branch: string): string {
  const fileMarker = encodeURIComponent(JSON.stringify(input.files.map((file) => file.path)));
  return [
    '由 USC-Wiki 网页投稿编辑器创建。',
    '',
    `实际投稿人：${input.contributorName}`,
    `投稿分支：\`${config.forkOwner}:${branch}\``,
    `投稿文件：${input.files.map((file) => `\`${file.path}\``).join('、')}`,
    '',
    '审核通过后请合并到 `contributions`；本 PR 不直接进入 `main`。',
    '',
    `<!-- usc-wiki-editor-files:${fileMarker} -->`,
  ].join('\n');
}

function contributionFilesFromBody(body: string | null): string[] | null {
  const marker = body?.match(/<!-- usc-wiki-editor-files:([^\s]+) -->/);
  if (!marker) return null;
  try {
    const value = JSON.parse(decodeURIComponent(marker[1])) as unknown;
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
  } catch {
    return null;
  }
}

function repoPath(ownerName: string, repoName: string, suffix: string): string {
  const owner = encodeURIComponent(ownerName);
  const repo = encodeURIComponent(repoName);
  return `/repos/${owner}/${repo}${suffix}`;
}

function encodeRef(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/');
}

export async function githubRequest(
  config: EditorConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('accept', headers.get('accept') ?? 'application/vnd.github+json');
  headers.set('authorization', `Bearer ${config.githubToken}`);
  headers.set('x-github-api-version', '2022-11-28');
  headers.set('user-agent', 'usc-wiki-contribution-editor');

  const response = await fetch(`${GITHUB_API}${path}`, { ...init, headers });
  if (response.ok) return response;

  let message = `GitHub API request failed (${response.status})`;
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) message = `${message}: ${body.message}`;
  } catch {
    // Keep the status-only message and never include credentials or request headers.
  }
  throw new Error(message);
}

export async function getStagingTree(config: EditorConfig): Promise<GitHubTreeResponse> {
  const branch = encodeURIComponent(config.stagingBranch);
  const response = await githubRequest(
    config,
    repoPath(config.upstreamOwner, config.repo, `/git/trees/${branch}?recursive=1`),
  );
  return response.json() as Promise<GitHubTreeResponse>;
}

export async function getStagingMarkdown(config: EditorConfig, path: string): Promise<string> {
  return (await getStagingFile(config, path)).text();
}

export async function getStagingFile(config: EditorConfig, path: string): Promise<Response> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const ref = encodeURIComponent(config.stagingBranch);
  const response = await githubRequest(
    config,
    repoPath(config.upstreamOwner, config.repo, `/contents/${encodedPath}?ref=${ref}`),
    { headers: { accept: 'application/vnd.github.raw+json' } },
  );
  return response;
}

export async function listContributions(
  config: EditorConfig,
  path?: string,
): Promise<ContributionReview[]> {
  const query = new URLSearchParams({
    state: path ? 'all' : 'open',
    base: config.stagingBranch,
    per_page: '100',
    sort: 'updated',
    direction: 'desc',
  });
  const pulls = await githubJson<Array<{
    number: number;
    html_url: string;
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    merged_at: string | null;
    updated_at: string;
    head: { ref: string; repo: { owner: { login: string } } | null };
  }>>(config, repoPath(config.upstreamOwner, config.repo, `/pulls?${query}`));

  const candidates = pulls.filter(
    (pull) => pull.head.repo?.owner.login.toLowerCase() === config.forkOwner.toLowerCase()
      && /^contrib\/\d{8}-[a-f0-9]{8}$/.test(pull.head.ref),
  );
  const matches = await Promise.all(candidates.map(async (pull) => {
    let files = contributionFilesFromBody(pull.body);
    if (path && !files) {
      const changedFiles = await githubJson<Array<{ filename: string }>>(
        config,
        repoPath(config.upstreamOwner, config.repo, `/pulls/${pull.number}/files?per_page=100`),
      );
      files = changedFiles.map((file) => file.filename);
    }
    if (path && !files?.includes(path)) return null;
    return {
      branch: pull.head.ref,
      pullNumber: pull.number,
      pullUrl: pull.html_url,
      title: pull.title,
      status: pull.merged_at ? 'merged' as const : pull.state,
      updatedAt: pull.updated_at,
    };
  }));
  return matches.filter((review): review is ContributionReview => review !== null);
}

async function githubJson<T>(
  config: EditorConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  const response = await githubRequest(config, path, { ...init, headers });
  return response.json() as Promise<T>;
}

export async function createContribution(
  config: EditorConfig,
  input: CreateContributionInput,
  branch: string,
): Promise<CreatedContribution> {
  const upstream = (suffix: string) => repoPath(config.upstreamOwner, config.repo, suffix);
  const fork = (suffix: string) => repoPath(config.forkOwner, config.repo, suffix);

  const baseRef = await githubJson<{ object: { sha: string } }>(
    config,
    upstream(`/git/ref/heads/${encodeRef(config.stagingBranch)}`),
  );
  const baseSha = baseRef.object.sha;
  const baseCommit = await githubJson<{ tree: { sha: string } }>(
    config,
    upstream(`/git/commits/${encodeURIComponent(baseSha)}`),
  );

  await githubJson(
    config,
    fork('/git/refs'),
    {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    },
  );

  const tree = await githubJson<{ sha: string }>(
    config,
    fork('/git/trees'),
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseCommit.tree.sha,
        tree: input.files.map((file) => ({
          path: file.path,
          mode: '100644',
          type: 'blob',
          content: file.content,
        })),
      }),
    },
  );

  const commit = await githubJson<{ sha: string }>(
    config,
    fork('/git/commits'),
    {
      method: 'POST',
      body: JSON.stringify({
        message: `docs: ${input.title}`,
        tree: tree.sha,
        parents: [baseSha],
      }),
    },
  );

  await githubJson(
    config,
    fork(`/git/refs/heads/${encodeRef(branch)}`),
    {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    },
  );

  const pull = await githubJson<{ number: number; html_url: string }>(
    config,
    upstream('/pulls'),
    {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        head: `${config.forkOwner}:${branch}`,
        base: config.stagingBranch,
        body: pullBody(config, input, branch),
        maintainer_can_modify: false,
      }),
    },
  );

  return {
    action: 'created',
    branch,
    commitSha: commit.sha,
    pullNumber: pull.number,
    pullUrl: pull.html_url,
  };
}

export async function updateContribution(
  config: EditorConfig,
  input: CreateContributionInput,
  branch: string,
): Promise<CreatedContribution> {
  const upstream = (suffix: string) => repoPath(config.upstreamOwner, config.repo, suffix);
  const fork = (suffix: string) => repoPath(config.forkOwner, config.repo, suffix);
  const query = new URLSearchParams({
    state: 'open',
    head: `${config.forkOwner}:${branch}`,
    base: config.stagingBranch,
  });
  const pulls = await githubJson<Array<{ number: number; html_url: string }>>(
    config,
    upstream(`/pulls?${query}`),
  );
  if (pulls.length !== 1) {
    throw new Error('No matching open contribution PR was found; create a new contribution instead');
  }

  const branchRef = await githubJson<{ object: { sha: string } }>(
    config,
    fork(`/git/ref/heads/${encodeRef(branch)}`),
  );
  const headSha = branchRef.object.sha;
  const headCommit = await githubJson<{ tree: { sha: string } }>(
    config,
    fork(`/git/commits/${encodeURIComponent(headSha)}`),
  );
  const tree = await githubJson<{ sha: string }>(config, fork('/git/trees'), {
    method: 'POST',
    body: JSON.stringify({
      base_tree: headCommit.tree.sha,
      tree: input.files.map((file) => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        content: file.content,
      })),
    }),
  });
  const commit = await githubJson<{ sha: string }>(config, fork('/git/commits'), {
    method: 'POST',
    body: JSON.stringify({
      message: `docs: ${input.title}`,
      tree: tree.sha,
      parents: [headSha],
    }),
  });
  await githubJson(config, fork(`/git/refs/heads/${encodeRef(branch)}`), {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  const pull = pulls[0];
  await githubJson(config, upstream(`/pulls/${pull.number}`), {
    method: 'PATCH',
    body: JSON.stringify({
      title: input.title,
      body: pullBody(config, input, branch),
    }),
  });

  return {
    action: 'updated',
    branch,
    commitSha: commit.sha,
    pullNumber: pull.number,
    pullUrl: pull.html_url,
  };
}
