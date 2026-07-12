# Library lint API

## Endpoint

```
GET https://sourcard.sourmonkey.xyz/api/library-lint
Authorization: Bearer <FLASHCARD_API_KEY>
```

(Or the API-key header style your SourCards client already uses for import.)

## Response

Same JSON as the pure core / CLI:

```json
{
  "summary": {
    "total_decks": 10,
    "total_cards": 240,
    "total_categories": 32,
    "total_uncategorized": 5,
    "total_issues": 7
  },
  "issues": []
}
```

## CLI

```bash
export FLASHCARD_API_KEY=...
sourcards-lint-library --base https://sourcard.sourmonkey.xyz
# pretty print is default; add --json for machine-only JSON on stdout
```

Offline:

```bash
sourcards-lint-library path/to/snapshot.json
```
