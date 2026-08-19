import {
  authConfigReady,
  editorConfigReady,
  loadAuthConfig,
  loadEditorConfig,
  type RuntimeEnvironment,
} from './config.js';
import { createContributionBranch, validateContributionInput } from './contributions.js';
import {
  createContribution,
  getStagingMarkdown,
  getStagingTree,
  listContributions,
  updateContribution,
} from './github.js';
import { json, methodNotAllowed } from './http.js';
import { assertReadableMarkdownPath } from './paths.js';
import {
  expiredSessionCookie,
  hasValidSession,
  issueSessionToken,
  passwordMatches,
  sessionCookie,
} from './session.js';
import { toVaultTree } from './tree.js';

export async function handleHealth(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed(['GET', 'HEAD']);

  return json({
    ok: true,
    service: 'usc-wiki-contribution-editor',
    githubConfigured: editorConfigReady(env),
    authConfigured: authConfigReady(env),
  });
}

export async function handleAuthStatus(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
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
    const tree = await getStagingTree(loadEditorConfig(env));
    return json(toVaultTree(tree));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load document tree';
    return json({ error: message }, { status: 502 });
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
    const rawPath = new URL(request.url).searchParams.get('path');
    if (!rawPath) return json({ error: 'path required' }, { status: 400 });

    const path = assertReadableMarkdownPath(rawPath);
    const content = await getStagingMarkdown(loadEditorConfig(env), path);
    return json({ path, content, encoding: 'utf8' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read document';
    const status = message.startsWith('GitHub API request failed') ? 502 : 400;
    return json({ error: message }, { status });
  }
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
      const rawPath = new URL(request.url).searchParams.get('path');
      const path = rawPath ? assertReadableMarkdownPath(rawPath) : undefined;
      return json({ items: await listContributions(loadEditorConfig(env), path) });
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
