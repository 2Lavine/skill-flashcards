#!/usr/bin/env node
/**
 * Fetch one local day's SourCards review packet for an agent retro.
 *
 *   node fetch-retro.mjs --json
 *   node fetch-retro.mjs --localDay 2026-10-28 --tzOffsetMinutes 480 --json
 *
 * Exit: 0 ok, 1 API/IO, 2 bad usage.
 */

import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapEnv } from '../lib/load-env.mjs';

bootstrapEnv({ scriptDir: dirname(fileURLToPath(import.meta.url)) });

const OFFICIAL_BASE_URL = 'https://sourcard.sourmonkey.xyz';
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;
const RATING_LABEL = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

function baseUrl() {
  return (process.env.SOURCARDS_API_BASE_URL || OFFICIAL_BASE_URL).replace(/\/+$/, '');
}

function localDayStamp(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const argv = process.argv.slice(2);
let localDay = localDayStamp();
let tzOffsetMinutes = -new Date().getTimezoneOffset();
let days = 7;
let jsonOut = false;
let outFile = null;

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--localDay') {
    localDay = argv[++i] ?? '';
  } else if (arg === '--tzOffsetMinutes') {
    tzOffsetMinutes = Number(argv[++i]);
  } else if (arg === '--days') {
    days = Number(argv[++i]);
  } else if (arg === '--json') {
    jsonOut = true;
  } else if (arg === '--out') {
    outFile = argv[++i];
  } else if (arg === '--help' || arg === '-h') {
    console.log('Usage: fetch-retro.mjs [--localDay YYYY-MM-DD] [--tzOffsetMinutes N] [--days N] [--json] [--out FILE]');
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${arg}`);
    process.exit(2);
  }
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(localDay)) {
  console.error('--localDay must be YYYY-MM-DD');
  process.exit(2);
}
if (!Number.isInteger(tzOffsetMinutes) || tzOffsetMinutes < -840 || tzOffsetMinutes > 840) {
  console.error('--tzOffsetMinutes must be an integer from -840 to 840');
  process.exit(2);
}
if (!Number.isInteger(days) || days < 1 || days > 365) {
  console.error('--days must be an integer in 1..365');
  process.exit(2);
}

async function getJson(path) {
  const key = process.env.FLASHCARD_API_KEY || '';
  const headers = {};
  if (key) headers['x-api-key'] = key;
  const res = await fetch(`${baseUrl()}${path}`, { method: 'GET', headers });
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
    const detail = (data && (data.message || data.error)) || `HTTP ${res.status}`;
    let message = `API 请求失败：${detail}`;
    if (res.status === 401) {
      message = 'API 未授权 (401)。请设置 FLASHCARD_API_KEY 为带 stats:read 的 Personal Integration Token。';
    } else if (res.status === 429) {
      message = `今日 API 配额已用完 (429)。剩余：${rateRemaining ?? 0} / ${rateLimit ?? '?'}。`;
    } else if (res.status === 404 && path.startsWith('/api/review-logs')) {
      message = 'GET /api/review-logs 返回 404。这个部署还没有今日卡片分页，复盘停在这里，不要改用别的接口猜卡片。';
    }
    const err = new Error(message);
    err.exitCode = 1;
    throw err;
  }
  return { data, rateLimit, rateRemaining };
}

function withQuery(path, params) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') q.set(key, String(value));
  }
  const text = q.toString();
  return text ? `${path}?${text}` : path;
}

async function main() {
  const dayQuery = { localDay, tzOffsetMinutes };
  const [statsRes, countsRes, streakRes] = await Promise.all([
    getJson(withQuery('/api/stats', { localDay })),
    getJson(withQuery('/api/daily-counts', { days, localDay })),
    // Streak only exists as a CURRENT value: asking for a past localDay makes the
    // server compare the stored last day against it and answer 0. Ask for the
    // current streak instead, and label it 截至今天 in the Markdown.
    getJson(withQuery('/api/streak', { localDay: localDay === localDayStamp() ? localDay : undefined })),
  ]);

  const logs = [];
  let cursor = null;
  let pages = 0;
  let truncated = false;
  let rateLimit = statsRes.rateLimit;
  let rateRemaining = statsRes.rateRemaining;
  do {
    const page = await getJson(withQuery('/api/review-logs', {
      ...dayQuery,
      limit: PAGE_LIMIT,
      cursor,
    }));
    pages += 1;
    rateLimit = page.rateLimit ?? rateLimit;
    rateRemaining = page.rateRemaining ?? rateRemaining;
    const rows = Array.isArray(page.data?.logs) ? page.data.logs : [];
    for (const row of rows) {
      logs.push({
        ...row,
        ratingLabel: RATING_LABEL[row.rating] ?? String(row.rating),
      });
    }
    cursor = typeof page.data?.nextCursor === 'string' ? page.data.nextCursor : null;
    if (cursor && pages >= MAX_PAGES) {
      truncated = true;
      cursor = null;
    }
  } while (cursor);

  const packet = {
    localDay,
    tzOffsetMinutes,
    stats: statsRes.data,
    dailyCounts: countsRes.data,
    streak: streakRes.data,
    reviews: {
      count: logs.length,
      pages,
      truncated,
      logs,
    },
    unavailable: ['pomodoro'],
    rateLimit: {
      limit: rateLimit,
      remaining: rateRemaining,
    },
  };

  const text = jsonOut
    ? `${JSON.stringify(packet, null, 2)}\n`
    : renderMarkdown(packet);
  if (outFile) {
    writeFileSync(outFile, text);
    console.log(outFile);
  } else {
    process.stdout.write(text);
  }
}

function renderMarkdown(packet) {
  // stats.today is a CURRENT-day counter; for a past --localDay it reads 0.
  // The per-day counter is the only route that answers "how many on that day".
  const dayRow = (packet.dailyCounts?.daily ?? []).find((d) => d.date === packet.localDay);
  const dayTotal = dayRow ? dayRow.count : (packet.stats?.today ?? '?');
  const streak = packet.streak?.streak ?? '?';
  const isCurrentDay = packet.localDay === localDayStamp();
  const lines = [
    `# ${packet.localDay} 复习数据`,
    '',
    `- 当日复习：${dayTotal}${dayRow ? '（每日计数）' : '（stats.today）'}`,
    isCurrentDay ? `- 连续天数：${streak}` : `- 当前连续天数（截至今天）：${streak}`,
    `- 拉到的卡片行：${packet.reviews.count}${packet.reviews.truncated ? '（后面还有，已截断）' : ''}`,
    '- 番茄钟：服务端没有',
    '',
    '## 卡片',
  ];
  if (!packet.reviews.logs.length) {
    lines.push('（这一天的列表是空的）');
  }
  for (const row of packet.reviews.logs) {
    const where = [row.deck, row.category].filter(Boolean).join(' / ');
    lines.push(`- [${row.ratingLabel}] ${where ? `${where} · ` : ''}${row.question}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(err?.exitCode || 1);
});
