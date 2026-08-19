export interface EditorConfig {
  githubToken: string;
  upstreamOwner: string;
  forkOwner: string;
  repo: string;
  stagingBranch: string;
}

export interface AuthConfig {
  password: string;
  sessionSecret: string;
}

export interface RuntimeEnvironment {
  GITHUB_TOKEN?: string;
  GITHUB_UPSTREAM_OWNER?: string;
  GITHUB_FORK_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_STAGING_BRANCH?: string;
  EDITOR_PASSWORD?: string;
  SESSION_SECRET?: string;
}

const CONFIG_KEYS = [
  'GITHUB_TOKEN',
  'GITHUB_UPSTREAM_OWNER',
  'GITHUB_FORK_OWNER',
  'GITHUB_REPO',
  'GITHUB_STAGING_BRANCH',
] as const;

type ConfigKey = (typeof CONFIG_KEYS)[number];

function readRequired(env: RuntimeEnvironment, key: ConfigKey): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export function loadEditorConfig(env: RuntimeEnvironment = process.env): EditorConfig {
  return {
    githubToken: readRequired(env, 'GITHUB_TOKEN'),
    upstreamOwner: readRequired(env, 'GITHUB_UPSTREAM_OWNER'),
    forkOwner: readRequired(env, 'GITHUB_FORK_OWNER'),
    repo: readRequired(env, 'GITHUB_REPO'),
    stagingBranch: readRequired(env, 'GITHUB_STAGING_BRANCH'),
  };
}

export function editorConfigReady(env: RuntimeEnvironment = process.env): boolean {
  return CONFIG_KEYS.every((key) => Boolean(env[key]?.trim()));
}

export function loadAuthConfig(env: RuntimeEnvironment = process.env): AuthConfig {
  const password = env.EDITOR_PASSWORD;
  const sessionSecret = env.SESSION_SECRET;
  if (!password || password.length < 8) {
    throw new Error('EDITOR_PASSWORD must contain at least 8 characters');
  }
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }
  return { password, sessionSecret };
}

export function authConfigReady(env: RuntimeEnvironment = process.env): boolean {
  try {
    loadAuthConfig(env);
    return true;
  } catch {
    return false;
  }
}
