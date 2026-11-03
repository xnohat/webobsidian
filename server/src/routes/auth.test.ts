import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';

let directory: string;
let server: Server | undefined;
let baseUrl: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'webo-auth-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', directory);
  vi.stubEnv('VAULT_PATH', path.join(directory, 'vault'));
  vi.stubEnv('WEBOBSIDIAN_PASSWORD', '123456');
});

afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.unstubAllEnvs();
  await fs.rm(directory, { recursive: true, force: true });
});

async function start() {
  const { authRouter } = await import('./auth.js');
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/auth', authRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTP address');
  baseUrl = `http://127.0.0.1:${address.port}/auth`;
}

function post(route: string, body: object, cookie = '') {
  return fetch(`${baseUrl}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
}

describe('authentication with existing CLI configuration', () => {
  it('requires a first-login password change with the legacy env default', async () => {
    await start();
    const login = await post('login', { password: '123456' });
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({ ok: true, mustChangePassword: true });
  });

  it('refuses the legacy default for login and currentPassword after a change and server restart', async () => {
    await start();
    const login = await post('login', { password: '123456' });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    expect((await post('change-password', { currentPassword: '123456', newPassword: 'chosen-secret' }, cookie)).status).toBe(200);
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    server = undefined;
    vi.resetModules();
    await start(); // A fresh module instance must read the persisted credential.
    expect.soft((await post('login', { password: '123456' })).status).toBe(401);
    expect.soft((await post('change-password', { currentPassword: '123456', newPassword: 'attacker-secret' }, cookie)).status).toBe(401);
    const chosen = await post('login', { password: 'chosen-secret' });
    expect(chosen.status).toBe(200);
    expect(await chosen.json()).toEqual({ ok: true, mustChangePassword: false });
  });

  it.each(['operator-recovery-secret', randomBytes(32).toString('hex')])('keeps strong override and Electron-style random secrets working (%#)', async secret => {
    vi.stubEnv('WEBOBSIDIAN_PASSWORD', secret);
    await start();
    const login = await post('login', { password: secret });
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({ ok: true, mustChangePassword: false });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    expect((await post('change-password', { currentPassword: secret, newPassword: 'chosen-secret' }, cookie)).status).toBe(200);
    expect((await post('login', { password: '123456' })).status).toBe(401);
    expect((await post('login', { password: secret })).status).toBe(200);
  });
});
