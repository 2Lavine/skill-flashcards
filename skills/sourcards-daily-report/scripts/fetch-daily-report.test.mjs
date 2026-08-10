// Tests for fetch-daily-report.mjs
// Run: node --test skills/sourcards-daily-report/scripts/fetch-daily-report.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, 'fetch-daily-report.mjs');

// Async spawn (not spawnSync): the mock HTTP server's connection handling runs
// on this process's event loop, which spawnSync would block.
function run(args, { env = {}, handler } = {}) {
  const childEnv = {
    ...process.env,
    SOURCARDS_API_SKIP_ENV_FILE: '1',
    FLASHCARD_API_KEY: 'sc_int_test-token',
    ...env,
  };

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
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
        resolve({ code, out, err, combined: out + err });
      });
    });
  });
}

function json(res, body, status = 200, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

const statsPayload = {
  total: 120,
  due: 12,
  new: 3,
  learning: 2,
  review: 7,
  totalReviews: 432,
  today: 9,
  avgDifficulty: '5.20',
};
const countsPayload = {
  daily: [
    { label: 'Mon', date: '2026-08-10', count: 4 },
    { label: 'Tue', date: '2026-08-11', count: 9 },
  ],
};
const streakPayload = { streak: 5 };

test('renders a Markdown report with stats, counts and streak', async () => {
  const { code, out, err } = await run([], {
    handler: (req, res) => {
      if (req.url.startsWith('/api/stats')) return json(res, statsPayload);
      if (req.url.startsWith('/api/daily-counts')) return json(res, countsPayload);
      if (req.url.startsWith('/api/streak')) return json(res, streakPayload);
      res.writeHead(404);
      res.end('not found');
    },
  });
  assert.equal(code, 0);
  assert.match(out, /# 每日复习报表/);
  assert.match(out, /今日复习：\*\*9\*\*/);
  assert.match(out, /累计复习：432/);
  assert.match(out, /连续天数：5 天/);
  assert.match(out, /2026-08-10: 4/);
  assert.equal(err, '');
});

test('--json emits the raw API payload for cron/agent reuse', async () => {
  const { code, out } = await run(['--json'], {
    handler: (req, res) => {
      if (req.url.startsWith('/api/stats')) return json(res, statsPayload);
      if (req.url.startsWith('/api/daily-counts')) return json(res, countsPayload);
      if (req.url.startsWith('/api/streak')) return json(res, streakPayload);
      res.writeHead(404);
      res.end('not found');
    },
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(out);
  assert.equal(parsed.stats.today, 9);
  assert.equal(parsed.streak.streak, 5);
  assert.equal(parsed.dailyCounts.daily.length, 2);
});

test('surfaces the daily request quota via response headers', async () => {
  const { code, out } = await run([], {
    handler: (req, res) => {
      const headers = { 'x-ratelimit-limit': '100', 'x-ratelimit-remaining': '97' };
      if (req.url.startsWith('/api/stats')) return json(res, statsPayload, 200, headers);
      if (req.url.startsWith('/api/daily-counts')) return json(res, countsPayload, 200, headers);
      if (req.url.startsWith('/api/streak')) return json(res, streakPayload, 200, headers);
      res.writeHead(404);
      res.end('not found');
    },
  });
  assert.equal(code, 0);
  assert.match(out, /配额剩余：97 \/ 100/);
});

test('fails with a clear message when the daily quota is exhausted (429)', async () => {
  const { code, err } = await run([], {
    handler: (_req, res) => {
      json(
        res,
        { error: 'api_quota_exceeded', message: '今日 API 访问次数已达上限（100/100）', limit: 100 },
        429,
        { 'x-ratelimit-limit': '100', 'x-ratelimit-remaining': '0' },
      );
    },
  });
  assert.equal(code, 1);
  assert.match(err, /配额已用完/);
  assert.match(err, /100/);
});

test('fails with a clear message on an invalid token (401)', async () => {
  const { code, err } = await run([], {
    handler: (_req, res) => {
      json(res, { error: 'Unauthorized' }, 401);
    },
  });
  assert.equal(code, 1);
  assert.match(err, /FLASHCARD_API_KEY/);
});

test('rejects bad usage (--days out of range, unknown flag) with exit 2', async () => {
  const badDays = await run(['--days', '0']);
  assert.equal(badDays.code, 2);
  const badFlag = await run(['--nope']);
  assert.equal(badFlag.code, 2);
});
