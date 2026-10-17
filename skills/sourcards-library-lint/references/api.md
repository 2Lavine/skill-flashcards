# Library lint snapshot contract

## Input source

The outer-agent CLI is snapshot-only. It does not call the API.

`GET /api/library-lint` accepts a session or a Personal Integration Token with
`catalog:read`. Fetching that route belongs to `sourcards-library-organize`
(`scripts/fetch-library-lint.mjs`). The token allowlist is:

| Method | Path | Permission |
|--------|------|------------|
| `POST` | `/api/import` | `imports:create` |
| `POST` | `/api/media` | `media:upload` |
| `GET` | `/api/decks`, `/api/categories`, `/api/library-lint` | `catalog:read` |
| `PUT` | `/api/categories/rename`, `/api/categories/merge` | `catalog:write` |
| `GET` | `/api/imports` | `imports:read` |
| `POST` | `/api/imports/:id/rollback` | `imports:rollback` |

`GET /api/decks` and `GET /api/categories` do not include the card counts or
uncategorized aggregates this lint needs. `GET /api/library-lint` does. The
lint CLI still reads a local snapshot file and does not call either route.

## Snapshot shape

```json
{
  "decks": [{ "id": "d1", "name": "心理学", "cardCount": 12 }],
  "categories": [
    { "deckId": "d1", "deckName": "心理学", "category": "认知", "cardCount": 4 }
  ],
  "uncategorized": [
    { "deckId": "d1", "deckName": "心理学", "cardCount": 2 }
  ]
}
```

`decks` and `categories` are required arrays. Include `uncategorized` so the
report can compute the complete backlog rather than silently treating missing
data as zero.

## CLI

```bash
sourcards-lint-library path/to/snapshot.json
sourcards-lint-library path/to/snapshot.json --json
```

The command reads local JSON only and never consumes `FLASHCARD_API_KEY`.
