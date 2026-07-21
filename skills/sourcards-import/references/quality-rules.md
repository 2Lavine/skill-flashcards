# Card Quality Rules

Practical formulation rules for this skill (inspired by SuperMemo's Twenty Rules).  
Use when a fact is borderline, wording is bloated, or two concepts interfere.

## 0. Utility first — four cores (overrides almost everything)

**Number one rule.** Do not train pure recitation of labels. Every keepable card should land on at least one core:

| Core | Question to ask | Example front |
|------|-----------------|---------------|
| **有什么用** | What problem / situation / outcome is this for? | 「止损」主要解决交易中的什么问题？ |
| **为什么有用** | Why does it matter? Mechanism? What failure does it prevent? | 为什么不移动止损容易把盈利单做成亏损单？ |
| **怎么用** | When / how to apply? Steps, cues, trade-offs, next action? | 趋势行情里，何时把止损从入场点移到盈亏平衡？ |
| **可迁移性** | Where else does the *pattern* reuse? Near (same domain) + far (shared structure, distant surface) | 止损的「先锁最大可承受损失」还能用在哪些交易外场景？ |

**Gate before writing:**

1. Can the source support **有什么用 / 为什么有用 / 怎么用 / 可迁移性** for this idea?
2. If only a dictionary definition remains → **skip** (unless user asked for exam/recitation).
3. If a definition is truly the working unit, keep it short and attach a mini-use in the answer: `用途：…` / `例如：…`.
4. **Transfer quality:** near transfer must feel like the same move; far transfer must name the shared structure. No forced metaphors.

**Rewrite habit:** "什么是 X？" → prefer "X 解决什么问题？" / "为什么需要 X？" / "何时/如何用 X？" / "同一模式还能用在哪？" when the source allows.

## 1. Understand before memorizing

- Do not cardify text you cannot parse. Ambiguous source → skip or flag, do not guess.
- Build a rough mental model first: **use cases & decisions** → foundations needed for those → detail.
- If a card needs a prerequisite, say so in the answer: "前提：已理解 X。"

## 2. Minimum information

- One fact **or one usable skill**, one card.
- Target 3–5 seconds to answer in review.
- Prefer decision rules and applied consequences over glossary entries.
- If answering requires a chain of reasoning, split the chain.

## 3. Cloze is a form, not a highlighter

See [format.md](format.md) Form A / Form B.  
Never hide the subject of a definition question inside `{{c1::...}}`.

## 4. Imagery

- When a diagram would help, note it in the answer: `（建议配图：细胞结构示意图）`.
- Spatial relations can be described in words when no image is available.
- For Japanese / listening study, embed real media in markdown (`<audio …>` / `![alt](url)`); see format.md "Japanese / listening media".
- Pick one primary genre: `type:vocab` (text stays visible) vs `type:listening` (listen-first; hide transcript face-down). Do not stack both.
- Listening fronts should put prompt audio on the question; keep transcripts / meanings on the answer.

## 5. Mnemonics

- For brittle sequences, add a short mnemonic in the answer.
- Use sparingly (~1–5% of cards).

## 6. Avoid sets

- Non-negotiable: do not ask "N types of Y" / "list all components".
- One member per card. If the set is long, keep only high-yield members (density decides).

### 6b. No ordinal-index cues (hard ban)

Using list position as the only cue is **not** a valid atomic card. The number is scaffolding from a textbook outline, not knowledge you need years later.

**Banned (question side):**
- "X 的第 N 个原则/概念/步骤/要点是什么？"
- "What is the Nth principle / concept / step of X?"
- "X 的第三个要素叫什么？" / "Name the 2nd component of Y"
- Any template where removing "第 N / Nth" leaves no other way to identify the answer

**Why it fails:** reviews train "N → label", not the idea. Authors renumber; exams rarely ask "第 3 条"; interference across frameworks is brutal.

**Rewrite — cue by content, not index:**

| Bad | Good |
|-----|------|
| SOLID 的第 2 个原则是什么？ | SOLID 中，要求「对扩展开放、对修改关闭」的原则叫什么？ |
| 道氏理论的第 3 个原则是什么？ | 道氏理论中，关于「主要趋势分三个阶段」的原则说什么？ |
| FSRS 的第 1 个核心变量是什么？ | FSRS 中表示「记忆能保持多久」的变量叫什么？ |
| What is the 3rd step of gradient descent? | In gradient descent, after computing the gradient, what do you do next? |

Ordered processes: use pairwise **"what follows X?"** or overlapping clozes in a statement — never "step N is ___".

**Narrow exception:** the ordinal **is** the conventional name of the fact itself (e.g. "Newton's Third Law", "美国宪法第 14 修正案", "热力学第三定律"). If the source presents it as a proper name people actually use, keep the name; do not invent "第 N 个" for anonymous list items.

## 7. Enumerations (ordered lists)

- Prefer overlapping clozes in context, or pairwise "what follows X?" cards.
- Grouping ("steps 1–3 are called ___") is acceptable when atomic steps are too thin.
- Still never front a card with only "第 N 步 / step N" as the cue (see 6b).

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

- If you must keep a definition, attach use: `[定义]。用途：[有什么用]。例如：[怎么用的例子]。`
- Prefer skipping pure definitions when an application card already covers the idea.

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

- Order of keep: **怎么用 / 有什么用 / 为什么有用 / 可迁移性** (usable cores) > foundational working concepts that unlock those cores > edge cases > pure definitions > trivia.
- A false-positive definition card wastes future reviews; a missed low-value label is cheap.
- Density sets the budget; section 0 spends it.

## Quick anti-patterns

| Anti-pattern | Fix |
|--------------|-----|
| Pure "什么是 X？" with no use context | Rewrite to 有什么用 / 为什么有用 / 怎么用 / 可迁移性, or skip |
| Forced far analogy (surface pun only) | Drop far transfer; keep near only if solid |
| Glossary dump (term ↔ definition only) | Keep only terms that unlock decisions; add 用途/例子 in answer |
| "Explain the whole process" | Split into atomic **how-to** steps |
| "List 5 benefits of X" | One **有什么用** benefit per card, or skip |
| "X 的第 N 个原则/概念是什么？" | Cue by definition/role/name; drop the ordinal |
| "What is the Nth step of Y?" | "After Z, what comes next?" or content cloze |
| Cloze inside "What is X?" | Form A |
| Cloze inside "What is X?" with answer = term only | Convert to Form A, or rewrite as use-oriented statement |
| Category `数学/概率论` | `deck=数学`, `category=概率论` |
| `source` = lesson summary | Move title to `course`; URI to `source`; else omit |
