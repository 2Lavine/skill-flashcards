# Library write API

Permission catalog and auth headers: `sourcards-import` `references/api.md`.

`catalog:write` is on new Personal Integration Tokens only. It allows exactly:

## Category operations (stay inside one deck)

| Method | Path | Body |
|--------|------|------|
| `PUT` | `/api/categories/rename` | `{ "deckId", "oldName", "newName" }` |
| `PUT` | `/api/categories/merge` | `{ "deckId", "oldName", "newName" }` |

Both update the owner's cards in that deck. Rename and merge are the same row update; merge refuses `oldName === newName`. Neither moves cards across decks.

## Deck operations

| Method | Path | Body |
|--------|------|------|
| `PUT` | `/api/decks/:id/rename` | `{ "newName" }` |
| `POST` | `/api/decks/:sourceId/merge-into/:targetId` | — (ids in path) |

Rename changes one deck's name (refuses a name already used by another of the owner's decks). Merge moves every card from `:sourceId` into `:targetId`, deletes the now-empty source deck, and refuses `sourceId === targetId`. Both are owner-scoped.

The apply script also accepts deck **names** (`deck`, `sourceDeck`, `targetDeck`) instead of ids and resolves them via `GET /api/decks` at apply time.

`GET /api/library-lint` uses `catalog:read` and returns the organization snapshot (`summary` + `issues`). It does not include card text.

HTTP 200 with `{ "ok": false, "error" }` is a failed operation. The apply script stops there.
