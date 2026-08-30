import {
  authConfigReady,
  editorConfigReady,
  isPublicEditor,
  loadAuthConfig,
  loadEditorConfig,
  type RuntimeEnvironment,
} from './config.js';
import { createContributionBranch, validateContributionInput } from './contributions.js';
import {
  createContribution,
  getContributionFile,
  getContributionTree,
  getStagingFile,
  getStagingMarkdown,
  getStagingTree,
  listContributions,
  updateContribution,
} from './github.js';
import { json, methodNotAllowed } from './http.js';
import { assertReadableFilePath, assertReadableMarkdownPath, isImagePath } from './paths.js';
import {
  expiredSessionCookie,
  hasValidSession,
  issueSessionToken,
  passwordMatches,
  sessionCookie,
} from './session.js';
import { toVaultTree } from './tree.js';
import { allProperties, allTags, backlinksFor, contributionReadModel, graphData, matchesFor, resolveLink, searchNotes } from './read-model.js';

export async function handleHealth(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed(['GET', 'HEAD']);

  return json({
    ok: true,
    service: 'usc-wiki-contribution-editor',
    githubConfigured: editorConfigReady(env),
    authConfigured: isPublicEditor(env) || authConfigReady(env),
  });
}

export async function handleAuthStatus(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (isPublicEditor(env)) {
    return json({ passwordSet: true, mustChangePassword: false, publicAccess: true });
  }
  if (!authConfigReady(env)) {
    return json({ error: 'Editor authentication is not configured' }, { status: 503 });
  }
  return json({ passwordSet: true, mustChangePassword: false });
}

export async function handleLogin(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (isPublicEditor(env)) return json({ ok: true, mustChangePassword: false });

  try {
    const { password } = (await request.json()) as { password?: unknown };
    const config = loadAuthConfig(env);
    if (typeof password !== 'string' || !passwordMatches(password, config.password)) {
      return json({ error: 'Invalid password' }, { status: 401 });
    }

    const token = await issueSessionToken(config.sessionSecret);
    return json(
      { ok: true, mustChangePassword: false },
      { headers: { 'set-cookie': sessionCookie(token, request) } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    const status = message.startsWith('EDITOR_') || message.startsWith('SESSION_') ? 503 : 400;
    return json({ error: message }, { status });
  }
}

export async function handleMe(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!(await hasValidSession(request, env))) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  return json({ authenticated: true, mustChangePassword: false });
}

export async function handleLogout(request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  return json({ ok: true }, { headers: { 'set-cookie': expiredSessionCookie(request) } });
}

export async function handleVaultTree(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!(await hasValidSession(request, env))) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const branch = new URL(request.url).searchParams.get('branch')?.trim();
    const config = loadEditorConfig(env);
    const tree = branch
      ? await getContributionTree(config, branch)
      : await getStagingTree(config);
    return json(toVaultTree(tree));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load document tree';
    return json({ error: message }, { status: message.startsWith('Contribution branch') ? 400 : 502 });
  }
}

export async function handleVaultFile(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!(await hasValidSession(request, env))) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const rawPath = url.searchParams.get('path');
    const branch = url.searchParams.get('branch')?.trim();
    if (!rawPath) return json({ error: 'path required' }, { status: 400 });

    const path = assertReadableFilePath(rawPath);
    const config = loadEditorConfig(env);
    const readFile = () => branch
      ? getContributionFile(config, branch, path)
      : getStagingFile(config, path);
    if (isImagePath(path)) {
      const upstream = await readFile();
      const headers = new Headers();
      headers.set('content-type', imageContentType(path));
      headers.set('x-content-type-options', 'nosniff');
      return new Response(upstream.body, { status: 200, headers });
    }
    const content = branch ? await (await readFile()).text() : await getStagingMarkdown(config, path);
    return json({ path, content, encoding: 'utf8' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read document';
    const status = message.startsWith('GitHub API request failed') ? 502 : 400;
    return json({ error: message }, { status });
  }
}

export async function handleSearch(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!(await hasValidSession(request, env))) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') ?? '';
    const limit = Math.max(0, Number(url.searchParams.get('limit') ?? 0) || 0);
    const model = await contributionReadModel(loadEditorConfig(env));
    return json({ query, hits: searchNotes(model, query, limit) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to search documents';
    return json({ error: message }, { status: 502 });
  }
}

export async function handleSearchMatches(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!(await hasValidSession(request, env))) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const input = await request.json() as {
      query?: unknown;
      paths?: unknown;
      matchCase?: unknown;
      phrase?: unknown;
    };
    const query = String(input.query ?? '').trim();
    const terms = input.phrase
      ? [query].filter((term) => term.length >= 2)
      : query.split(/\s+/)
        .map((term) => term.replace(/^['"]|['"]$/g, '').trim())
        .filter((term) => term.length >= 2 && !/^(tag|path|title):/i.test(term));
    const paths = (Array.isArray(input.paths) ? input.paths : []).slice(0, 80).flatMap((value) => {
      try {
        return [assertReadableMarkdownPath(String(value))];
      } catch {
        return [];
      }
    });
    const model = await contributionReadModel(loadEditorConfig(env));
    return json({ matches: paths.map((path) => matchesFor(model, path, terms, Boolean(input.matchCase))) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to find matches';
    const status = message.startsWith('GitHub API request failed') ? 502 : 400;
    return json({ error: message }, { status });
  }
}

export async function handleTags(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!(await hasValidSession(request, env))) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return json({ tags: allTags(await contributionReadModel(loadEditorConfig(env))) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list tags';
    return json({ error: message }, { status: 502 });
  }
}

export async function handleProperties(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!(await hasValidSession(request, env))) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return json({ properties: allProperties(await contributionReadModel(loadEditorConfig(env))) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list properties';
    return json({ error: message }, { status: 502 });
  }
}

export async function handleBacklinks(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!(await hasValidSession(request, env))) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rawPath = new URL(request.url).searchParams.get('path');
    if (!rawPath) return json({ error: 'path required' }, { status: 400 });
    const path = assertReadableMarkdownPath(rawPath);
    const model = await contributionReadModel(loadEditorConfig(env));
    return json({ path, backlinks: backlinksFor(model, path) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list backlinks';
    const status = message.startsWith('GitHub API request failed') ? 502 : 400;
    return json({ error: message }, { status });
  }
}

export async function handleResolve(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!(await hasValidSession(request, env))) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const target = new URL(request.url).searchParams.get('target')?.trim() ?? '';
    if (!target) return json({ error: 'target required' }, { status: 400 });
    const model = await contributionReadModel(loadEditorConfig(env));
    return json({ target, path: resolveLink(model, target) ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resolve link';
    return json({ error: message }, { status: 502 });
  }
}

export async function handleGraph(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!(await hasValidSession(request, env))) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return json(graphData(await contributionReadModel(loadEditorConfig(env))));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to build graph';
    return json({ error: message }, { status: 502 });
  }
}

function imageContentType(path: string): string {
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
  return {
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  }[extension] ?? 'application/octet-stream';
}

export async function handleSubmitContribution(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(['GET', 'POST']);
  if (!(await hasValidSession(request, env))) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const rawPath = url.searchParams.get('path');
      const branch = url.searchParams.get('branch')?.trim() || undefined;
      const path = rawPath ? assertReadableMarkdownPath(rawPath) : undefined;
      return json({ items: await listContributions(loadEditorConfig(env), path, branch) });
    }
    const input = validateContributionInput(await request.json());
    const config = loadEditorConfig(env);
    const result = input.branch
      ? await updateContribution(config, input, input.branch)
      : await createContribution(config, input, createContributionBranch());
    return json(result, { status: result.action === 'created' ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit contribution';
    const status = message.startsWith('GitHub API request failed') ? 502 : 400;
    return json({ error: message }, { status });
  }
}
