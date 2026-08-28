---
name: sourcards-import
description: SourCards flashcard import skill. Generate spaced-repetition flashcards (制卡/卡片/flashcards/Anki-style Q&A) from notes, articles, transcripts, lectures, or any learning material. Formulate atomic FSRS-ready cards with deck/category, Form A Q&A or Form B cloze, concept tags, aliases, and source quotes; then lint JSON and import or roll back via the SourCards API. Use when the user asks to make cards, generate flashcards, 制卡, 导入卡片, lint cards, or convert study material into reviewable Q&A for SourCards.
---

# SourCards Flashcards Skill

Transform learning material into well-formulated spaced-repetition cards, lint them, and import them.

**North star:** cards train *use* and *transfer*, not encyclopedic recitation. For every keepable idea, prioritize — **有什么用** · **为什么有用** · **怎么用** · **可迁移性** (near + far transfer when the pattern is real). Utility beats coverage. A keepable card still **sits in its knowledge-point context** (framework + situation + a concrete case) — a floating slogan is not a card.

## Read on demand

Do **not** reload everything every time. Open only what the current step needs:

| File | Read when |
|------|-----------|
| [references/format.md](references/format.md) | Writing/editing card JSON, cloze form, tags, math/LaTeX, or examples |
| [references/media.md](references/media.md) | Local image/audio → official `/api/media` (same Personal Integration Token as import) or GitHub BYO |
| [references/disciplines.md](references/disciplines.md) | Assigning `deck` / `category` |
| [references/quality-rules.md](references/quality-rules.md) | Unsure whether a fact deserves a card, how to split/word it, or whether the knowledge-point is situated |
| [references/api.md](references/api.md) | Personal Integration Token scopes; import, catalog, list batches, or roll back |
| [../../examples/cards.json](../../examples/cards.json) | Want a complete worked template: note → Form A/B → tags → `$$` math, all lint-clean |

## Hard constraints

These override density targets and examples:

1. **Utility first — four cores (number one).** Cardify what the learner can **use** and **transfer**, not what they can only recite. For each candidate idea, prefer cards that answer one of:
   - **有什么用 (what for):** what problem / situation / outcome this serves.
   - **为什么有用 (why it works):** the reason it matters, the mechanism, or the failure it prevents.
   - **怎么用 (how to apply):** when to use it, the steps/cues, trade-offs, diagnosis, next action.
   - **可迁移性 (transfer):** where else the same *pattern* applies — **近迁移** (same/adjacent domain) and, when a solid isomorphism exists, **远迁移** (unrelated surface, shared structure). Never force far transfer.
   Gate: if none of the use cores can be answered from the source (only a bare name/definition remains), **skip** — unless the user explicitly wants exam/recitation coverage. Bare "What is X?" definitions are last resort; rewrite toward these cores when the source supports it.
2. **Knowledge-point context — discriminating, not a lecture.** `deck` / `category` are browse labels; mixed-due review will not re-teach which theory this is. Cover those chips and the question must still uniquely identify the knowledge point:
   - **归属:** name the framework/theory when the term isn't unique ("In FSRS, stability…" not "What is stability?").
   - **处境:** the situation, constraint, or preceding condition the fact lives in.
   - **用例:** one concrete case from the source — on 怎么用 cards the question *is* the case; otherwise put `例如：…` in the answer (actors/numbers/a pointable situation, not "实际使用时").
   Unique names (细胞膜, Paris) need no field prefix. Do not dump background paragraphs. Details: quality-rules.md §13.
3. **One fact (or one usable skill) per card.** Answerable in ~3–5 seconds. Split complex ideas. A "fact" here is preferably a decision rule or applied consequence, not a dictionary entry.
4. **No sets / laundry lists.** Never "What are the N types of X?" Split into per-member cards (or overlapping clozes for ordered steps). Prefer one card per *when to use member M* over a pure name list.
5. **No ordinal-index cues.** Never ask "What is the Nth principle/concept/step of X?" / "X 的第 N 个原则/概念是什么？" The ordinal is not retrieval-worthy knowledge — the learner memorizes a textbook index, not the idea. Identify the member by **content** (name, definition cue, role, what precedes/follows), not by list position. Exception only when the ordinal **is** the fact (e.g. constitutional amendment numbers, "Third Law of Thermodynamics" as a proper name).
6. **Form A vs Form B — never mix.**
   - **Form A (definition / application Q&A):** literal question, **no** `{{cN::...}}`. For definitions, term appears plainly in the question; full answer on the back. Prefer application/scenario Form A when the source supports it.
   - **Form B (cloze):** statement with a blank; front stays readable with the blank hidden; back is the deleted term(s), `;`-separated.
   - "什么是 X？" / "What is X?" / "X 指什么？" → **Form A only**. Never hide the subject of a question inside a cloze. Prefer rewriting pure definition fronts into the four cores when the source supports them: "在 [框架/处境] 里，X 解决什么问题？" / "为什么需要 X？" / "给定这个具体场景，下一步？" / "同一模式还能用在哪？".
7. **Tags:** foundational *working* concepts get `type:concept`; named instances get `type:entity`; else omit or `type:normal`. Every concept/entity card needs ≥1 `alias:<canonical name>` (plus common aliases).
8. **Discipline:** `deck` = first-level discipline common name (Chinese); `category` = single second-level name, **no `/`**. Classify via disciplines.md. No pseudo-disciplines.
9. **Provenance:**
   - `source` = URL or file path only (batch-level). Omit if unknown. Never prose/summary/cropped text.
   - `course` = human title of the material (course/book/video). Optional.
   - `source_quote` = exact supporting sentence per card when available.
10. **Math in JSON:** wrap **every** formula in `$$...$$` — display only. The card renderer ignores single-dollar `$...$`, which shows up on cards as literal text (e.g. `$233$`). Every LaTeX `\` must be doubled (`\\frac`, `\\sigma`). Single backslashes break or corrupt `JSON.parse`.
11. **Precision > recall; utility > coverage.** Prefer fewer *usable* cards over padded trivia or encyclopedic definitions. Never invent facts the source does not support.
12. **No manual priority fields.** Card array order is the review priority/reading order. The app stores it as `studyOrder`; never emit `reviewPriority` or `review_priority`.

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

### Worth-remembering filter (utility gate)

**Default priority:** practical use ≫ multi-year retention of pure labels.

Skip a candidate unless the source supports **at least one** of the cores:

1. **有什么用** — names a real problem, situation, or outcome this idea serves.
2. **为什么有用** — explains why it matters / the mechanism / the failure it prevents.
3. **怎么用** — gives when/how to apply, steps, cues, trade-offs, or next action.
4. **可迁移性** — a reusable pattern with at least one honest near (or solid far) transfer.

Also keep strong if **actionable / transferable / failure-preventing** even when worded differently — those map onto the cores.

Still drop: bare synonyms, decorative history, glossary-only definitions with no use context, author vanity metrics, and "nice to know" trivia.

Default also: prefer facts the learner still needs on a multi-year horizon *and* that pass the utility gate.

Relax **only** when the user clearly wants short-term / exam coverage (`考试`, `背 recitation`, `this week's quiz`). Even then, prefer high-yield applied facts over pure recitation.


## Language defaults

- Card language follows the **source's main language**. Chinese source → Chinese cards by default.
- Keep canonical technical terms in their common form; bilingual answers are fine when the source mixes languages (`稳定性 (stability)`).
- Do not translate everything into English "for quality."
- Image/audio media stays markdown-backed (`<audio>` / `![alt](url)`); language study may add `lang:<code>` + one of `type:vocab` / `type:listening` / `type:reading`. See [format.md](references/format.md#image--audio-media-markdown-backed).

## Generation process

1. **Determine density** — explicit request, else infer; default `medium`.
2. **Identify genre** — conversation / narrative / expository / textbook.
3. **Estimate target count** — using language-aware size units. Guardrail, not quota.
4. **Parse input** — concepts, facts, domain, language, locatable URI.
5. **Extract atomic facts / skills** — filter by density, then the utility / worth-remembering gate (use > recite).
6. **Reconcile count** — if far outside target, re-check over/under-cardifying; never pad.
7. **Set batch provenance** — `source` URI if known; `course` title if known; omit rather than invent.
8. **Formulate cards** — situate the knowledge point (归属 / 处境 / 用例); Form A or B per fact; apply hard constraints; see quality-rules.md §13 when stuck.
9. **Assign discipline & tags** — batch `deck`; per-card `category` + topical tags + `type:*` + required `alias:*`.
10. **Self-validate** — run the checklist below on every card.
11. **Output JSON** — one valid JSON object (code block or file). Local media paths OK while drafting.
12. **Resolve media** — if any card embeds local/relative image or audio, run `upload-media` with your **own image host** configured (default: `http` provider posting to the `SOURCARDS_MEDIA_UPLOAD_URL` from `media.config.json` / env) so every `src` is absolute `https://` before lint. See [media.md](references/media.md).
13. **Lint, then import** — fix blocking lint errors before POST. On bad import, roll back and re-import.

## Quality checklist

- [ ] **Utility first:** the card targets 有什么用 / 为什么有用 / 怎么用 / 可迁移性 — not pure label recitation?
- [ ] **Context:** cover deck/category — still uniquely this knowledge point? Framework named if the term isn't unique? Situation on 怎么用/诊断? One concrete source case (front, or `例如：` with actors/numbers)?
- [ ] If the front is "什么是 X？" / "What is X?", rewrite toward what-for / why / how-to-apply / transfer when the source allows.
- [ ] Transfer cards (if any): near = same-domain reuse; far = shared structure, not surface puns — skip forced analogies.
- [ ] One fact / usable skill? 3–5s answer? Single unambiguous answer?
- [ ] No sets / long enumerations left intact?
- [ ] No ordinal-index cues ("第 N 个…是什么" / "the Nth principle of…") — cue by content, not list position?
- [ ] Form A/B correct (no cloze inside "What is X?")?
- [ ] Concept/entity tagged + has `alias:`?
- [ ] `category` is a single name without `/`?
- [ ] `source` is URI/path or omitted (not prose)?
- [ ] `source_quote` supports the card (else drop the claim)?
- [ ] LaTeX backslashes doubled for JSON?
- [ ] No legacy `reviewPriority` / `review_priority` field; card array order expresses reading order?
- [ ] Wording minimal; definitions include a concrete source case (`例如：` with actors/numbers) when useful?
- [ ] Media cards: if language study, `lang:<code>` + pick **one** of `type:vocab` / `type:listening` / `type:reading` (do not stack vocab+listening)?
- [ ] Listening cards: question-side `<audio src>` present; prefer media-only / non-spoiler front?
- [ ] Every media `src` is absolute `https://` (no `./`, `file://`, or bare disk paths) — run `upload-media` if not?

## Lint → import → recover

Scripts live in this skill's `scripts/` directory. Resolve the skill root from the active install (project or user skills):

```bash
# Canonical monorepo package (source of truth):
SKILL_ROOT="skills/sourcards-import"   # inside this plugin repo
# or after install / project symlink:
# SKILL_ROOT=".agents/skills/sourcards-import"
# SKILL_ROOT=".claude/skills/sourcards-import"
# SKILL_ROOT="$HOME/.skills-manager/skills/sourcards-import"
# Or use the package bin after install:
# sourcards-lint-cards cards.json
# sourcards-upload-media cards.json --out cards.json
# sourcards-save-token --check

# local/relative media → absolute https via YOUR image host
# Configure your own upload endpoint first (see references/media.md):
#   1. copy media.config.example.json → media.config.json and fill in your gateway
#   2. or export SOURCARDS_MEDIA_UPLOAD_URL / SOURCARDS_MEDIA_UPLOAD_TOKEN
# No official upload URL is hard-coded — bring your own image host.
node "$SKILL_ROOT/scripts/upload-media.mjs" cards.json --out cards.json

# BYO git repo + jsDelivr (no upload endpoint needed):
# node "$SKILL_ROOT/scripts/upload-media.mjs" cards.json --provider github --out cards.json

# format lint only
node "$SKILL_ROOT/scripts/lint-cards.mjs" cards.json

# + catalog cross-check (recommended; needs $FLASHCARD_API_KEY → catalog:read)
node "$SKILL_ROOT/scripts/lint-cards.mjs" cards.json \
  --catalog https://sourcard.sourmonkey.xyz
```

- **Exit 1:** blocking (invalid JSON escapes, control-char corruption, missing required fields). Fix and re-lint.
- **Exit 0 + warnings:** quality drift (prose `source`, `/` in category, missing `alias:`, mixed cloze). Prefer fixing before import.
- **Exit 0 clean:** safe to import.

Import, catalog, list batches, and rollback: [references/api.md](references/api.md).

**Token.** Before import / catalog / rollback / official media, ensure a key:

```bash
node "$SKILL_ROOT/scripts/save-token.mjs" --check
```

- Exit 0: proceed (process env, else this skill folder's `.env.local` / `.env`).
- Exit 1: **stop and ask** the user to paste a Personal Integration Token.
  Where: `Settings → Integrations → Personal Integration Tokens → Create`.
  Prefix `sc_int_…`; the full value is shown once. Then persist (do not print
  the value; confirm only that it was saved) and re-run `--check`:

  ```bash
  printf '%s\n' '<pasted-token>' | node "$SKILL_ROOT/scripts/save-token.mjs"
  ```

  That upserts `FLASHCARD_API_KEY` in this skill folder's gitignored
  `.env.local`. Subsequent runs pick it up automatically.

Token scopes are `imports:create|read|rollback`, `media:upload`,
`catalog:read`, `stats:read` — no card bodies, reviews, Coach, settings,
billing, or account APIs. Note: `media:upload` on your token only opens the
**configured** upload endpoint you point `upload-media` at (see media.md); the
platform's own `/api/media` is not available to regular users.

**Bad-import recovery**

1. `GET /api/imports` (`imports:read`) → find `importId` (filter by `sourceUri` / time / deck).
2. `POST /api/imports/:importId/rollback` (`imports:rollback`) → delete that owner-scoped batch.
3. Fix payload → lint clean → import again.

If the user declines a token, or the API is unreachable / still 401 after one
persisted retry (ask for a fresh token, overwrite `.env.local`, retry once),
output JSON for manual Import in the app.

## Question type palette

Map every card to one of the four cores when possible. Prefer use and transfer over label recall:

| Core | Typical fronts (always situated — framework + situation, not a floating X) |
|------|----------------|
| **有什么用** | 在 [框架/处境] 里，X 解决什么问题？ / 什么具体场景需要 X？ |
| **为什么有用** | 在这个处境下，为什么 X 有效？ / 不做 X 会掉进什么失败？ |
| **怎么用** | 给定这个具体场景（题干就是 case），下一步？ — not 「何时用 X？」 |
| **可迁移性** | 同一模式还能用在哪个**点得着的**同类场景？ / 哪个不相关领域共享同一结构？ |

Forms (any core):

1. **Application (preferred):** scenario / symptom / constraint → what applies or next action (**怎么用**)
2. **Cause-effect / diagnosis:** what happens when Y; why it works; failure mode (**为什么有用** / **怎么用**)
3. **Comparison (decision):** when choose X over Y (**怎么用** / **有什么用**)
4. **Direct (Form A):** lead with what-for / why / how; bare "What is X?" only when a short working definition is itself the unit
5. **Cloze (Form B):** `{{c1::...}}` for procedure slots, thresholds, in-context terms — still phrase the statement around use when possible

Use [references/format.md](references/format.md) for schema, cloze details, math escaping, and golden examples.
