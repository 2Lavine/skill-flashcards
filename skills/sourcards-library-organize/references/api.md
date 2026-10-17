# Category write API

Permission catalog and auth headers: `sourcards-import` `references/api.md`.

`catalog:write` is on new Personal Integration Tokens only. It allows exactly:

| Method | Path | Body |
|--------|------|------|
| `PUT` | `/api/categories/rename` | `{ "deckId", "oldName", "newName" }` |
| `PUT` | `/api/categories/merge` | `{ "deckId", "oldName", "newName" }` |

Both update the owner's cards in that deck. Rename and merge are the same row update; merge refuses `oldName === newName`. Neither moves cards across decks.

`GET /api/library-lint` uses `catalog:read` and returns the organization snapshot (`summary` + `issues`). It does not include card text.

HTTP 200 with `{ "ok": false, "error" }` is a failed operation. The apply script stops there.
