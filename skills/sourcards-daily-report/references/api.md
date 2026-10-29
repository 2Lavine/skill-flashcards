# Daily Report API Reference

## Personal Integration Token

Daily review reports use a **Personal Integration Token** (prefix `sc_int_…`),
the same credential as `sourcards-import`. It is **not** a login session.

`stats:read` is part of the default permission set on every new token:

```text
imports:create
imports:read
imports:rollback
media:upload
catalog:read
catalog:write
stats:read
```

### Approved endpoints

| Method | Path | Required permission | Returns |
|--------|------|---------------------|---------|
| `GET` | `/api/stats` | `stats:read` | `{ total, due, new, learning, review, totalReviews, today, avgDifficulty }` |
| `GET` | `/api/daily-counts?days=N` | `stats:read` | `{ daily: [{ label, date, count }, …] }` (heatmap, last N days) |
| `GET` | `/api/streak` | `stats:read` | `{ streak }` |

All three are **owner-scoped** — they return the token owner's data only. Dates
default to UTC; pass `localDay=YYYY-MM-DD` to anchor "today" at the owner's local
calendar day (`/api/stats?localDay=…`, `/api/streak?localDay=…`,
`/api/daily-counts?days=7&localDay=…`).

### What the token cannot do

The Markdown/JSON report calls only the three aggregate routes above. A token
with the same `stats:read` scope can also page one local day's question fronts
at `GET /api/review-logs` — that is what `scripts/fetch-daily-html.mjs` (and
`sourcards-retro`) use. Tokens still cannot read answers, Coach, settings, or
billing (see `sourcards-import/references/api.md`).

Day semantics, which the aggregate routes get wrong if you pass a past day:

| Field | Meaning | Past `localDay` |
|-------|---------|-----------------|
| `/api/stats` → `today` | counter for the CURRENT day only | reads 0 — use `/api/daily-counts` instead |
| `/api/streak` → `streak` | streak as of today | reads 0 when the stored last day ≠ that day |
| `/api/daily-counts` → `daily[].count` | per-day counter, historical | correct |
| `/api/review-logs` | one day's rows, historical | correct (deleted cards missing) |

## Request quota

Token access is metered by the membership-tier **daily request quota**:

| Membership | Daily request quota |
|------------|---------------------|
| Free | 100 |
| Lite | 5000 |
| Lifetime | 5000 |

Every response carries the remaining quota:

```text
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 97
```

- Exhaustion returns **429** `{ "error": "api_quota_exceeded", "limit": N }`.
  Quota resets daily (server UTC day). A single report costs 3 requests
  (stats + daily-counts + streak).
- An invalid/expired token returns **401**.

## Auth headers

`FLASHCARD_API_KEY` comes from the process environment, else this skill
folder's `.env.local` / `.env` (copy [`.env.example`](../.env.example)).
Do not print the value.

```text
x-api-key: $FLASHCARD_API_KEY
```

or

```text
Authorization: Bearer $FLASHCARD_API_KEY
```

## Endpoints

```
GET https://sourcard.sourmonkey.xyz/api/stats
GET https://sourcard.sourmonkey.xyz/api/daily-counts?days=7
GET https://sourcard.sourmonkey.xyz/api/streak
Header: x-api-key: $FLASHCARD_API_KEY
```

Self-hosted / dev instances override the base URL:

```bash
SOURCARDS_API_BASE_URL=http://localhost:3000 \
  node skills/sourcards-daily-report/scripts/fetch-daily-report.mjs --json
```

## Auto-Fetch via curl

```bash
curl -s https://sourcard.sourmonkey.xyz/api/stats \
  -H "x-api-key: $FLASHCARD_API_KEY"
```

## Fallback

If no Personal Integration Token is available, or the API is unreachable /
returns 401, tell the user the report cannot be generated without a token and
point to `Settings → Integrations → Personal Integration Tokens → Create`.
