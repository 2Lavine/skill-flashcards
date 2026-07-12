# Card Quality Rules

Practical formulation rules for this skill (inspired by SuperMemo's Twenty Rules).  
Use when a fact is borderline, wording is bloated, or two concepts interfere.

## 1. Understand before memorizing

- Do not cardify text you cannot parse. Ambiguous source → skip or flag, do not guess.
- Build a rough mental model first: foundations → intermediate → detail.
- If a card needs a prerequisite, say so in the answer: "前提：已理解 X。"

## 2. Minimum information

- One fact, one card.
- Target 3–5 seconds to answer in review.
- If answering requires a chain of reasoning, split the chain.

## 3. Cloze is a form, not a highlighter

See [format.md](format.md) Form A / Form B.  
Never hide the subject of a definition question inside `{{c1::...}}`.

## 4. Imagery

- When a diagram would help, note it in the answer: `（建议配图：细胞结构示意图）`.
- Spatial relations can be described in words when no image is available.

## 5. Mnemonics

- For brittle sequences, add a short mnemonic in the answer.
- Use sparingly (~1–5% of cards).

## 6. Avoid sets

- Non-negotiable: do not ask "N types of Y" / "list all components".
- One member per card. If the set is long, keep only high-yield members (density decides).

## 7. Enumerations (ordered lists)

- Prefer overlapping clozes in context, or pairwise "what follows X?" cards.
- Grouping ("steps 1–3 are called ___") is acceptable when atomic steps are too thin.

## 8. Combat interference

- For confusable pairs, put the contrast in the answer.
- Vary question templates so similar cards do not share the same syntactic shell.

## 9. Optimize wording

- Delete filler, hedge words, and needless passive voice.
- Shortest question that still uniquely identifies the fact.
- Shortest answer that is still correct.

## 10. Anchor to other memories

- Link new facts to known ones: analogy, contrast, prerequisite.
- Example: "对比：mitosis 产生 2 个相同子细胞；meiosis 产生 4 个不同配子。"

## 11. Examples on definitions

- Definition cards should include a concrete example when the source or common knowledge supplies one.
- Pattern: `[定义]。例如：[例子]。`

## 12. Emotion / vividness

- Vivid hooks help sticky facts; overuse creates interference. Rare.

## 13. Context cues

- `deck` + `category` already supply domain context — questions need not restate the whole field.
- Still keep the question self-contained enough to answer without opening the source.

## 14. Redundancy is welcome

- Same idea from definition / consequence / relation angles is good.
- Form A and Form B on related facets can complement each other.
- This is not the same as duplicating identical cards.

## 15. Source quotes

- Prefer a `source_quote` that literally supports the card.
- No support in source → no card (unless the user explicitly asks for inferred drill and you mark it as inferred).

## 16. Date stamping

- Time-sensitive facts carry vintage in the answer: `(2024 数据)`, `(React 19+)`.

## 17. Prioritize

- Order of keep: foundational concepts > applied facts > edge cases > trivia.
- A false-positive card wastes future reviews; a missed low-value fact is cheap.
- Density sets the budget; this section spends it.

## Quick anti-patterns

| Anti-pattern | Fix |
|--------------|-----|
| "Explain the whole process" | Split into atomic steps |
| "List 5 benefits of X" | One benefit per card, or skip |
| Cloze inside "What is X?" | Form A |
| Cloze inside "What is X?" with answer = term only | Convert to Form A, or rewrite front as a statement |
| Category `数学/概率论` | `deck=数学`, `category=概率论` |
| `source` = lesson summary | Move title to `course`; URI to `source`; else omit |
