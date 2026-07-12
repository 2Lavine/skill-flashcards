#!/usr/bin/env node
/**
 * Library organization lint CLI.
 *
 *   node lint-library.mjs snapshot.json
 *   node lint-library.mjs --base https://sourcard.sourmonkey.xyz
 *   sourcards-lint-library --base https://...
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintLibraryOrganization } from '../../../lib/org-lint.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function usage(code = 1) {
  console.error(`Usage:
  lint-library.mjs <snapshot.json>
  lint-library.mjs --base <https://host> [--json]

Env:
  FLASHCARD_API_KEY  required for --base
`);
  process.exit(code);
}

function parseArgs(argv) {
  let base = null;
  let file = null;
  let jsonOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') base = argv[++i];
    else if (a.startsWith('--base=')) base = a.slice('--base='.length);
    else if (a === '--json') jsonOnly = true;
    else if (a === '-h' || a === '--help') usage(0);
    else if (a.startsWith('-')) {
      console.error(`Unknown flag: ${a}`);
      usage(1);
    } else {
      file = a;
    }
  }
  return { base, file, jsonOnly };
}

async function fetchLibraryLint(base) {
  const key = process.env.FLASHCARD_API_KEY;
  if (!key) {
    throw new Error('FLASHCARD_API_KEY not set');
  }
  const url = `${base.replace(/\/+$/, '')}/api/library-lint`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      'X-Api-Key': key,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${url} → ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

function loadSnapshot(path) {
  const raw = readFileSync(resolve(path), 'utf8');
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object') throw new Error('snapshot must be an object');
  if (!Array.isArray(data.decks)) throw new Error('snapshot.decks must be an array');
  if (!Array.isArray(data.categories)) throw new Error('snapshot.categories must be an array');
  return lintLibraryOrganization(data);
}

function printReport(result, jsonOnly) {
  if (jsonOnly) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const s = result.summary;
  console.log(
    `Library: ${s.total_decks} decks, ${s.total_cards} cards, ${s.total_categories} categories, ${s.total_uncategorized} uncategorized → ${s.total_issues} issue(s)`,
  );
  if (!result.issues.length) {
    console.log('clean — no organizational issues flagged');
    return;
  }
  const order = { warning: 0, suggestion: 1, info: 2 };
  const sorted = [...result.issues].sort(
    (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9),
  );
  for (const issue of sorted) {
    const badge = issue.severity.toUpperCase();
    console.log(`\n[${badge}] ${issue.type}`);
    console.log(`  ${issue.detail}`);
    if (issue.suggestion) console.log(`  → ${issue.suggestion}`);
  }
  console.log('\n--- JSON ---');
  console.log(JSON.stringify(result, null, 2));
}

const { base, file, jsonOnly } = parseArgs(process.argv.slice(2));
if (!base && !file) usage(1);
if (base && file) {
  console.error('Pass either a snapshot file or --base, not both.');
  usage(1);
}

try {
  const result = base ? await fetchLibraryLint(base) : loadSnapshot(file);
  // If API already returns final result, trust it; if snapshot path computed above.
  const finalResult =
    base && result && result.summary && Array.isArray(result.issues)
      ? result
      : result;
  printReport(finalResult, jsonOnly);
  process.exit(0);
} catch (e) {
  console.error(`lint-library failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
