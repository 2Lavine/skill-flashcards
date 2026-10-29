// Tests for fetch-daily-html.mjs
// Run: node --test skills/sourcards-daily-report/scripts/fetch-daily-html.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, 'fetch-daily-html.mjs');

function run(args, { handler }) {
  const childEnv = {
    ...process.env,
    SOURCARDS_API_SKIP_ENV_FILE: '1',
    FLASHCARD_API_KEY: 'sc_int_test-token',
  };
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      req.on('data', () => {});
      req.on('end', () => {
        try {
          handler(req, res);
        } catch (err) {
          res.writeHead(500);
          res.end(String(err.message || err));
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const child = spawn('node', [SCRIPT, ...args], {
        env: { ...childEnv, SOURCARDS_API_BASE_URL: `http://127.0.0.1:${port}` },
        timeout: 10_000,
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      child.on('error', reject);
      child.on('close', (code) => {
        server.close();
        resolve({ code, out, err });
      });
    });
  });
}

function json(res, body) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const dailyCounts = {
  daily: [
    { label: 'Tue', date: '2026-10-27', count: 3 },
    { label: 'Wed', date: '2026-10-28', count: 3 },
  ],
};
const stats = { total: 10, due: 4, new: 1, learning: 0, review: 9, totalReviews: 99, today: 0, avgDaily30: 5, avgDifficulty: '5.00' };
const reviewPages = {
  logs: [
    { id: 3, cardId: 'c1', rating: 1, state: 2, review: '2026-10-28T02:00:00.000Z', question: '甲题？', questionTruncated: false, category: '概率论', deck: '数学' },
    { id: 2, cardId: 'c2', rating: 2, state: 2, review: '2026-10-28T02:01:00.000Z', question: '乙题？', questionTruncated: false, category: '概率论', deck: '数学' },
    { id: 1, cardId: 'c3', rating: 3, state: 2, review: '2026-10-28T02:03:00.000Z', question: '丙题？', questionTruncated: false, category: '统计', deck: '数学' },
  ],
  nextCursor: null,
};

test('writes a self-contained HTML report for the requested local day', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sourcards-html-'));
  const out = join(dir, 'report.html');
  try {
    const { code, err } = await run(['--localDay', '2026-10-28', '--tzOffsetMinutes', '480', '--out', out], {
      handler: (req, res) => {
        if (req.url.startsWith('/api/daily-counts')) return json(res, dailyCounts);
        if (req.url.startsWith('/api/stats')) return json(res, stats);
        if (req.url.startsWith('/api/streak')) return json(res, { streak: 7 });
        if (req.url.startsWith('/api/review-logs')) return json(res, reviewPages);
        res.writeHead(404);
        res.end('not found');
      },
    });
    assert.equal(code, 0, err);
    const html = readFileSync(out, 'utf8');
    assert.match(html, /2026-10-28 复习日报/);
    // Day total comes from daily-counts (3), not from stats.today (0).
    assert.match(html, /计数器 3 次 · 明细 3 行/);
    assert.match(html, /甲题？/);
    assert.match(html, /Again 1/);
    assert.match(html, /连续天数<\/div><div class="v">7/);
    assert.doesNotMatch(html, /<script src=/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects a bad --localDay with exit 2', async () => {
  const { code } = await run(['--localDay', '2026-13-01'], {
    handler: (_req, res) => json(res, {}),
  });
  assert.equal(code, 2);
});
