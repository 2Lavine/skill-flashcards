---
name: sourcards-daily-report
description: SourCards daily review report skill. Pull the owner's daily review statistics (今日复习/累计/连续天数/每日明细) from the SourCards API via a Personal Integration Token and render a Markdown or JSON report (每日复习/日报/报表/review report/daily report/复习统计/打卡统计). Use when the user asks for a review report, daily stats, streak summary, or wants a scheduled (cron) job to fetch review data and generate a report. Requires a token with stats:read (included in every new Personal Integration Token).
---

# SourCards Daily Review Report

Fetch daily review statistics for the token owner and render a report — one-shot
(Markdown) or machine-readable (`--json` for cron / agent pipelines).

**North star:** the report is a *progress snapshot*, not a substitute for the app.
Keep it factual: numbers come straight from `/api/stats`, `/api/daily-counts`,
`/api/streak`; never invent values the API did not return.

## Read on demand

Do **not** reload everything every time. Open only what the current step needs:

| File | Read when |
|------|-----------|
| [USAGE.md](USAGE.md) | Human-facing usage: prerequisites, flags, quota, cron scheduling example |
| [references/api.md](references/api.md) | Token scopes, endpoint shapes, quota headers, 429/401 handling |
| [scripts/fetch-daily-report.mjs](scripts/fetch-daily-report.mjs) | Flag reference / exit codes before invoking the script |

## Hard constraints

1. **Token, not session.** The API is called with a Personal Integration Token
   (`FLASHCARD_API_KEY`, prefix `sc_int_…`). If the token is missing, point the user
   to `Settings → Integrations → Personal Integration Tokens → Create`; the full
   value is shown once.
2. **stats:read only.** The script touches exactly three GET endpoints:
   `/api/stats`, `/api/daily-counts`, `/api/streak`. Never ask for card bodies,
   review logs, or any other endpoint — tokens cannot access them.
3. **Don't fabricate.** Render exactly what the API returned. `today`, `totalReviews`,
   `streak`, and the per-day counts are all owner-scoped server data.
4. **Quota-aware.** Token access is metered by the membership daily request quota
   (Free 100/day, Lite/Lifetime 5000/day). Every call returns
   `X-RateLimit-Limit` / `X-RateLimit-Remaining`; the script prints the remaining
   quota in Markdown mode and exits 1 with a clear message on 429/401.

## Workflow

1. **Ensure the token.** `FLASHCARD_API_KEY` from the process environment, else
   this skill folder's `.env.local` / `.env` (copy [`.env.example`](.env.example)).
   If still missing, create one in the app. Do not print the value.
2. **Fetch.** Default report covers the last 7 days:

   ```bash
   node skills/sourcards-daily-report/scripts/fetch-daily-report.mjs
   node skills/sourcards-daily-report/scripts/fetch-daily-report.mjs --days 30
   ```

3. **Cron / pipeline reuse** — raw JSON with `stats` / `dailyCounts` / `streak`:

   ```bash
   node skills/sourcards-daily-report/scripts/fetch-daily-report.mjs --days 7 --json
   ```

   A scheduled job can run this daily, persist the JSON, and summarize trends
   (weekly average, streak changes) on top of it.

4. **Present.** Default output is Markdown (今日概览 + 每日明细). Read it back to
   the user; note the remaining daily quota when it is low.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Report fetched and rendered |
| 1 | API/IO failure (401 invalid token, 429 quota exhausted, network, write error) |
| 2 | Bad usage (`--days` out of range, unknown flag) |
