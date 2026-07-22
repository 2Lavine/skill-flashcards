# Import API Reference

## Personal Integration Token

Import, media, catalog, and batch recovery all use a **Personal Integration Token**
(prefix `sc_int_…`). This is **not** a login session and is **not** a general API key.

Default permissions on every new token (exactly five):

```text
imports:create
imports:read
imports:rollback
media:upload
catalog:read
```

### Approved routes only

| Method | Path | Required permission |
|--------|------|---------------------|
| `POST` | `/api/import` | `imports:create` |
| `POST` | `/api/media` | `media:upload` |
| `GET` | `/api/decks` | `catalog:read` |
| `GET` | `/api/categories` | `catalog:read` |
| `GET` | `/api/imports` | `imports:read` |
| `POST` | `/api/imports/:id/rollback` | `imports:rollback` |

Every route verifies **exactly** that permission and derives the owner from the
token `referenceId`. All reads and mutations are **owner-scoped**.

### What the token cannot do

Tokens never create authenticated sessions and **cannot** access:

- card bodies (beyond what the import payload itself contains)
- reviews / FSRS state
- Coach data or LLM generation
- settings, billing, account, or admin surfaces
- any route outside the table above

### Auth headers

Send the token as either:

```text
x-api-key: $FLASHCARD_API_KEY
```

or

```text
Authorization: Bearer $FLASHCARD_API_KEY
```

**Finding the token:** check `FLASHCARD_API_KEY` in the environment first
(`echo "$FLASHCARD_API_KEY"`). If missing, create one in the app:

```text
Settings → Integrations → Personal Integration Tokens → Create
```

The full value is shown **once** — store it as `FLASHCARD_API_KEY`. Older
general API keys are not upgraded; revoke them and create a Personal Integration
Token.

## Endpoint

```
POST https://sourcard.sourmonkey.xyz/api/import
Content-Type: application/json
x-api-key: $FLASHCARD_API_KEY
```

Import is **JSON only** — no multipart/binary media. Embed images and audio as
absolute `https://` URLs inside each card's `question` / `answer` markdown.

### Official media upload — skill default

Same token as import. Requires token permission `media:upload` **and** the
owner's effective entitlement `media:upload` (Lite / Lifetime membership defaults,
or an explicit grant). Free accounts without that entitlement get
`403` and should use GitHub BYO (`upload-media --provider github`).

```
POST https://sourcard.sourmonkey.xyz/api/media
Content-Type: multipart/form-data
x-api-key: $FLASHCARD_API_KEY
# field: file
```

- Response: `{ "ok": true, "url": "https://…", "key": "users/…", "bytes": N }`.
- Skill default: when `FLASHCARD_API_KEY` is set, `upload-media` uses this
  endpoint automatically (no extra media token).
- Server still enforces daily upload count, daily bytes, and total hosted-bytes
  quotas from effective entitlements.
- Free / no media entitlement: GitHub BYO — see [media.md](media.md).

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

Token import batches are capped (200 cards per request). Missing or invalid tokens
return **401** and nothing is saved.

## Catalog (lint cross-check)

```
GET https://sourcard.sourmonkey.xyz/api/decks
GET https://sourcard.sourmonkey.xyz/api/categories
Header: x-api-key: $FLASHCARD_API_KEY
```

Requires `catalog:read`. Used by `lint-cards --catalog` to cross-check deck /
category names against the owner's library. Does **not** return card bodies.

## Rollback / Delete a Batch

Each successful import returns an `importId`. To **delete an entire batch** (e.g. to
fix a bad import, remove duplicates, or re-import a corrected version), roll it back:

```
POST https://sourcard.sourmonkey.xyz/api/imports/:importId/rollback
Header: x-api-key: $FLASHCARD_API_KEY
```

Requires `imports:rollback`. Rollback deletes only cards that belong to **that**
import and **that** token owner.

Response:

```json
{"ok": true, "deletedCards": 28, "deletedDeck": false}
```

`deletedDeck` is `true` only when the rolled-back batch was the deck's last remaining
cards. The deck itself is preserved otherwise.

To find an `importId` (e.g. before rolling back), list all batches:

```
GET https://sourcard.sourmonkey.xyz/api/imports
Header: x-api-key: $FLASHCARD_API_KEY
```

Requires `imports:read`. Returns
`{ "imports": [ { "id", "deckName", "sourceUri", "cardCount", "createdAt" }, ... ] }`.
Filter by `sourceUri` to locate a specific batch's `id`. Owner-scoped only — no
card bodies.

> This is the same action the app's **Import History → roll back** button performs.

## Fallback

If no Personal Integration Token is available, or the API is unreachable / returns
401, output the JSON for manual import via the app's Import button in the browser.
