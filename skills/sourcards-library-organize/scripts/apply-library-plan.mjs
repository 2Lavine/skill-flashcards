#!/usr/bin/env node
/**
 * Apply a confirmed library organization plan (category rename/merge, deck rename/merge).
 *
 *   node apply-library-plan.mjs plan.json            # dry-run, no requests
 *   node apply-library-plan.mjs plan.json --apply    # send each operation, stop on first failure
 *
 * Category ops (stay inside one deck):
 *   { "op": "rename_category", "deckId": "d1", "oldName": "旧", "newName": "新" }
 *   { "op": "merge_category",  "deckId": "d1", "oldName": "碎",  "newName": "主" }
 *
 * Deck ops (deckId / sourceDeckId / targetDeckId may be omitted if you give a deck
 * *name* instead: `deck`, `sourceDeck`, `targetDeck` — resolved via GET /api/decks at apply time):
 *   { "op": "rename_deck", "deckId": "d1", "newName": "新牌组名" }
 *   { "op": "merge_deck",  "sourceDeckId": "d1", "targetDeckId": "d2" }
 *   { "op": "merge_deck",  "sourceDeck": "旧牌组", "targetDeck": "主牌组" }
 *
 * Exit: 0 dry-run or full apply, 1 API/IO failure, 2 invalid plan (nothing sent).
 */
import { readFileSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bootstrapEnv } from '../lib/load-env.mjs';

bootstrapEnv({ scriptDir: dirname(fileURLToPath(import.meta.url)) });

const OFFICIAL_BASE_URL = 'https://sourcard.sourmonkey.xyz';
const CATEGORY_OPS = {
  rename_category: '/api/categories/rename',
  merge_category: '/api/categories/merge',
};
const DECK_OPS = new Set(['rename_deck', 'merge_deck']);

function baseUrl() {
  return (process.env.SOURCARDS_API_BASE_URL || OFFICIAL_BASE_URL).replace(/\/+$/, '');
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {unknown} raw
 * @returns {{ operations: Array<Record<string, string>> }}
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
      if (!(op in CATEGORY_OPS) && !DECK_OPS.has(op)) {
        throw new Error(
          `operations[${index}].op must be rename_category, merge_category, rename_deck, or merge_deck`,
        );
      }
      const newName = trimmed(item.newName);
      if (op in CATEGORY_OPS) {
        const deckId = trimmed(item.deckId);
        const oldName = trimmed(item.oldName);
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
      }
      if (op === 'rename_deck') {
        const deckId = trimmed(item.deckId);
        const deck = trimmed(item.deck);
        if (!deckId && !deck) {
          throw new Error(`operations[${index}] needs deckId (or deck name)`);
        }
        if (!newName) throw new Error(`operations[${index}] needs newName`);
        if (newName.includes('/')) {
          throw new Error(`operations[${index}].newName must not contain /`);
        }
        const entry = { op };
        if (deckId) entry.deckId = deckId;
        if (deck) entry.deck = deck;
        entry.newName = newName;
        return entry;
      }
      // merge_deck
      const sourceDeckId = trimmed(item.sourceDeckId);
      const targetDeckId = trimmed(item.targetDeckId);
      const sourceDeck = trimmed(item.sourceDeck);
      const targetDeck = trimmed(item.targetDeck);
      if ((!sourceDeckId && !sourceDeck) || (!targetDeckId && !targetDeck)) {
        throw new Error(
          `operations[${index}] needs sourceDeckId+targetDeckId (or sourceDeck+targetDeck names)`,
        );
      }
      if (sourceDeckId && targetDeckId && sourceDeckId === targetDeckId) {
        throw new Error(`operations[${index}] cannot merge a deck into itself`);
      }
      if (sourceDeck && targetDeck && sourceDeck === targetDeck) {
        throw new Error(`operations[${index}] cannot merge a deck into itself`);
      }
      const entry = { op };
      if (sourceDeckId) entry.sourceDeckId = sourceDeckId;
      if (targetDeckId) entry.targetDeckId = targetDeckId;
      if (sourceDeck) entry.sourceDeck = sourceDeck;
      if (targetDeck) entry.targetDeck = targetDeck;
      return entry;
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

function needsDeckIndex(op) {
  if (op.op === 'rename_deck') return !op.deckId && !!op.deck;
  if (op.op === 'merge_deck') return (!op.sourceDeckId && !!op.sourceDeck) || (!op.targetDeckId && !!op.targetDeck);
  return false;
}

/** Fetch GET /api/decks once and return Map<name, id>. Only called when a deck op uses names. */
async function fetchDeckIndex(key) {
  const res = await fetch(`${baseUrl()}/api/decks`, {
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
    const message = data?.error || data?.message || `HTTP ${res.status}`;
    const err = new Error(`cannot list decks: ${message}`);
    err.status = res.status;
    throw err;
  }
  const map = new Map();
  for (const d of data?.decks ?? []) {
    if (d && typeof d.name === 'string' && typeof d.id === 'string') map.set(d.name, d.id);
  }
  return map;
}

function resolveDeckId(op, kind, index, indexMap) {
  // kind = 'deck' | 'source' | 'target'
  const idKey = kind === 'deck' ? 'deckId' : `${kind}DeckId`;
  const nameKey = kind === 'deck' ? 'deck' : `${kind}Deck`;
  if (op[idKey]) return op[idKey];
  const name = op[nameKey];
  const id = indexMap.get(name);
  if (!id) throw new Error(`operations[${index}] deck not found by name: ${name}`);
  return id;
}

function buildRequest(op, index, indexMap) {
  if (op.op in CATEGORY_OPS) {
    return {
      method: 'PUT',
      url: `${baseUrl()}${CATEGORY_OPS[op.op]}`,
      body: { deckId: op.deckId, oldName: op.oldName, newName: op.newName },
    };
  }
  if (op.op === 'rename_deck') {
    const deckId = resolveDeckId(op, 'deck', index, indexMap);
    return {
      method: 'PUT',
      url: `${baseUrl()}/api/decks/${encodeURIComponent(deckId)}/rename`,
      body: { newName: op.newName },
    };
  }
  // merge_deck
  const sourceDeckId = resolveDeckId(op, 'source', index, indexMap);
  const targetDeckId = resolveDeckId(op, 'target', index, indexMap);
  if (sourceDeckId === targetDeckId) {
    throw new Error(`operations[${index}] cannot merge a deck into itself`);
  }
  return {
    method: 'POST',
    url: `${baseUrl()}/api/decks/${encodeURIComponent(sourceDeckId)}/merge-into/${encodeURIComponent(targetDeckId)}`,
    body: null,
  };
}

async function applyOne(op, key, index, indexMap) {
  const { method, url, body } = buildRequest(op, index, indexMap);
  const headers = { 'x-api-key': key };
  if (body !== null) headers['content-type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
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
  let indexMap = new Map();
  if (plan.operations.some(needsDeckIndex)) {
    try {
      indexMap = await fetchDeckIndex(key);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      process.exitCode = 1;
      return;
    }
  }
  const applied = [];
  for (let i = 0; i < plan.operations.length; i++) {
    const op = plan.operations[i];
    try {
      const result = await applyOne(op, key, i, indexMap);
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
