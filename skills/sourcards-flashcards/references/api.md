# Import API Reference

## Endpoint

```
POST https://sourcard.sourmonkey.xyz/api/import
Content-Type: application/json
```

## Request Body

`deck` is the **first-level discipline** (broad field, Chinese, e.g. `数学`); each card's
`category` is a **second-level discipline** (sub-field under that deck, Chinese, single
name, no `/`, e.g. `概率论`). Classify both per [format.md](format.md) → disciplines.md.
`course` (optional, batch-level) is the **source material name** the cards came from
(course / book / article / video title, e.g. `王力宏30天声乐课`). `source` (optional,
batch-level) is the **source URI** — the URL or file path locating the material, so the
user can jump back to it from the review app; omit if there's no locatable origin.

```json
{
  "deck": "数学",
  "course": "可汗学院 · 概率论",
  "source": "https://www.khanacademy.org/math/statistics-probability",
  "cards": [
    {
      "question": "...",
      "answer": "...",
      "tags": ["type:concept", "tag1", "alias:canonical-name"],
      "category": "概率论"
    }
  ]
}
```

The API accepts these card fields:
| Field | Stored |
|-------|--------|
| `question` | Yes |
| `answer` | Yes |
| `tags` | Yes (JSON array). Use `type:concept`, `type:entity`, optional `type:normal`. Every `type:concept` / `type:entity` card must include at least one `alias:<canonical name>` tag; add more aliases for abbreviations or alternate surface forms. |
| `category` | Yes — second-level discipline under the deck (Chinese, single name, no `/`); decide it yourself |
| `source_quote` | No — stored per card; shown under a revealed card in the review app |

> The app computes priority numbers, hierarchy pointers, and traversal indices on its own from the Concept Tags. Generated cards only need the right `type:*` tag.

## Concept Tag Ordering

Within the same due-time bucket, when card type tags are present, the review app orders concepts first, then entities, then normal cards.

Use Concept Tags on every generated card to influence review order without manual priority numbers. Concept/entity aliases are also the only phrases used for semantic links in card bodies:

- Foundational definitions/principles → `tags` includes `type:concept` and at least one `alias:<canonical name>`.
- Concrete named examples/components/cases → `tags` includes `type:entity` and at least one `alias:<canonical name>`.
- Supporting facts/procedures/edge cases → no type tag (or `type:normal`) and regular topical tags.

## Response

```json
{"ok": true, "deck": "数学", "imported": 8, "importId": "…"}
```

The `importId` identifies the batch. In the app, **Import History** lists each batch
(deck, source URI, card count, time) and lets the user roll one back — deleting all its
cards in one action.

## Authentication

The app is multi-user. Importing **requires** a valid API key — without it the
endpoint returns **401** and nothing is saved. Send the key in the `x-api-key`
header.

**Finding the key:** It is normally already present as the `FLASHCARD_API_KEY`
environment variable — check there first (e.g. `echo "$FLASHCARD_API_KEY"`) and
use it if set. Only if it is missing should you ask the user to generate one in
the app: **Settings → API Keys → Create key** (shown once — store it as
`FLASHCARD_API_KEY`).

## Auto-Import via curl

```bash
curl -s -X POST https://sourcard.sourmonkey.xyz/api/import \
  -H "Content-Type: application/json" \
  -H "x-api-key: $FLASHCARD_API_KEY" \
  -d '{
  "deck": "数学",
  "source": "https://www.khanacademy.org/math/statistics-probability",
  "cards": [...]
}'
```

## Rollback / Delete a Batch

Each successful import returns an `importId`. To **delete an entire batch** (e.g. to
fix a bad import, remove duplicates, or re-import a corrected version), roll it back:

```
POST https://sourcard.sourmonkey.xyz/api/imports/:importId/rollback
Header: x-api-key: <FLASHCARD_API_KEY>
```

Response:

```json
{"ok": true, "deletedCards": 28, "deletedDeck": false}
```

`deletedDeck` is `true` only when the rolled-back batch was the deck's last remaining
cards. The deck itself is preserved otherwise.

To find an `importId` (e.g. before rolling back), list all batches:

```
GET https://sourcard.sourmonkey.xyz/api/imports
Header: x-api-key: <FLASHCARD_API_KEY>
```

Returns `{ "imports": [ { "id", "deckName", "sourceUri", "cardCount", "createdAt" }, ... ] }`.
Filter by `sourceUri` to locate a specific batch's `id`.

> This is the same action the app's **Import History → roll back** button performs.

## Fallback

If no API key is available, or the API is unreachable / returns 401, output the
JSON for manual import via the app's Import button in the browser.
