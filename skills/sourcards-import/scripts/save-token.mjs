#!/usr/bin/env node
/**
 * Check or persist FLASHCARD_API_KEY in this skill folder's `.env.local`.
 *
 *   node save-token.mjs --check
 *     exit 0 if a token is already available (env or overlay)
 *     exit 1 if missing
 *     never prints the value
 *
 *   printf '%s\n' 'sc_int_…' | node save-token.mjs
 *     upserts FLASHCARD_API_KEY in this skill folder's gitignored `.env.local`
 *     exit 0 on success, 2 on bad input
 */

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bootstrapEnv,
  hasFlashcardApiKey,
  persistFlashcardApiKey,
} from '../lib/load-env.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

function usage() {
  process.stderr.write(
    [
      'Usage:',
      '  node save-token.mjs --check',
      "  printf '%s\\n' 'sc_int_…' | node save-token.mjs",
      '',
    ].join('\n'),
  );
}

if (argv.includes('-h') || argv.includes('--help')) {
  usage();
  process.exit(0);
}

if (argv.includes('--check')) {
  bootstrapEnv({ scriptDir });
  if (hasFlashcardApiKey()) {
    process.stdout.write('FLASHCARD_API_KEY is set\n');
    process.exit(0);
  }
  process.stderr.write('FLASHCARD_API_KEY is missing\n');
  process.exit(1);
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
