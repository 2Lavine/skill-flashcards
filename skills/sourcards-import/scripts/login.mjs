#!/usr/bin/env node
/**
 * Browser device login for FLASHCARD_API_KEY.
 *
 *   node login.mjs
 *     start a grant, open the authorize page, poll, persist .env.local
 *     never prints the token
 *
 *   node login.mjs --no-open
 *     same, but print the URL instead of opening a browser
 *
 *   node login.mjs --check
 *     exit 0 if a token is already available
 *
 *   node login.mjs --force
 *     login even if a token is already set
 */
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  bootstrapEnv,
  hasFlashcardApiKey,
  persistFlashcardApiKey,
} from '../lib/load-env.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_API_BASE = 'https://sourcard.sourmonkey.xyz';

const LOCAL_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]);

export function resolveApiBase(env = process.env) {
  const raw = env.SOURCARDS_API_BASE_URL || env.FLASHCARD_API_BASE || DEFAULT_API_BASE;
  return String(raw).trim().replace(/\/$/, '');
}

export function assertSafeVerificationUrl(url, apiBase) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('verification URL is not valid');
  }
  const allowed = new Set([
    new URL(apiBase).origin,
    new URL(DEFAULT_API_BASE).origin,
    ...LOCAL_ORIGINS,
  ]);
  if (!/^https?:$/.test(parsed.protocol) || !allowed.has(parsed.origin)) {
    throw new Error(`Refusing to open unexpected verification origin: ${parsed.origin}`);
  }
  if (parsed.pathname !== '/cli/authorize') {
    throw new Error('Unexpected verification path');
  }
  return parsed;
}

export function openVerificationUrl(url) {
  const platform = process.platform;
  const cmd =
    platform === 'darwin'
      ? ['open', [url]]
      : platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  return new Promise((resolve) => {
    execFile(cmd[0], cmd[1], (err) => resolve(!err));
  });
}

export async function startGrant(apiBase, fetchImpl = fetch) {
  const res = await fetchImpl(`${apiBase}/api/cli/device/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `start failed (${res.status})`);
  }
  if (!data.device_code || !data.verification_uri_complete) {
    throw new Error('start response missing device_code');
  }
  return data;
}

export async function pollGrant(apiBase, deviceCode, fetchImpl = fetch) {
  const res = await fetchImpl(`${apiBase}/api/cli/device/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_code: deviceCode }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.status) {
    throw new Error(data.error || `poll failed (${res.status})`);
  }
  return data;
}

export async function waitForAuthorization(input) {
  const {
    apiBase,
    deviceCode,
    expiresIn = 600,
    interval = 3,
    fetchImpl = fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = () => Date.now(),
  } = input;
  const deadline = now() + expiresIn * 1000;
  let waitSec = Math.max(1, Number(interval) || 3);
  while (now() < deadline) {
    await sleep(waitSec * 1000);
    const data = await pollGrant(apiBase, deviceCode, fetchImpl);
    if (data.status === 'authorized' && data.apiKey) {
      return data.apiKey;
    }
    if (data.status === 'denied') {
      throw new Error('authorization denied');
    }
    if (data.status === 'expired') {
      throw new Error('authorization expired');
    }
    if (data.status === 'slow_down') {
      waitSec = Math.max(waitSec + 1, Number(data.interval) || waitSec);
    } else if (data.interval) {
      waitSec = Math.max(1, Number(data.interval));
    }
  }
  throw new Error('authorization timed out');
}

export async function runLogin(opts = {}) {
  const env = opts.env || process.env;
  const log = opts.log || ((msg) => process.stderr.write(`${msg}\n`));
  const fetchImpl = opts.fetchImpl || fetch;
  const openUrl = opts.openUrl || openVerificationUrl;
  const persist = opts.persist || persistFlashcardApiKey;
  const noOpen = Boolean(opts.noOpen);
  const apiBase = resolveApiBase(env);

  const started = await startGrant(apiBase, fetchImpl);
  const verifyUrl = String(started.verification_uri_complete);
  assertSafeVerificationUrl(verifyUrl, apiBase);

  log(`Confirm this code in the browser: ${started.user_code}`);
  let opened = false;
  if (!noOpen) {
    opened = await openUrl(verifyUrl);
  }
  if (!opened) {
    log(`Open: ${verifyUrl}`);
  }

  const apiKey = await waitForAuthorization({
    apiBase,
    deviceCode: started.device_code,
    expiresIn: started.expires_in,
    interval: started.interval,
    fetchImpl,
    sleep: opts.sleep,
    now: opts.now,
  });
  const file = persist(opts.scriptDir || scriptDir, apiKey, env);
  return { file };
}

function usage() {
  process.stderr.write(
    [
      'Usage:',
      '  node login.mjs',
      '  node login.mjs --no-open',
      '  node login.mjs --check',
      '  node login.mjs --force',
      '',
    ].join('\n'),
  );
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    usage();
    process.exit(0);
  }
  bootstrapEnv({ scriptDir });
  if (argv.includes('--check')) {
    if (hasFlashcardApiKey()) {
      process.stdout.write('FLASHCARD_API_KEY is set\n');
      process.exit(0);
    }
    process.stderr.write('FLASHCARD_API_KEY is missing\n');
    process.exit(1);
  }
  if (hasFlashcardApiKey() && !argv.includes('--force')) {
    process.stdout.write('FLASHCARD_API_KEY is already set\n');
    process.exit(0);
  }
  try {
    const { file } = await runLogin({
      noOpen: argv.includes('--no-open'),
      scriptDir,
    });
    process.stdout.write(`saved FLASHCARD_API_KEY to ${file}\n`);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }
}

function isMain() {
  try {
    return import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  void main();
}
