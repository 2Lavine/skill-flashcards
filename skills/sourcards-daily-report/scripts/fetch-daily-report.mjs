#!/usr/bin/env node
/**
 * Fetch a daily review report from the SourCards API using a Personal
 * Integration Token (stats:read permission) and render it as Markdown.
 *
 * Usage:
 *   node fetch-daily-report.mjs                       # last 7 days, Markdown → stdout
 *   node fetch-daily-report.mjs --days 30             # last 30 days
 *   node fetch-daily-report.mjs --days 7 --json       # raw API payload (cron/agent reuse)
 *   node fetch-daily-report.mjs --out report.md       # write file
 *   FLASHCARD_API_KEY=sc_int_… node fetch-daily-report.mjs
 *
 * Endpoints: GET /api/stats, GET /api/daily-counts?days=N, GET /api/streak
 * Token access is metered by the membership-tier daily request quota; every
 * call returns X-RateLimit-Limit / X-RateLimit-Remaining response headers.
 *
 * Exit: 0 success, 1 API/IO failure, 2 bad usage.
 */

import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapEnv } from '../lib/load-env.mjs';

// Discovery: process.env first, then this skill folder `.env.local` / `.env`,
// then walk-up. Files never override already-set keys.
bootstrapEnv({ scriptDir: dirname(fileURLToPath(import.meta.url)) });

// ---- config ------------------------------------------------------------------

const OFFICIAL_BASE_URL = 'https://sourcard.sourmonkey.xyz';
function baseUrl() {
  return (process.env.SOURCARDS_API_BASE_URL || OFFICIAL_BASE_URL).replace(/\/+$/, '');
}

function token() {
  return process.env.FLASHCARD_API_KEY || '';
}

// ---- args --------------------------------------------------------------------

const argv = process.argv.slice(2);
let days = 7;
let localDay;
let jsonOut = false;
let outFile = null;

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--days') {
    const v = Number(argv[++i]);
    if (!Number.isFinite(v) || v <= 0 || v > 365) {
      console.error('--days must be an integer in 1..365');
      process.exit(2);
    }
    days = Math.floor(v);
  } else if (arg === '--localDay') {
    localDay = argv[++i];
  } else if (arg === '--json') {
    jsonOut = true;
  } else if (arg === '--out') {
    outFile = argv[++i];
  } else if (arg === '--help' || arg === '-h') {
    console.log(`Usage: fetch-daily-report.mjs [--days N] [--localDay YYYY-MM-DD] [--json] [--out FILE]`);
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${arg}`);
    process.exit(2);
  }
}

// ---- request -----------------------------------------------------------------

async function getJson(path) {
  const key = token();
  const headers = {};
  if (key) headers['x-api-key'] = key;
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  const rateLimit = res.headers.get('x-ratelimit-limit');
  const rateRemaining = res.headers.get('x-ratelimit-remaining');

  if (!res.ok) {
    if (res.status === 401) {
      const err = new Error(
        'API 未授权 (401)。请设置 FLASHCARD_API_KEY 为有效的 Personal Integration Token（Settings → Integrations → 个人集成令牌）。',
      );
      err.exitCode = 1;
      throw err;
    }
    if (res.status === 429) {
      const err = new Error(
        `今日 API 访问配额已用完 (429)。剩余：${rateRemaining ?? 0} / ${rateLimit ?? '?'}。` +
          ' 配额按会员等级每日重置（Free 100 次/天，Lite/Lifetime 5000 次/天）。',
      );
      err.exitCode = 1;
      throw err;
    }
    const message =
      (data && typeof data.message === 'string' && data.message) ||
      (data && typeof data.error === 'string' && data.error) ||
      `HTTP ${res.status}`;
    const err = new Error(`API 请求失败：${message}`);
    err.exitCode = 1;
    throw err;
  }

  return { data, rateLimit, rateRemaining };
}

// ---- report rendering --------------------------------------------------------

function fmtCount(n) {
  return typeof n === 'number' ? String(n) : '-';
}

function renderMarkdown(stats, dailyCounts, streak, rateInfo) {
  const s = stats || {};
  const today = s.today ?? 0;
  const totalReviews = s.totalReviews ?? 0;
  const perDay = (dailyCounts?.daily ?? []).map((d) => `${d.date}: ${d.count}`).join('\n');

  const lines = [];
  lines.push('# 每日复习报表');
  lines.push('');
  lines.push('## 今日概览');
  lines.push('');
  lines.push(`- 今日复习：**${fmtCount(today)}** 张`);
  lines.push(`- 累计复习：${fmtCount(totalReviews)} 张`);
  lines.push(`- 连续天数：${fmtCount(streak?.streak)} 天`);
  lines.push(`- 卡片总数：${fmtCount(s.total)}（待复习 ${fmtCount(s.due)}，学习中 ${fmtCount(s.learning)}，复习中 ${fmtCount(s.review)}）`);
  if (rateInfo.limit != null) {
    lines.push(`- 配额剩余：${rateInfo.remaining} / ${rateInfo.limit}（今日 API 次数）`);
  }
  lines.push('');
  lines.push('## 每日明细');
  lines.push('');
  if (perDay) {
    lines.push('```');
    lines.push(perDay);
    lines.push('```');
  } else {
    lines.push('（无数据）');
  }
  lines.push('');
  return lines.join('\n');
}

// ---- main --------------------------------------------------------------------

async function main() {
  const statsPath = localDay ? `/api/stats?localDay=${encodeURIComponent(localDay)}` : '/api/stats';
  const countsPath = `/api/daily-counts?days=${days}${localDay ? `&localDay=${encodeURIComponent(localDay)}` : ''}`;
  const streakPath = localDay ? `/api/streak?localDay=${encodeURIComponent(localDay)}` : '/api/streak';

  const [statsRes, countsRes, streakRes] = await Promise.all([
    getJson(statsPath),
    getJson(countsPath),
    getJson(streakPath),
  ]);

  const rateInfo = {
    limit: statsRes.rateLimit ?? countsRes.rateLimit ?? streakRes.rateLimit ?? null,
    remaining: statsRes.rateRemaining ?? countsRes.rateRemaining ?? streakRes.rateRemaining ?? null,
  };

  let output;
  if (jsonOut) {
    output = JSON.stringify(
      {
        stats: statsRes.data,
        dailyCounts: countsRes.data,
        streak: streakRes.data,
        rateLimit: rateInfo,
      },
      null,
      2,
    );
  } else {
    output = renderMarkdown(statsRes.data, countsRes.data, streakRes.data, rateInfo);
  }

  if (outFile) {
    writeFileSync(outFile, output + '\n', 'utf8');
    console.error(`报表已写入 ${outFile}`);
  } else {
    process.stdout.write(output + '\n');
  }
}

main().catch((err) => {
  const code = typeof err.exitCode === 'number' ? err.exitCode : 1;
  console.error(err.message);
  process.exit(code);
});
