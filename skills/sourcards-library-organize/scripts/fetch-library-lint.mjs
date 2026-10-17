#!/usr/bin/env node
/**
 * GET /api/library-lint with a Personal Integration Token (catalog:read).
 * Prints the organization snapshot. No card bodies.
 *
 * Exit: 0 success, 1 API/IO failure, 2 bad usage.
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapEnv } from '../lib/load-env.mjs';

bootstrapEnv({ scriptDir: dirname(fileURLToPath(import.meta.url)) });

const OFFICIAL_BASE_URL = 'https://sourcard.sourmonkey.xyz';

function baseUrl() {
  return (process.env.SOURCARDS_API_BASE_URL || OFFICIAL_BASE_URL).replace(/\/+$/, '');
}

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('Usage: fetch-library-lint.mjs');
  process.exit(0);
}
if (argv.length) {
  console.error(`Unknown argument: ${argv[0]}`);
  process.exit(2);
}

const key = process.env.FLASHCARD_API_KEY || '';
if (!key) {
  console.error('缺少 FLASHCARD_API_KEY。用 sourcards-import 的 login.mjs 登录。');
  process.exit(1);
}

const res = await fetch(`${baseUrl()}/api/library-lint`, {
  method: 'GET',
  headers: { 'x-api-key': key },
});
const text = await res.text();
let data = null;
try {
  data = text ? JSON.parse(text) : null;
} catch {
  data = null;
}
if (!res.ok) {
  const message = data?.message || data?.error || `HTTP ${res.status}`;
  console.error(`API 请求失败：${message}`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
