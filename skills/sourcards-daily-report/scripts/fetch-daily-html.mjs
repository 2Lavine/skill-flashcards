#!/usr/bin/env node
/**
 * One local day's SourCards review report as a self-contained HTML file.
 *
 *   node fetch-daily-html.mjs                          # yesterday (machine local day)
 *   node fetch-daily-html.mjs --localDay 2026-10-28 --tzOffsetMinutes 480
 *   node fetch-daily-html.mjs --localDay 2026-10-28 --out report.html
 *
 * Endpoints (all stats:read):
 *   GET /api/daily-counts?days=N&localDay=   per-day counts (works for past days)
 *   GET /api/stats                           inventory + today (CURRENT day only)
 *   GET /api/streak                          current streak (CURRENT day only)
 *   GET /api/review-logs?localDay=&tzOffsetMinutes=&limit=&cursor=
 *
 * Exit: 0 ok, 1 API/IO, 2 bad usage.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapEnv } from '../lib/load-env.mjs';

bootstrapEnv({ scriptDir: dirname(fileURLToPath(import.meta.url)) });

const OFFICIAL_BASE_URL = 'https://sourcard.sourmonkey.xyz';
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;
const QUESTION_MAX = 2000;
const RATING = {
  1: { label: 'Again', color: '#b4443c', hint: '没想起来' },
  2: { label: 'Hard', color: '#a9762c', hint: '想起来了，很吃力' },
  3: { label: 'Good', color: '#3f7d5a', hint: '正常想起' },
  4: { label: 'Easy', color: '#4a6fa5', hint: '太简单' },
};
const STATE_LABEL = { 0: 'New', 1: 'Learning', 2: 'Review', 3: 'Relearning' };
const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function baseUrl() {
  return (process.env.SOURCARDS_API_BASE_URL || OFFICIAL_BASE_URL).replace(/\/+$/, '');
}

function localDayStamp(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDay(day, delta) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.toISOString().slice(0, 10);
}

function isCalendarDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function weekdayOf(day) {
  const [y, m, d] = day.split('-').map(Number);
  return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// ---- args --------------------------------------------------------------------

const argv = process.argv.slice(2);
let tzOffsetMinutes = -new Date().getTimezoneOffset();
let localDay = shiftDay(localDayStamp(), -1);
let trendDays = 14;
let outFile = null;

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--localDay') {
    localDay = argv[++i] ?? '';
  } else if (arg === '--tzOffsetMinutes') {
    tzOffsetMinutes = Number(argv[++i]);
  } else if (arg === '--days') {
    trendDays = Number(argv[++i]);
  } else if (arg === '--out') {
    outFile = argv[++i];
  } else if (arg === '--help' || arg === '-h') {
    console.log('Usage: fetch-daily-html.mjs [--localDay YYYY-MM-DD] [--tzOffsetMinutes N] [--days N] [--out FILE]');
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${arg}`);
    process.exit(2);
  }
}

if (!isCalendarDay(localDay)) {
  console.error('--localDay must be a real calendar day (YYYY-MM-DD)');
  process.exit(2);
}
if (!Number.isInteger(tzOffsetMinutes) || tzOffsetMinutes < -840 || tzOffsetMinutes > 840) {
  console.error('--tzOffsetMinutes must be an integer from -840 to 840');
  process.exit(2);
}
if (!Number.isInteger(trendDays) || trendDays < 3 || trendDays > 90) {
  console.error('--days must be an integer in 3..90');
  process.exit(2);
}

// ---- request -----------------------------------------------------------------

let quotaLimit = null;
let quotaRemaining = null;

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
  quotaLimit = res.headers.get('x-ratelimit-limit') ?? quotaLimit;
  quotaRemaining = res.headers.get('x-ratelimit-remaining') ?? quotaRemaining;
  if (!res.ok) {
    const detail = (data && (data.message || data.error)) || `HTTP ${res.status}`;
    let message = `API 请求失败：${detail}`;
    if (res.status === 401) {
      message = 'API 未授权 (401)。请设置 FLASHCARD_API_KEY 为带 stats:read 的 Personal Integration Token。';
    } else if (res.status === 429) {
      message = `今日 API 配额已用完 (429)。剩余：${quotaRemaining ?? 0} / ${quotaLimit ?? '?'}。`;
    } else if (res.status === 404 && path.startsWith('/api/review-logs')) {
      message = 'GET /api/review-logs 返回 404：这个部署还没有「单日卡片」分页，先升级 / 部署服务端。';
    }
    const err = new Error(message);
    err.exitCode = 1;
    throw err;
  }
  return data;
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
  const [dailyCounts, stats, streak] = await Promise.all([
    getJson(withQuery('/api/daily-counts', { days: trendDays, localDay })),
    getJson('/api/stats'),
    getJson('/api/streak'),
  ]);

  const logs = [];
  let cursor = null;
  let pages = 0;
  let truncated = false;
  do {
    const page = await getJson(withQuery('/api/review-logs', {
      localDay,
      tzOffsetMinutes,
      limit: PAGE_LIMIT,
      cursor,
    }));
    pages += 1;
    const rows = Array.isArray(page?.logs) ? page.logs : [];
    for (const row of rows) logs.push(row);
    cursor = typeof page?.nextCursor === 'string' ? page.nextCursor : null;
    if (cursor && pages >= MAX_PAGES) {
      truncated = true;
      cursor = null;
    }
  } while (cursor);

  const report = buildReport({ logs, dailyCounts, stats, streak, truncated, pages });
  const html = renderHtml(report);
  const target = resolve(outFile || `sourcards-daily-${localDay}.html`);
  writeFileSync(target, html, 'utf8');
  console.log(target);
}

// ---- aggregate ---------------------------------------------------------------

function localTime(iso, tz) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + tz * 60_000);
  return {
    date: d.toISOString().slice(0, 10),
    hh: d.getUTCHours(),
    mm: d.getUTCMinutes(),
  };
}

function buildReport({ logs, dailyCounts, stats, streak, truncated, pages }) {
  const tz = tzOffsetMinutes;
  const daily = Array.isArray(dailyCounts?.daily) ? dailyCounts.daily : [];
  const dayRow = daily.find((d) => d.date === localDay);
  const counted = dayRow ? dayRow.count : null;

  const rows = logs
    .map((row) => {
      const t = localTime(row.review, tz);
      return {
        id: row.id,
        cardId: row.cardId,
        rating: row.rating,
        ratingLabel: RATING[row.rating]?.label ?? String(row.rating),
        state: row.state,
        stateLabel: STATE_LABEL[row.state] ?? String(row.state),
        review: row.review,
        question: row.question ?? '',
        truncated: Boolean(row.questionTruncated),
        category: row.category || '',
        deck: row.deck || '',
        hh: t?.hh ?? null,
        mm: t?.mm ?? null,
        clock: t ? `${String(t.hh).padStart(2, '0')}:${String(t.mm).padStart(2, '0')}` : '—',
      };
    })
    .sort((a, b) => a.review.localeCompare(b.review));

  const byKey = (key) => {
    const m = new Map();
    for (const r of rows) {
      const k = key(r) || '（无）';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const ratings = [1, 2, 3, 4].map((v) => ({
    value: v,
    label: RATING[v].label,
    color: RATING[v].color,
    count: rows.filter((r) => r.rating === v).length,
  }));

  const decks = byKey((r) => r.deck);
  const categories = byKey((r) => r.category);

  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: rows.filter((r) => r.hh === h).length,
  }));

  // Dwell estimate: a review's start is the previous review's timestamp on this
  // day. Caps at 10 min so an AFK break is not counted as study time. This is a
  // derived number; the API has no per-card duration.
  let dwellSec = 0;
  let dwellCapped = 0;
  for (let i = 1; i < rows.length; i++) {
    const gap = (Date.parse(rows[i].review) - Date.parse(rows[i - 1].review)) / 1000;
    if (!Number.isFinite(gap) || gap <= 0) continue;
    if (gap > 600) dwellCapped += 1;
    dwellSec += Math.min(gap, 600);
  }

  const againRate = rows.length ? (ratings[0].count / rows.length) * 100 : 0;
  const first = rows[0] ?? null;
  const last = rows.at(-1) ?? null;

  return {
    localDay,
    weekday: weekdayOf(localDay),
    tz,
    generatedAt: new Date().toISOString(),
    counted,
    rows,
    rowCount: rows.length,
    truncated,
    pages,
    ratings,
    decks,
    categories,
    hours,
    dwellSec,
    dwellCapped,
    againRate,
    firstClock: first?.clock ?? null,
    lastClock: last?.clock ?? null,
    spanMinutes: first && last ? Math.round((Date.parse(last.review) - Date.parse(first.review)) / 60_000) : 0,
    daily,
    stats: stats ?? null,
    streak: streak?.streak ?? null,
    quota: { limit: quotaLimit, remaining: quotaRemaining },
    deckDrift: detectDeckDrift(decks.map(([name]) => name)),
  };
}

/** Flag deck names whose trimmed/normalized form collides with another deck. */
function detectDeckDrift(names) {
  const norm = (s) => s.replace(/[\s·・\-—_/]+/g, '').toLowerCase();
  const groups = new Map();
  for (const n of names) {
    const k = norm(n);
    if (!k || k === '（无）') continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(n);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

// ---- render ------------------------------------------------------------------

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pct(part, total) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function fmtSpan(minutes) {
  if (!minutes || minutes < 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} 小时 ${m} 分` : `${m} 分`;
}

function renderHtml(r) {
  const countedLine = r.counted == null
    ? `计数字典里没有 ${r.localDay} 这一天的记录`
    : `计数器 ${r.counted} 次 · 明细 ${r.rowCount} 行`;
  const gap = r.counted == null ? null : r.counted - r.rowCount;

  const trendMax = Math.max(1, ...r.daily.map((d) => d.count));
  const trend = r.daily.map((d) => {
    const isDay = d.date === r.localDay;
    const h = Math.round((d.count / trendMax) * 100);
    return `<div class="trend-col${isDay ? ' is-day' : ''}" title="${esc(d.date)} ${d.count} 次">
      <span class="trend-val">${d.count || ''}</span>
      <span class="trend-bar" style="height:${d.count ? Math.max(h, 2) : 2}%"></span>
      <span class="trend-date"><span class="d-full">${esc(d.date.slice(5))}</span><span class="d-short">${esc(d.date.slice(8))}</span></span>
    </div>`;
  }).join('');

  const ratingBars = r.ratings.map((x) => `<div class="rb-row">
      <span class="rb-label">${esc(x.label)}</span>
      <span class="rb-track"><span class="rb-fill" style="width:${r.rowCount ? Math.max((x.count / r.rowCount) * 100, 0.4) : 0}%;background:${x.color}"></span></span>
      <span class="rb-count">${x.count}</span>
      <span class="rb-pct">${pct(x.count, r.rowCount)}</span>
    </div>`).join('');

  const hourMax = Math.max(1, ...r.hours.map((h) => h.count));
  const hourBars = r.hours.map((h) => `<div class="hour-col${h.count ? '' : ' is-zero'}" title="${String(h.hour).padStart(2, '0')}:00 · ${h.count} 次">
      <span class="hour-bar" style="height:${h.count ? Math.max(Math.round((h.count / hourMax) * 100), 4) : 2}%"></span>
      <span class="hour-label">${h.hour % 3 === 0 ? h.hour : ''}</span>
    </div>`).join('');

  const barList = (entries, total) => entries.slice(0, 14).map(([name, count]) => `<li class="bl-row" title="${esc(name)} · ${count}">
      <span class="bl-name">${esc(name)}</span>
      <span class="bl-track"><span class="bl-fill" style="width:${Math.max((count / total) * 100, 0.6)}%"></span></span>
      <span class="bl-count">${count}</span>
    </li>`).join('');

  const deckOptions = r.decks.map(([name]) => `<option value="${esc(name)}">${esc(name)}</option>`).join('');

  const tableRows = r.rows.map((row) => `<tr data-rating="${row.rating}" data-deck="${esc(row.deck || '（无）')}" data-q="${esc(row.question.toLowerCase())}">
      <td class="c-time">${esc(row.clock)}</td>
      <td><span class="chip" style="--chip:${RATING[row.rating]?.color ?? '#888'}">${esc(row.ratingLabel)}</span></td>
      <td class="c-where"><span class="where-deck">${esc(row.deck || '（无牌组）')}</span><span class="where-cat">${esc(row.category || '')}</span></td>
      <td class="c-q">${esc(row.question)}${row.truncated ? '<span class="trunc">题面已截断</span>' : ''}</td>
      <td class="c-state">${esc(row.stateLabel)}</td>
    </tr>`).join('\n');

  const stat = r.stats ?? {};
  const driftNote = r.deckDrift.length
    ? `<p class="note">牌组命名疑似重复：${r.deckDrift.map((g) => g.map(esc).join(' / ')).join('；')}。</p>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.localDay)} 复习日报 · SourCards</title>
<style>
  :root{
    --ink:#1d1f23; --muted:#6b6f76; --faint:#9a9ea5; --line:#e4e5e8;
    --bg:#f7f7f8; --card:#ffffff; --accent:#3b5bdb;
    --again:#b4443c; --hard:#a9762c; --good:#3f7d5a; --easy:#4a6fa5;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    background:var(--bg); color:var(--ink);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:1080px;margin:0 auto;padding:40px 24px 80px}
  header.page{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:28px;flex-wrap:wrap}
  h1{margin:0;font-size:28px;letter-spacing:-.02em;font-weight:600}
  .sub{margin:6px 0 0;color:var(--muted);font-size:13px}
  .sub .dot{color:var(--faint);margin:0 6px}
  .badge-day{display:inline-block;margin-left:10px;font-size:12px;font-weight:500;color:var(--accent);
    background:#eef1fb;border:1px solid #dfe4f7;border-radius:999px;padding:2px 10px;vertical-align:2px}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 26px}
  .kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .kpi .k{font-size:12px;color:var(--muted);letter-spacing:.02em}
  .kpi .v{font-size:26px;font-weight:600;letter-spacing:-.02em;margin-top:4px;font-variant-numeric:tabular-nums}
  .kpi .v small{font-size:13px;font-weight:400;color:var(--muted);margin-left:4px}
  .kpi .hint{font-size:11.5px;color:var(--faint);margin-top:4px}
  section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-bottom:16px}
  section h2{margin:0 0 14px;font-size:15px;font-weight:600;letter-spacing:.01em}
  section h2 .dim{font-weight:400;color:var(--faint);font-size:12.5px;margin-left:8px}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media (max-width:820px){.grid-2{grid-template-columns:1fr}}
  /* trend */
  .trend{display:flex;align-items:flex-end;gap:6px;height:132px;margin-top:6px}
  .trend-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:5px;min-width:0}
  .trend-val{font-size:10.5px;color:var(--faint);font-variant-numeric:tabular-nums}
  .trend-bar{width:100%;max-width:34px;background:#dcdfe4;border-radius:5px 5px 2px 2px;display:block;transition:background .15s}
  .trend-col.is-day .trend-bar{background:var(--accent)}
  .trend-col.is-day .trend-val{color:var(--accent);font-weight:600}
  .trend-date{font-size:10.5px;color:var(--faint);font-variant-numeric:tabular-nums;white-space:nowrap}
  .d-short{display:none}
  /* rating bars */
  .rb-row{display:grid;grid-template-columns:56px 1fr 44px 46px;align-items:center;gap:10px;margin:9px 0}
  .rb-label{font-size:13px;color:var(--muted)}
  .rb-track{height:9px;background:#f0f1f3;border-radius:999px;overflow:hidden}
  .rb-fill{display:block;height:100%;border-radius:999px}
  .rb-count{font-size:13px;text-align:right;font-variant-numeric:tabular-nums}
  .rb-pct{font-size:12px;color:var(--faint);text-align:right;font-variant-numeric:tabular-nums}
  /* hours */
  .hours{display:flex;align-items:flex-end;gap:2px;height:96px;margin-top:8px}
  .hour-col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:4px}
  .hour-bar{width:100%;background:#b9c3f0;border-radius:3px 3px 1px 1px;display:block}
  .hour-col.is-zero .hour-bar{background:#eceef1}
  .hour-label{font-size:9.5px;color:var(--faint);height:12px;font-variant-numeric:tabular-nums}
  /* bar lists */
  .bl{list-style:none;margin:0;padding:0}
  .bl-row{display:grid;grid-template-columns:minmax(90px,1.1fr) 1fr 38px;align-items:center;gap:10px;margin:7px 0}
  .bl-name{font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bl-track{height:7px;background:#f0f1f3;border-radius:999px;overflow:hidden}
  .bl-fill{display:block;height:100%;background:#c3cbe8;border-radius:999px}
  .bl-count{font-size:12px;color:var(--faint);text-align:right;font-variant-numeric:tabular-nums}
  /* cards table */
  .toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}
  .chipbtn{font:inherit;font-size:12.5px;border:1px solid var(--line);background:#fff;color:var(--muted);
    border-radius:999px;padding:5px 12px;cursor:pointer}
  .chipbtn[aria-pressed="true"]{background:#1d1f23;border-color:#1d1f23;color:#fff}
  .search{flex:1;min-width:180px;font:inherit;font-size:13px;padding:7px 11px;border:1px solid var(--line);
    border-radius:9px;background:#fff;color:var(--ink)}
  .search:focus{outline:2px solid #dfe4f7;border-color:#c8d0ef}
  select.deck{font:inherit;font-size:12.5px;padding:6px 9px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);max-width:190px}
  .countline{font-size:12px;color:var(--faint);margin-left:auto;font-variant-numeric:tabular-nums}
  table.logs{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
  table.logs thead th{position:sticky;top:0;background:#fbfbfc;text-align:left;font-weight:500;color:var(--muted);
    font-size:11.5px;letter-spacing:.03em;padding:8px 10px;border-bottom:1px solid var(--line);z-index:1}
  table.logs td{padding:8px 10px;border-bottom:1px solid #f0f1f3;vertical-align:top}
  table.logs tr:last-child td{border-bottom:none}
  table.logs tr:hover td{background:#fbfbfd}
  .c-time{font-variant-numeric:tabular-nums;color:var(--faint);white-space:nowrap;font-size:12.5px}
  .c-where{overflow:hidden;text-overflow:ellipsis}
  .where-deck{display:block;font-size:12.5px;color:var(--ink)}
  .where-cat{display:block;font-size:11.5px;color:var(--faint)}
  .c-q{color:#33363c;line-height:1.55;word-break:break-word;overflow-wrap:anywhere}
  .c-state{font-size:11.5px;color:var(--faint);white-space:nowrap}
  .chip{display:inline-block;font-size:11.5px;font-weight:500;padding:2px 8px;border-radius:999px;
    color:var(--chip);background:color-mix(in srgb, var(--chip) 10%, white);white-space:nowrap}
  .trunc{display:inline-block;margin-left:6px;font-size:10.5px;color:var(--faint);border:1px solid var(--line);border-radius:4px;padding:0 4px}
  .tablewrap{max-height:720px;overflow:auto;border:1px solid var(--line);border-radius:10px}
  .empty{padding:26px;text-align:center;color:var(--faint);font-size:13px}
  /* notes */
  .notes{margin:0;padding-left:18px;color:var(--muted);font-size:13px}
  .notes li{margin:6px 0}
  .notes b{color:var(--ink);font-weight:500}
  .note{color:var(--hard);font-size:12.5px;margin:10px 0 0}
  footer{margin-top:28px;color:var(--faint);font-size:11.5px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
  @media (max-width:640px){
    .wrap{padding:24px 16px 64px}
    h1{font-size:23px}
    /* 14 trend columns at 390px would collide: keep every value off except the day
       itself, and show every other date. */
    .trend{gap:3px}
    .trend-val{display:none}
    .trend-col.is-day .trend-val{display:block;font-size:10.5px}
    .trend-col:nth-child(even) .trend-date{opacity:0}
    .d-full{display:none}
    .d-short{display:inline}
    .hour-label{visibility:hidden}
    .hour-col:nth-child(6n+1) .hour-label{visibility:visible}
    /* Fixed column widths would collapse the question column to zero width, so let
       the table keep a readable width and scroll inside its wrapper. */
    table.logs{min-width:720px}
    .tablewrap{max-height:70vh;-webkit-overflow-scrolling:touch}
    .toolbar{gap:6px}
    .countline{margin-left:0}
  }
  @media print{
    body{background:#fff}
    .wrap{max-width:none;padding:0}
    .toolbar,.search,select.deck{display:none}
    .tablewrap{max-height:none;overflow:visible;border:none}
    section{break-inside:avoid;border-color:#ddd}
    table.logs thead th{position:static}
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="page">
    <div>
      <h1>${esc(r.localDay)} 复习日报<span class="badge-day">${esc(r.weekday)}</span></h1>
      <p class="sub">${countedLine}${r.firstClock ? `<span class="dot">·</span>${esc(r.firstClock)} – ${esc(r.lastClock)}<span class="dot">·</span>跨 ${fmtSpan(r.spanMinutes)}` : ''}</p>
    </div>
    <p class="sub">时区 UTC+${(r.tz / 60).toFixed(1).replace('.0', '')}${r.quota.remaining != null ? `<span class="dot">·</span>配额剩余 ${r.quota.remaining}/${r.quota.limit}` : ''}</p>
  </header>

  <div class="kpis">
    <div class="kpi"><div class="k">当日刷卡</div><div class="v">${r.counted ?? '—'}<small>次</small></div><div class="hint">服务端每日计数</div></div>
    <div class="kpi"><div class="k">明细行</div><div class="v">${r.rowCount}<small>行</small></div><div class="hint">${gap == null ? '无计数器可比' : gap === 0 ? '与计数一致' : `比计数少 ${gap}（已删卡 / 撤销）`}</div></div>
    <div class="kpi"><div class="k">Again 率</div><div class="v">${r.rowCount ? r.againRate.toFixed(1) : '—'}<small>%</small></div><div class="hint">没想起来的比例</div></div>
    <div class="kpi"><div class="k">估算在卡时长</div><div class="v">${Math.round(r.dwellSec / 60)}<small>分</small></div><div class="hint">相邻评分间隔累加，单卡封顶 10 分</div></div>
    <div class="kpi"><div class="k">连续天数</div><div class="v">${r.streak ?? '—'}<small>天</small></div><div class="hint">截至今天，不是这一天</div></div>
    <div class="kpi"><div class="k">库存 / 待复习</div><div class="v">${stat.total ?? '—'}<small>张</small></div><div class="hint">今日待复习 ${stat.due ?? '—'} · 累计 ${stat.totalReviews ?? '—'}</div></div>
  </div>

  <section>
    <h2>近 ${r.daily.length} 天复习量 <span class="dim">服务端每日计数（撤销不回减）</span></h2>
    <div class="trend">${trend}</div>
  </section>

  <div class="grid-2">
    <section>
      <h2>评分分布 <span class="dim">${r.rowCount} 行明细</span></h2>
      ${ratingBars || '<p class="empty">这一天没有复习记录</p>'}
    </section>
    <section>
      <h2>时段分布 <span class="dim">按 UTC+${(r.tz / 60).toFixed(1).replace('.0', '')} 的本地时钟</span></h2>
      <div class="hours">${hourBars}</div>
    </section>
  </div>

  <div class="grid-2">
    <section>
      <h2>牌组 <span class="dim">按明细行数</span></h2>
      <ul class="bl">${barList(r.decks, r.rowCount) || '<li class="empty">无</li>'}</ul>
    </section>
    <section>
      <h2>分类 <span class="dim">Top 14</span></h2>
      <ul class="bl">${barList(r.categories, r.rowCount) || '<li class="empty">无</li>'}</ul>
    </section>
  </div>

  <section>
    <h2>当天刷过的卡 <span class="dim">题面 · 评分 · 牌组 / 分类 · 时间（没有答案，接口不返回）</span></h2>
    <div class="toolbar">
      <button class="chipbtn" data-filter="all" aria-pressed="true">全部 ${r.rowCount}</button>
      <button class="chipbtn" data-filter="1" aria-pressed="false">Again ${r.ratings[0].count}</button>
      <button class="chipbtn" data-filter="2" aria-pressed="false">Hard ${r.ratings[1].count}</button>
      <button class="chipbtn" data-filter="3" aria-pressed="false">Good ${r.ratings[2].count}</button>
      <button class="chipbtn" data-filter="4" aria-pressed="false">Easy ${r.ratings[3].count}</button>
      <input class="search" id="q" type="search" placeholder="搜题面…" autocomplete="off">
      <select class="deck" id="deck"><option value="">全部牌组</option>${deckOptions}</select>
      <span class="countline" id="countline"></span>
    </div>
    <div class="tablewrap">
      <table class="logs">
        <colgroup><col style="width:62px"><col style="width:76px"><col style="width:150px"><col><col style="width:72px"></colgroup>
        <thead><tr><th>时间</th><th>评分</th><th>牌组 / 分类</th><th>题面</th><th>状态</th></tr></thead>
        <tbody id="rows">
${tableRows || '<tr><td colspan="5" class="empty">这一天没有复习记录</td></tr>'}
        </tbody>
      </table>
    </div>
    ${r.truncated ? `<p class="note">翻页达到上限（${r.pages} 页），后面的卡没拿到。</p>` : ''}
    ${driftNote}
  </section>

  <section>
    <h2>这份日报的数据从哪来、缺什么</h2>
    <ul class="notes">
      <li><b>当日次数</b>取 <code>/api/daily-counts</code> 的每日计数；<code>/api/stats</code> 的 <code>today</code> 只对「今天」有效，查历史日会返回 0，所以这里不用它。</li>
      <li><b>连续天数</b>是截至今天的当前值；服务端没有「那一天的历史连续天数」，本页不反推。</li>
      <li><b>卡片明细</b>取 <code>/api/review-logs</code>：题面、评分、牌组、分类、时间。<b>没有答案</b>，也没有标签、重要度、下次到期时间。</li>
      <li><b>已删卡不出现</b>：明细按卡片表内连接，删掉的卡不进列表，所以明细行数可能少于计数。</li>
      <li><b>没有单卡耗时</b>：服务端只存评分时刻。「估算在卡时长」是相邻评分的时间差累加（单卡封顶 10 分钟），包含走神与停顿，不是精确学习时长。</li>
      <li><b>没有番茄钟</b>：专注事件只在本机浏览器（IndexedDB），服务端拿不到，这里不写「专注几分钟」。</li>
      <li><b>撤销不回减</b>：每日计数在撤销时不会减少（官方注释写明「热图近似」），计数与明细的差额不全是删卡。</li>
    </ul>
  </section>

  <footer>
    <span>SourCards · 数据来自 /api/stats、/api/daily-counts、/api/streak、/api/review-logs</span>
    <span>生成于 ${esc(r.generatedAt)}</span>
  </footer>
</div>
<script>
(() => {
  const rows = Array.from(document.querySelectorAll('#rows tr[data-rating]'));
  const buttons = Array.from(document.querySelectorAll('.chipbtn'));
  const q = document.getElementById('q');
  const deck = document.getElementById('deck');
  const countline = document.getElementById('countline');
  let rating = 'all';

  const apply = () => {
    const term = (q.value || '').trim().toLowerCase();
    const deckSel = deck.value;
    let shown = 0;
    for (const tr of rows) {
      const okRating = rating === 'all' || tr.dataset.rating === rating;
      const okDeck = !deckSel || tr.dataset.deck === deckSel;
      const okTerm = !term || tr.dataset.q.includes(term);
      const ok = okRating && okDeck && okTerm;
      tr.hidden = !ok;
      if (ok) shown += 1;
    }
    countline.textContent = '显示 ' + shown + ' / ' + rows.length;
  };

  for (const b of buttons) {
    b.addEventListener('click', () => {
      rating = b.dataset.filter;
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
      apply();
    });
  }
  q.addEventListener('input', apply);
  deck.addEventListener('change', apply);
  apply();
})();
</script>
</body>
</html>
`;
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(err?.exitCode || 1);
});
