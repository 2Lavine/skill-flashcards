#!/usr/bin/env node
/**
 * Apply a confirmed category rename/merge plan.
 *
 *   node apply-library-plan.mjs plan.json            # dry-run, no requests
 *   node apply-library-plan.mjs plan.json --apply    # PUT each operation, stop on first failure
 *
 * Exit: 0 dry-run or full apply, 1 API/IO failure, 2 invalid plan (nothing sent).
 */
import { readFileSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bootstrapEnv } from '../lib/load-env.mjs';

bootstrapEnv({ scriptDir: dirname(fileURLToPath(import.meta.url)) });

const OFFICIAL_BASE_URL = 'https://sourcard.sourmonkey.xyz';
const OPS = {
  rename_category: '/api/categories/rename',
  merge_category: '/api/categories/merge',
};

function baseUrl() {
  return (process.env.SOURCARDS_API_BASE_URL || OFFICIAL_BASE_URL).replace(/\/+$/, '');
}

/**
 * @param {unknown} raw
 * @returns {{ operations: Array<{ op: string, deckId: string, oldName: string, newName: string }> }}
 */
export function parsePlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('plan must be an object with operations');
  }
  const operations = raw.operations;
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error('operations must be a non-empty array');
  }
  if (operations.length > 100) {
    throw new Error('operations exceed 100');
  }
  return {
    operations: operations.map((item, index) => {
      if (!item || typeof item !== 'object') throw new Error(`operations[${index}] is not an object`);
      const op = item.op;
      if (op !== 'rename_category' && op !== 'merge_category') {
        throw new Error(`operations[${index}].op must be rename_category or merge_category`);
      }
      const deckId = typeof item.deckId === 'string' ? item.deckId.trim() : '';
      const oldName = typeof item.oldName === 'string' ? item.oldName.trim() : '';
      const newName = typeof item.newName === 'string' ? item.newName.trim() : '';
      if (!deckId || !oldName || !newName) {
        throw new Error(`operations[${index}] needs deckId, oldName, and newName`);
      }
      if (newName.includes('/')) {
        throw new Error(`operations[${index}].newName must not contain /`);
      }
      if (op === 'merge_category' && oldName === newName) {
        throw new Error(`operations[${index}] cannot merge a category into itself`);
      }
      return { op, deckId, oldName, newName };
    }),
  };
}

function readArgs(argv) {
  let file = null;
  let apply = false;
  for (const arg of argv) {
    if (arg === '--apply') apply = true;
    else if (arg === '--help' || arg === '-h') return { help: true };
    else if (arg.startsWith('-')) throw new Error(`Unknown argument: ${arg}`);
    else if (file) throw new Error('Pass one plan file');
    else file = arg;
  }
  if (!file) throw new Error('Usage: apply-library-plan.mjs plan.json [--apply]');
  return { file, apply };
}

async function applyOne(op, key) {
  const res = await fetch(`${baseUrl()}${OPS[op.op]}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
    },
    body: JSON.stringify({
      deckId: op.deckId,
      oldName: op.oldName,
      newName: op.newName,
    }),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok || data?.ok === false) {
    const message = data?.error || data?.message || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: apply-library-plan.mjs plan.json [--apply]');
    return;
  }
  let plan;
  try {
    plan = parsePlan(JSON.parse(readFileSync(args.file, 'utf8')));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
    return;
  }
  if (!args.apply) {
    process.stdout.write(`${JSON.stringify({ dryRun: true, operations: plan.operations }, null, 2)}\n`);
    return;
  }
  const key = process.env.FLASHCARD_API_KEY || '';
  if (!key) {
    console.error('缺少 FLASHCARD_API_KEY。用 sourcards-import 的 login.mjs 登录。');
    process.exitCode = 1;
    return;
  }
  const applied = [];
  for (let i = 0; i < plan.operations.length; i++) {
    const op = plan.operations[i];
    try {
      const result = await applyOne(op, key);
      applied.push({ index: i, op: op.op, ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`operations[${i}] failed: ${message}`);
      process.stdout.write(`${JSON.stringify({
        applied: applied.length,
        failed: { index: i, op: op.op, error: message },
      }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
  }
  process.stdout.write(`${JSON.stringify({ applied: applied.length, results: applied }, null, 2)}\n`);
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
