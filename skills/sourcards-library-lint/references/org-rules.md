# Library organization rules (SoT)

Shared by outer `sourcards-library-lint` and in-app Coach `lint_cards` / `card-audit`.

## Issue types

| `type` | Severity | Meaning | Typical fix |
|--------|----------|---------|-------------|
| `empty_deck` | warning | Deck has 0 cards (except `Default`) | Delete if unused |
| `single_card_deck` | suggestion | Deck has only 1 card | Move card → delete deck |
| `small_deck` | info | Deck has 2–3 cards | Merge into related larger deck if theme overlaps |
| `duplicate_deck_name` | warning | Two decks very similar by name (≥ 0.7) | Merge into canonical, better-populated name |
| `small_category` | info | Category in a deck has ≤2 cards | Merge/rename category, or clear noisy labels |
| `duplicate_category_name` | warning | Two categories in same deck are near-duplicates | Rename/merge to one canonical category |
| `cross_deck_category` | info | Same category string appears in multiple decks | OK if intentional shared topic; else rename per deck |

Also use `summary.total_uncategorized` as its own cluster when large.

## Similarity

- Normalize: lower-case, strip most punctuation, collapse whitespace; keep CJK.
- Score: exact = 1; substring containment = 0.85; else bigram overlap.
- Near-duplicate threshold: **0.7**.

## Naming / discipline judgment (agent layer)

Algorithm catches string similarity + size. You add semantic judgment:

- **Deck** = first-level discipline common name (金融学, 心理学, 数学) — not a lesson title, not `止损 · 金融学`, not `Default` as a dumping ground.
- **Category** = single second-level direction — Chinese preferred for zh libraries, **no `/`**, no stacked paths like `ICT/SMC`.
- Prefer **reusing exact existing names**; flag typo-level drift (心里学 vs 心理学) even when bigram score is below 0.7 — that is agent judgment, not only the automated threshold.
- Pseudo-disciplines / personal buckets (“成长学”, “我的笔记”) → map to nearest real discipline + tight category.
- Do **not** invent a second taxonomy.

## Response shape

1. One-line library snapshot from `summary`
2. Priority clusters (warnings first): problem → why it hurts → recommended UI action
3. Optional “leave as-is” for harmless `info` (intentional cross-deck category)
4. Ask which cluster to clean next if more than one remains

## Do not

- Claim the linter mutated data
- Confuse this with pre-import `cards.json` lint
- Paste huge card dumps; quote short titles only
