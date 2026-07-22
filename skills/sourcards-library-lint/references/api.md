# Library lint snapshot contract

## Input source

The outer-agent CLI is snapshot-only. Ask the user to export and provide a
complete library organization snapshot; do not attempt to authenticate the CLI
to a live account.

`GET /api/library-lint` is session-only and is **not** on the Personal
Integration Token allowlist. Personal Integration Tokens (`sc_int_…`, env
`FLASHCARD_API_KEY`) cover only:

| Method | Path | Permission |
|--------|------|------------|
| `POST` | `/api/import` | `imports:create` |
| `POST` | `/api/media` | `media:upload` |
| `GET` | `/api/decks`, `/api/categories` | `catalog:read` |
| `GET` | `/api/imports` | `imports:read` |
| `POST` | `/api/imports/:id/rollback` | `imports:rollback` |

The `catalog:read` responses are not a substitute for the export: they do not
provide all card counts and uncategorized aggregates required by organization
lint. Do not claim that those endpoints can reconstruct a complete snapshot.

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
