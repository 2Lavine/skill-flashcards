---
name: sourcards-flashcards
description: SourCards flashcard import skill. Generate spaced-repetition flashcards (制卡/卡片/flashcards/Anki-style Q&A) from notes, articles, transcripts, lectures, or any learning material. Formulate atomic FSRS-ready cards with deck/category, Form A Q&A or Form B cloze, concept tags, aliases, and source quotes; then lint JSON and import or roll back via the SourCards API. Use when the user asks to make cards, generate flashcards, 制卡, 导入卡片, lint cards, or convert study material into reviewable Q&A for SourCards.
---

# SourCards Flashcards Skill

Transform learning material into well-formulated spaced-repetition cards, lint them, and import them.

## Read on demand

Do **not** reload everything every time. Open only what the current step needs:

| File | Read when |
|------|-----------|
| [references/format.md](references/format.md) | Writing/editing card JSON, cloze form, tags, math/LaTeX, or examples |
| [references/disciplines.md](references/disciplines.md) | Assigning `deck` / `category` |
| [references/quality-rules.md](references/quality-rules.md) | Unsure whether a fact deserves a card, or how to split/word it |
| [references/api.md](references/api.md) | Import, list batches, or roll back a bad import |

## Hard constraints

These override density targets and examples:

1. **One fact per card.** Answerable in ~3–5 seconds. Split complex ideas.
2. **No sets / laundry lists.** Never "What are the N types of X?" Split into per-member cards (or overlapping clozes for ordered steps).
3. **Form A vs Form B — never mix.**
   - **Form A (definition Q&A):** literal question, **no** `{{cN::...}}`. Term appears plainly in the question; full answer on the back.
   - **Form B (cloze):** statement with a blank; front stays readable with the blank hidden; back is the deleted term(s), `;`-separated.
   - "什么是 X？" / "What is X?" / "X 指什么？" → **Form A only**. Never hide the subject of a question inside a cloze.
4. **Tags:** foundational cards get `type:concept`; named instances get `type:entity`; else omit or `type:normal`. Every concept/entity card needs ≥1 `alias:<canonical name>` (plus common aliases).
5. **Discipline:** `deck` = first-level discipline common name (Chinese); `category` = single second-level name, **no `/`**. Classify via disciplines.md. No pseudo-disciplines.
6. **Provenance:**
   - `source` = URL or file path only (batch-level). Omit if unknown. Never prose/summary/cropped text.
   - `course` = human title of the material (course/book/video). Optional.
   - `source_quote` = exact supporting sentence per card when available.
7. **Math in JSON:** every LaTeX `\` must be doubled (`\\frac`, `\\sigma`). Single backslashes break or corrupt `JSON.parse`.
8. **Precision > recall.** Prefer fewer true cards over padded trivia. Never invent facts the source does not support.

## Density control

Card count ≈ **genre baseline × density level**, then cut by the worth-remembering filter.

### Genre baseline (propositions / 1000 English words)

| Genre | Props / 1K words | Examples |
|-------|------------------|----------|
| Conversation / interview | 15–25 | Podcasts, transcripts |
| Narrative / memoir | 10–20 | Stories, case studies |
| Expository / article | 25–40 | Essays, journalism |
| Textbook / technical | 40–70 | Docs, papers, manuals |

### Density → capture rate

| Level | Rate | Use when |
|-------|------|----------|
| `low` | ~25% | overview / 快速 / short text |
| `medium` | ~50% | default |
| `high` | ~75% | 全面 / exam detail |
| `verbose` | ~90% | nearly every extractable fact |

```
target ≈ props_per_1K × capture_rate × (size_units)
```

Round to nearest 5. Soft guardrail only — never pad.

### Size units (language-aware)

- **Space-delimited text (typical English):** `size_units = word_count / 1000`
- **Chinese / CJK-heavy / no reliable word breaks:** `size_units = char_count / 500`  
  (roughly: 500 Han chars ≈ 1000 English words of propositional load)
- Mixed text: weight by the dominant script. If unsure, estimate atomic facts first, then reconcile with the target range.

### Worth-remembering filter

Default: skip a card unless the learner will still need it on a multi-year horizon.

Relax the filter when the user clearly wants short-term / exam coverage (`考试`, `背 recitation`, `this week's quiz`). Even then, prefer atomic, high-yield facts over trivia.

## Language defaults

- Card language follows the **source's main language**. Chinese source → Chinese cards by default.
- Keep canonical technical terms in their common form; bilingual answers are fine when the source mixes languages (`稳定性 (stability)`).
- Do not translate everything into English "for quality."

## Generation process

1. **Determine density** — explicit request, else infer; default `medium`.
2. **Identify genre** — conversation / narrative / expository / textbook.
3. **Estimate target count** — using language-aware size units. Guardrail, not quota.
4. **Parse input** — concepts, facts, domain, language, locatable URI.
5. **Extract atomic facts** — filter by density, then worth-remembering.
6. **Reconcile count** — if far outside target, re-check over/under-cardifying; never pad.
7. **Set batch provenance** — `source` URI if known; `course` title if known; omit rather than invent.
8. **Formulate cards** — Form A or B per fact; apply hard constraints; see quality-rules.md when stuck.
9. **Assign discipline & tags** — batch `deck`; per-card `category` + topical tags + `type:*` + required `alias:*`.
10. **Self-validate** — run the checklist below on every card.
11. **Output JSON** — one valid JSON object (code block or file).
12. **Lint, then import** — fix blocking lint errors before POST. On bad import, roll back and re-import.

## Quality checklist

- [ ] One fact? 3–5s answer? Single unambiguous answer?
- [ ] No sets / long enumerations left intact?
- [ ] Form A/B correct (no cloze inside "What is X?")?
- [ ] Concept/entity tagged + has `alias:`?
- [ ] `category` is a single name without `/`?
- [ ] `source` is URI/path or omitted (not prose)?
- [ ] `source_quote` supports the card (else drop the claim)?
- [ ] LaTeX backslashes doubled for JSON?
- [ ] Wording minimal; definitions include a concrete example when useful?

## Lint → import → recover

Scripts live in this skill's `scripts/` directory. Resolve the skill root from the active install (project or user skills):

```bash
# Canonical monorepo package (source of truth):
SKILL_ROOT="packages/skill-flashcards"
# Claude/Codex skill symlink in this repo:
# SKILL_ROOT=".claude/skills/sourcards-flashcards"
# User-level install / skills-manager:
# SKILL_ROOT="$HOME/.skills-manager/skills/sourcards-flashcards"
# Or use the package bin after install:
# sourcards-lint-cards cards.json

# format lint only
node "$SKILL_ROOT/scripts/lint-cards.mjs" cards.json

# + catalog cross-check (recommended; needs $FLASHCARD_API_KEY)
node "$SKILL_ROOT/scripts/lint-cards.mjs" cards.json \
  --catalog https://sourcard.sourmonkey.xyz
```

- **Exit 1:** blocking (invalid JSON escapes, control-char corruption, missing required fields). Fix and re-lint.
- **Exit 0 + warnings:** quality drift (prose `source`, `/` in category, missing `alias:`, mixed cloze). Prefer fixing before import.
- **Exit 0 clean:** safe to import.

Import, list batches, and rollback: [references/api.md](references/api.md).

**Bad-import recovery**

1. `GET /api/imports` → find `importId` (filter by `sourceUri` / time / deck).
2. `POST /api/imports/:importId/rollback` → delete that batch.
3. Fix payload → lint clean → import again.

If API key missing or API unreachable, output JSON for manual Import in the app.

## Question type palette

1. **Direct (Form A):** What / Why / How
2. **Cloze (Form B):** statement with `{{c1::...}}`
3. **Comparison:** key difference between X and Y
4. **Cause-effect:** what happens to X when Y
5. **Application:** given scenario, what applies

Use [references/format.md](references/format.md) for schema, cloze details, math escaping, and golden examples.
