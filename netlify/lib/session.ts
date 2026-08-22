import { timingSafeEqual } from 'node:crypto';
import { isPublicEditor, loadAuthConfig, type RuntimeEnvironment } from './config.js';

const COOKIE_NAME = 'uscwiki_editor_session';
const SESSION_SECONDS = 12 * 60 * 60;

function encode(value: string | Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return encode(new Uint8Array(signature));
}

function equalText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function passwordMatches(actual: string, expected: string): boolean {
  return equalText(actual, expected);
}

export async function issueSessionToken(
  secret: string,
  now = Date.now(),
): Promise<string> {
  const payload = encode(JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_SECONDS }));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  if (!equalText(signature, await sign(payload, secret))) return false;

  try {
    const parsed = JSON.parse(decode(payload)) as { exp?: unknown };
    return typeof parsed.exp === 'number' && parsed.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

function readCookie(request: Request): string | undefined {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE_NAME) return value.join('=');
  }
  return undefined;
}

export async function hasValidSession(
  request: Request,
  env: RuntimeEnvironment = process.env,
): Promise<boolean> {
  if (isPublicEditor(env)) return true;
  try {
    const token = readCookie(request);
    if (!token) return false;
    return verifySessionToken(token, loadAuthConfig(env).sessionSecret);
  } catch {
    return false;
  }
}

export function sessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function expiredSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
