// Tests for lint-cards.mjs. Zero-dependency: node:test + child spawn, asserting
// on stdout + exit code. Run: node --test scripts/lint-cards.test.mjs
//
// A tiny stub HTTP server stands in for the /api/decks + /api/categories
// catalog so the --catalog path is exercised without a live backend.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LINT = join(__dirname, 'lint-cards.mjs');

// Synchronous run — for tests that don't touch the stub catalog server.
function lint(payload, args = [], env = {}) {
  const r = spawnSync('node', [LINT, ...args], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

// Async run — REQUIRED when a stub server is live in this process. spawnSync
// would block the event loop, the in-process server could never answer the
// child's fetch, and the two would deadlock. Async spawn keeps the loop free.
function lintAsync(payload, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [LINT, ...args], { env: { ...process.env, ...env } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out }));
    child.stdin.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  });
}

// Spin up a stub catalog server for the duration of `fn`, then tear it down —
// destroying live sockets so keep-alive connections can't keep the loop alive.
async function withCatalog(fn) {
  const sockets = new Set();
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/api/decks'))
      return res.end(JSON.stringify({ decks: [{ name: '数学' }, { name: '心理学' }] }));
    if (req.url.startsWith('/api/categories'))
      return res.end(JSON.stringify({ categories: ['博弈论', '概率论'] }));
    res.statusCode = 404;
    res.end('{}');
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise((r) => server.close(r));
  }
}

// ---- blocking (exit 1) -----------------------------------------------------

test('invalid LaTeX escape → JSON.parse fails, exit 1, points at the macro', () => {
  // A single backslash before "sigma" is an invalid JSON escape. In this JS
  // source, "\\s" is one real backslash + s — exactly what breaks JSON.parse.
  const raw = '{"deck":"数学","cards":[{"question":"$\\sigma$","answer":"a"}]}';
  const { code, out } = lint(raw);
  assert.equal(code, 1);
  assert.match(out, /JSON\.parse failed/);
  assert.match(out, /invalid backslash escape/);
});

test('silent form-feed corruption (valid \\f escape) → exit 1, names the card', () => {
  // "\frac" as a valid JSON escape parses to U+000C form-feed.
  const raw = '{"deck":"x","cards":[{"question":"q","answer":"\\frac{1}{2}"}]}';
  const { code, out } = lint(raw);
  assert.equal(code, 1);
  assert.match(out, /control char/);
  assert.match(out, /card\[0\]\.answer/);
});

test('missing required fields → exit 1', () => {
  const { code, out } = lint({ deck: '数学', cards: [{ question: 'q' }] });
  assert.equal(code, 1);
  assert.match(out, /missing "answer"/);
});

test('empty cards array → exit 1', () => {
  const { code, out } = lint({ deck: '数学', cards: [] });
  assert.equal(code, 1);
  assert.match(out, /empty "cards"/);
});

// ---- run-to-completion: all issues listed, no truncation -------------------

test('multiple soft issues all reported in one pass, exit 0', () => {
  const { code, out } = lint({
    deck: '数学',
    source: '脱不花讲课',
    cards: [{ question: '什么是 {{c1::X}}?', answer: '一个变量 $a', category: '数学/算法', tags: ['type:concept'] }],
  });
  assert.equal(code, 0);
  assert.match(out, /looks like a description/);       // source prose
  assert.match(out, /contains "\/"/);                   // category slash
  assert.match(out, /no "alias:/);                      // missing alias
  assert.match(out, /Form A.*Form B|mixing is invalid/); // cloze mix
  assert.match(out, /odd number of "\$"/);              // unbalanced math
});

test('unknown type tag → warning, exit 0', () => {
  const { code, out } = lint({ deck: '数学', cards: [{ question: 'q', answer: 'a', tags: ['type:conept', 'alias:x'] }] });
  assert.equal(code, 0);
  assert.match(out, /unknown type tag "type:conept"/);
});

// ---- clean -----------------------------------------------------------------

test('clean payload → exit 0, single clean line', () => {
  const { code, out } = lint({
    deck: '数学',
    source: 'https://ex.com',
    cards: [{ question: 'What is X?', answer: 'y', tags: ['type:concept', 'alias:X'], category: '算法' }],
  });
  assert.equal(code, 0);
  assert.match(out, /lint clean/);
});

// ---- catalog cross-check ---------------------------------------------------

test('catalog: existing deck+category reused, drift + new flagged', async () => {
  const { code, out } = await withCatalog((base) => lintAsync(
    {
      deck: '数学',
      cards: [
        { question: 'q1', answer: 'a1', category: '博弈论' },  // exists
        { question: 'q2', answer: 'a2', category: '概率轮' },  // drift of 概率论
        { question: 'q3', answer: 'a3', category: '拓扑学' },  // genuinely new
      ],
    },
    ['--catalog', base],
    { FLASHCARD_API_KEY: 'testkey' },
  ));
  assert.equal(code, 0);
  assert.match(out, /deck "数学" — same as an existing deck/);
  assert.match(out, /概率轮.*looks like existing "概率论"/);
  assert.match(out, /拓扑学.*NEW \(no existing/);
  assert.match(out, /naming rules for any NEW/);        // rules printed when new exists
});

test('catalog: deck typo drift flagged (心里学 ~ 心理学)', async () => {
  const { out } = await withCatalog((base) => lintAsync(
    { deck: '心里学', cards: [{ question: 'q', answer: 'a', category: '概率论' }] },
    ['--catalog', base],
    { FLASHCARD_API_KEY: 'testkey' },
  ));
  assert.match(out, /deck "心里学" — NEW, but looks like existing "心理学"/);
});

test('catalog: all-existing → no naming-rule spam', async () => {
  const { out } = await withCatalog((base) => lintAsync(
    { deck: '数学', cards: [{ question: 'q', answer: 'a', category: '博弈论' }] },
    ['--catalog', base],
    { FLASHCARD_API_KEY: 'testkey' },
  ));
  assert.doesNotMatch(out, /naming rules for any NEW/);
});

test('catalog: no API key → skipped, not crashed', async () => {
  const { code, out } = await withCatalog((base) => lintAsync(
    { deck: '数学', cards: [{ question: 'q', answer: 'a', category: '博弈论' }] },
    ['--catalog', base],
    { FLASHCARD_API_KEY: '' },
  ));
  assert.equal(code, 0);
  assert.match(out, /FLASHCARD_API_KEY not set/);
});

test('catalog: bad JSON payload → catalog skipped, exit 1', async () => {
  const raw = '{"deck":"数学","cards":[{"question":"$\\sigma$","answer":"a"}]}';
  const { code, out } = await withCatalog((base) => lintAsync(
    raw, ['--catalog', base], { FLASHCARD_API_KEY: 'testkey' },
  ));
  assert.equal(code, 1);
  assert.doesNotMatch(out, /same as an existing deck/); // catalog not attempted
});
