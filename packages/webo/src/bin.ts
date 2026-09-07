#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root (directory containing server/dist/index.js or root package.json)
function findProjectRoot(): string {
  let cur = __dirname;
  while (cur !== '/' && cur !== path.parse(cur).root) {
    if (fs.existsSync(path.join(cur, 'server', 'dist', 'index.js')) || fs.existsSync(path.join(cur, 'package.json'))) {
      if (fs.existsSync(path.join(cur, 'server', 'dist', 'index.js'))) {
        return cur;
      }
    }
    cur = path.dirname(cur);
  }
  // Fallback to 2 levels up from packages/webo/src (or packages/webo/dist)
  return path.resolve(__dirname, '..', '..', '..');
}

const PROJECT_ROOT = findProjectRoot();
const CONFIG_DIR = path.join(os.homedir(), '.webobsidian');
const PID_FILE = path.join(CONFIG_DIR, 'webo.pid');
const LOG_FILE = path.join(CONFIG_DIR, 'webo.log');
const ENV_FILE = path.join(CONFIG_DIR, '.env');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'server', 'dist', 'index.js');

// --- Helper Functions ---

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function parseEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

function getActivePort(): number {
  const env = parseEnvFile(ENV_FILE);
  return Number(process.env.PORT || env.PORT || 8787);
}

function getActiveHost(): string {
  const env = parseEnvFile(ENV_FILE);
  return process.env.HOST || env.HOST || '0.0.0.0';
}

function getPid(): number | null {
  if (!fs.existsSync(PID_FILE)) return null;
  try {
    const pidStr = fs.readFileSync(PID_FILE, 'utf8').trim();
    const pid = parseInt(pidStr, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function checkHealth(port: number, host: string = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const targetHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    const req = http.get(`http://${targetHost}:${port}/healthz`, { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// --- Commands ---

async function cmdInstall(): Promise<void> {
  ensureConfigDir();
  console.log(`Setting up WebObsidian CLI environment at ${CONFIG_DIR}...`);

  // Scaffold default .env if missing
  if (!fs.existsSync(ENV_FILE)) {
    const sampleVault = path.join(PROJECT_ROOT, 'sample-vault');
    const defaultEnvContent = `# WebObsidian CLI Configuration (~/.webobsidian/.env)
PORT=8787
HOST=0.0.0.0
VAULT_PATH=${sampleVault}
DATA_DIR=${path.join(CONFIG_DIR, 'data')}
ALLOWED_ROOTS=${sampleVault}
WEBOBSIDIAN_PASSWORD=123456
WEBOBSIDIAN_WATCH=auto
TRUST_PROXY=true
`;
    fs.writeFileSync(ENV_FILE, defaultEnvContent, { mode: 0o600 });
    console.log(`  Created default configuration at ${ENV_FILE}`);
  } else {
    console.log(`  Existing configuration found at ${ENV_FILE}`);
  }

  // Ensure data dir
  const dataDir = path.join(CONFIG_DIR, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  }

  // Find suitable bin installation dir
  const homeBin = path.join(os.homedir(), '.local', 'bin');
  let targetBinDir = homeBin;
  const sysBin = '/usr/local/bin';

  const pathEnv = process.env.PATH || '';
  if (!pathEnv.includes(homeBin) && pathEnv.includes(sysBin)) {
    try {
      fs.accessSync(sysBin, fs.constants.W_OK);
      targetBinDir = sysBin;
    } catch {
      targetBinDir = homeBin;
    }
  }

  if (!fs.existsSync(targetBinDir)) {
    try {
      fs.mkdirSync(targetBinDir, { recursive: true });
    } catch {
      // Fallback
    }
  }

  const linkPath = path.join(targetBinDir, 'webo');
  const binSourcePath = path.resolve(__filename);

  try {
    if (fs.existsSync(linkPath) || fs.lstatSync(linkPath).isDirectory()) {
      fs.unlinkSync(linkPath);
    }
  } catch {
    // Ignore if didn't exist
  }

  try {
    fs.symlinkSync(binSourcePath, linkPath);
    fs.chmodSync(binSourcePath, 0o755);
    console.log(`  Symlinked executable 'webo' -> ${linkPath}`);
  } catch (err: any) {
    console.warn(`  Could not create symlink at ${linkPath}: ${err.message}`);
    console.log(`  You can manually add ${binSourcePath} to your PATH.`);
  }

  console.log('\nWebObsidian CLI successfully installed!');
  console.log(`  Run 'webo start' to launch the server as a background daemon.`);
  console.log(`  Run 'webo status' to check daemon health.`);
}

async function cmdUninstall(): Promise<void> {
  console.log('Uninstalling WebObsidian CLI...');
  await cmdStop();

  const homeBin = path.join(os.homedir(), '.local', 'bin', 'webo');
  const sysBin = '/usr/local/bin/webo';

  for (const binPath of [homeBin, sysBin]) {
    if (fs.existsSync(binPath) || fs.lstatSync(binPath).isDirectory()) {
      try {
        fs.unlinkSync(binPath);
        console.log(`  Removed symlink at ${binPath}`);
      } catch (err: any) {
        console.warn(`  Failed to remove ${binPath}: ${err.message}`);
      }
    }
  }

  console.log(`\nNote: Configuration and data at ${CONFIG_DIR} were kept.`);
  console.log(`To completely remove state, run: rm -rf ${CONFIG_DIR}`);
}

async function cmdStart(): Promise<void> {
  ensureConfigDir();

  const pid = getPid();
  if (pid !== null && isProcessRunning(pid)) {
    const port = getActivePort();
    const host = getActiveHost();
    const healthy = await checkHealth(port, host);
    if (healthy) {
      console.log(`WebObsidian server is already running (PID: ${pid}, Port: ${port}).`);
      return;
    } else {
      console.log(`Stale PID file found (${pid}), but process is unresponsive. Cleaning up...`);
      try { fs.unlinkSync(PID_FILE); } catch {}
    }
  }

  if (!fs.existsSync(SERVER_ENTRY)) {
    console.error(`Error: Server entry file not found at ${SERVER_ENTRY}`);
    console.error(`Please build the server first using 'npm run build' from the root repository.`);
    process.exit(1);
  }

  const envFromFile = parseEnvFile(ENV_FILE);
  const spawnEnv = {
    ...process.env,
    ...envFromFile,
    NODE_ENV: 'production'
  };

  const port = Number(spawnEnv.PORT || 8787);
  const host = spawnEnv.HOST || '0.0.0.0';

  console.log(`Starting WebObsidian server in background...`);
  console.log(`  Entry: ${SERVER_ENTRY}`);
  console.log(`  Config file: ${ENV_FILE}`);
  console.log(`  Logs: ${LOG_FILE}`);

  const outFd = fs.openSync(LOG_FILE, 'a');
  const errFd = fs.openSync(LOG_FILE, 'a');

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: spawnEnv,
    detached: true,
    stdio: ['ignore', outFd, errFd]
  });

  if (child.pid) {
    fs.writeFileSync(PID_FILE, String(child.pid), 'utf8');
    child.unref();

    console.log(`  Spawned process (PID: ${child.pid}).`);
    process.stdout.write('  Waiting for server initialization...');

    // Poll health check for up to 30 seconds
    const start = Date.now();
    let isUp = false;
    while (Date.now() - start < 30000) {
      await new Promise((r) => setTimeout(r, 500));
      process.stdout.write('.');
      if (child.pid && !isProcessRunning(child.pid)) {
        process.stdout.write('\n');
        console.error(`\nError: Server process exited unexpectedly. Check logs at ${LOG_FILE}`);
        try { fs.unlinkSync(PID_FILE); } catch {}
        process.exit(1);
      }
      if (await checkHealth(port, host)) {
        isUp = true;
        break;
      }
    }
    process.stdout.write('\n');

    if (isUp) {
      console.log(`\nWebObsidian server is UP and running!`);
      console.log(`  URL: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
      console.log(`  PID: ${child.pid}`);
    } else {
      console.warn(`\nWarning: Server did not respond to health check within 30s.`);
      console.warn(`It may still be indexing the vault. Check logs using 'webo logs'.`);
    }
  } else {
    console.error('Failed to spawn child process.');
    process.exit(1);
  }
}

async function cmdStop(): Promise<void> {
  const pid = getPid();
  if (pid === null) {
    console.log('WebObsidian server is not running (no PID file).');
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log(`Process ${pid} is not running. Removing stale PID file.`);
    try { fs.unlinkSync(PID_FILE); } catch {}
    return;
  }

  console.log(`Stopping WebObsidian server (PID: ${pid})...`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err: any) {
    console.error(`Failed to send SIGTERM to process ${pid}: ${err.message}`);
    return;
  }

  // Wait for graceful shutdown (up to 10 seconds)
  const start = Date.now();
  let stopped = false;
  while (Date.now() - start < 10000) {
    if (!isProcessRunning(pid)) {
      stopped = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!stopped) {
    console.warn(`Process ${pid} did not exit gracefully after 10s. Sending SIGKILL...`);
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }

  try { fs.unlinkSync(PID_FILE); } catch {}
  console.log('WebObsidian server stopped successfully.');
}

async function cmdStatus(): Promise<void> {
  const pid = getPid();
  const port = getActivePort();
  const host = getActiveHost();

  console.log('WebObsidian Server Status:');
  console.log(`  Config Dir: ${CONFIG_DIR}`);
  console.log(`  PID File:   ${PID_FILE}`);
  console.log(`  Log File:   ${LOG_FILE}`);

  if (pid === null) {
    console.log(`  Status:     STOPPED (No PID file)`);
    return;
  }

  const running = isProcessRunning(pid);
  if (!running) {
    console.log(`  Status:     STOPPED (Stale PID: ${pid})`);
    return;
  }

  const healthy = await checkHealth(port, host);
  console.log(`  PID:        ${pid}`);
  console.log(`  Port:       ${port}`);
  console.log(`  Host:       ${host}`);
  console.log(`  Health:     ${healthy ? 'OK (Responding to /healthz)' : 'UNHEALTHY / INITIALIZING'}`);
  console.log(`  Status:     RUNNING`);
}

async function cmdRestart(): Promise<void> {
  console.log('Restarting WebObsidian server...');
  await cmdStop();
  await cmdStart();
}

async function cmdLogs(follow: boolean): Promise<void> {
  if (!fs.existsSync(LOG_FILE)) {
    console.log(`Log file does not exist at ${LOG_FILE}`);
    return;
  }

  if (follow) {
    console.log(`Tailing log file (${LOG_FILE}). Press Ctrl+C to exit...\n`);
    const tail = spawn('tail', ['-f', '-n', '50', LOG_FILE], { stdio: 'inherit' });
    process.on('SIGINT', () => {
      tail.kill();
      process.exit(0);
    });
  } else {
    try {
      const logs = execSync(`tail -n 50 "${LOG_FILE}"`, { encoding: 'utf8' });
      console.log(`--- Last 50 lines of ${LOG_FILE} ---`);
      console.log(logs);
    } catch {
      console.log(fs.readFileSync(LOG_FILE, 'utf8'));
    }
  }
}

async function cmdConfig(): Promise<void> {
  ensureConfigDir();
  if (!fs.existsSync(ENV_FILE)) {
    console.log(`No config file found at ${ENV_FILE}. Run 'webo install' to create default config.`);
    return;
  }
  console.log(`Active configuration (${ENV_FILE}):\n`);
  console.log(fs.readFileSync(ENV_FILE, 'utf8'));
}

function printHelp(): void {
  console.log(`webo — WebObsidian Process Manager CLI

Usage:
  webo <command> [options]

Commands:
  install       Install the 'webo' executable on PATH and scaffold ~/.webobsidian configuration
  start         Start the WebObsidian server as a background daemon process
  stop          Gracefully stop the running WebObsidian server background daemon
  restart       Restart the WebObsidian server background daemon
  status        Display the current daemon status, PID, port, and health check
  logs [-f]     View the server logs (use -f or --follow to tail output)
  config        Display the current active environment configuration (~/.webobsidian/.env)
  uninstall     Remove the 'webo' executable symlink and stop daemon
  help          Display this help message
`);
}

// --- Main Entry ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';

  switch (cmd) {
    case 'install':
      await cmdInstall();
      break;
    case 'uninstall':
      await cmdUninstall();
      break;
    case 'start':
      await cmdStart();
      break;
    case 'stop':
      await cmdStop();
      break;
    case 'restart':
      await cmdRestart();
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'logs':
      const follow = args.includes('-f') || args.includes('--follow');
      await cmdLogs(follow);
      break;
    case 'config':
      await cmdConfig();
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
