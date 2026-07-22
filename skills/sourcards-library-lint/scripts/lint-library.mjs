#!/usr/bin/env node
/**
 * Library organization lint CLI.
 *
 *   node lint-library.mjs snapshot.json
 *   sourcards-lint-library snapshot.json --json
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lintLibraryOrganization } from '../../../lib/org-lint.mjs';

function usage(code = 1) {
  console.error(`Usage:
  lint-library.mjs <snapshot.json> [--json]
`);
  process.exit(code);
}

function parseArgs(argv) {
  let file = null;
  let jsonOnly = false;
  for (const arg of argv) {
    if (arg === '--json') jsonOnly = true;
    else if (arg === '-h' || arg === '--help') usage(0);
    else if (arg.startsWith('-')) {
      console.error(`Unknown flag: ${arg}`);
      usage(1);
    } else if (file) {
      console.error('Pass exactly one snapshot file.');
      usage(1);
    } else {
      file = arg;
    }
  }
  return { file, jsonOnly };
}

function loadSnapshot(path) {
  const raw = readFileSync(resolve(path), 'utf8');
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object') throw new Error('snapshot must be an object');
  if (!Array.isArray(data.decks)) throw new Error('snapshot.decks must be an array');
  if (!Array.isArray(data.categories)) throw new Error('snapshot.categories must be an array');
  if (!Array.isArray(data.uncategorized)) {
    throw new Error('snapshot.uncategorized must be an array');
  }
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

const { file, jsonOnly } = parseArgs(process.argv.slice(2));
if (!file) usage(1);

try {
  printReport(loadSnapshot(file), jsonOnly);
  process.exit(0);
} catch (error) {
  console.error(`lint-library failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
