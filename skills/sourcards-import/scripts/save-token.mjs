#!/usr/bin/env node
/**
 * Persist a pasted FLASHCARD_API_KEY in this skill folder's `.env.local`.
 * This script does not log in and does not check whether a key exists.
 *
 *   printf '%s\n' 'sc_int_…' | node save-token.mjs
 *     upserts FLASHCARD_API_KEY in this skill folder's gitignored `.env.local`
 *     exit 0 on success, 2 on bad input
 *
 *   node save-token.mjs --check
 *     exit 2. Token check is login.mjs --check (same folder).
 */

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { persistFlashcardApiKey } from '../lib/load-env.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

function usage() {
  process.stderr.write(
    [
      'Usage:',
      "  printf '%s\\n' 'sc_int_…' | node save-token.mjs",
      '  node login.mjs --check',
      '',
    ].join('\n'),
  );
}

if (argv.includes('-h') || argv.includes('--help')) {
  usage();
  process.exit(0);
}

if (argv.includes('--check')) {
  process.stderr.write(
    [
      'save-token.mjs does not check or create a token.',
      'Run: node login.mjs --check',
      'Missing key: node login.mjs',
      "Paste only: printf '%s\\n' 'sc_int_…' | node save-token.mjs",
      '',
    ].join('\n'),
  );
  process.exit(2);
}

if (argv.length) {
  usage();
  process.exit(2);
}

if (process.stdin.isTTY) {
  process.stderr.write(
    "Pipe the token: printf '%s\\n' 'sc_int_…' | node save-token.mjs\n",
  );
  process.exit(2);
}

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  raw = '';
}

try {
  const file = persistFlashcardApiKey(scriptDir, raw);
  process.stdout.write(`saved FLASHCARD_API_KEY to ${file}\n`);
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
  process.exit(2);
}
