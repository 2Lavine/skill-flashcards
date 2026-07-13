# Output Format Reference

> Classify `deck` / `category` with [disciplines.md](disciplines.md). Formulation judgment calls: [quality-rules.md](quality-rules.md).

## JSON Schema

```json
{
  "deck": "地理学",
  "course": "高中地理 · 世界地理",
  "source": "https://example.com/geography-notes",
  "cards": [
    {
      "question": "法国的首都是哪里？",
      "answer": "巴黎（Paris）。",
      "tags": ["type:entity", "geography", "europe", "alias:巴黎", "alias:Paris"],
      "category": "世界地理",
      "source_quote": "Paris is the capital and largest city of France."
    }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `deck` | Yes | First-level discipline (Chinese common name, e.g. `数学` / `计算机科学` / `生物学`). Auto-created if missing. |
| `course` | No | Human title of the source material (course / book / article / video). Batch-level. Omit if unknown. |
| `source` | No | **URI only** — URL or file path locating the material. Batch-level. Omit if no locatable origin. Not prose, not a summary, not cropped body text. |
| `cards` | Yes | Array of card objects (min 1). |
| `cards[].question` | Yes | Front text. Cloze only via `{{cN::...}}` in Form B. |
| `cards[].answer` | Yes | Back text. Multi-cloze answers `;`-separated, in cloze-id order. |
| `cards[].tags` | No | 2–4 topical tags plus type/alias tags. `type:concept` / `type:entity` / optional `type:normal`. Every concept/entity card needs ≥1 `alias:<name>`. |
| `cards[].category` | No | Second-level discipline under the deck — single Chinese name, **no `/`**. |
| `cards[].source_quote` | No | Exact supporting sentence from the source. Shown under a revealed card. |
| `cards[].studyOrder` | No | 0-based reading order inside this import batch. Prefer emitting `cards[]` already in reading order and omit this field — the server defaults each card to its array index. Set explicitly only when you need to override array order. |

**Reading order:** emit `cards[]` in the order a learner should first meet the material (foundations → applications). Same-batch reviews stay sticky and sort by `studyOrder`, then `type:*` (concept → entity → normal). Do **not** overload `reviewPriority` for reading order.

## Concept tags & ordering

Same due-time bucket order:

1. `type:concept` — definitions, abstractions, prerequisites
2. `type:entity` — named people, tools, components, cases, places
3. normal / `type:normal` — procedures, applications, edge cases

`alias:<name>` is the linkable surface form. Required on every concept/entity card. Add abbreviations and alternate scripts when useful (`alias:FSRS`, `alias:间隔重复`).

## Cloze format

```
question: "The {{c1::FSRS}} algorithm uses {{c2::stability}}, {{c2::difficulty}}, and {{c2::retrievability}}."
answer:   "FSRS; stability; difficulty; retrievability"
```

- `{{c1::...}}` — hidden until reveal
- Same id (multiple `c1`) reveals together
- `c2`, `c3`, … reveal in sequence
- Review app shows `[...]` before reveal

### Form A vs Form B

Front/back must match. Cloze is **fill-in only**, never a highlighter inside a question prompt.

**Form A — definition Q&A (no cloze)**

```json
{
  "question": "What is stability in FSRS?",
  "answer": "A memory-state variable estimating how long a memory can be retained before forgetting becomes likely."
}
```

**Form B — cloze fill-in**

```json
{
  "question": "In FSRS, the {{c1::stability}} variable estimates how long a memory can be retained before forgetting becomes likely.",
  "answer": "stability"
}
```

Chooser:

| Front intent | Form |
|--------------|------|
| "What is X?" / "什么是 X?" / "X 指什么？" / definition prompt | **A** |
| Statement with a term removed; blank still readable in context | **B** |
| Unsure | **A** |

### Invalid patterns (do not emit)

```json
// ❌ cloze hides the subject of a question
{ "question": "SEPA 五要素中的 {{c1::催化剂}} 指什么？", "answer": "催化剂" }

// ❌ mixed form: question prompt + cloze + long definition back
{ "question": "What is {{c1::stability}} in FSRS?",
  "answer": "A memory-state variable estimating how long a memory can be retained before forgetting becomes likely." }

// ❌ tautology: answer is only the cloze term and teaches nothing new
{ "question": "买入低估和卖出高估与 {{c1::Ferrari vs Hyundai}} 的类比说明什么？",
  "answer": "Ferrari vs Hyundai" }
```

Fix by switching to Form A, or rewriting as a true Form B statement whose blank is the memorized term.

## Math / LaTeX

Inline `$...$`, display `$$...$$`. Review app renders with KaTeX.

### Always double backslashes in JSON

Cards are shipped as JSON and parsed with `JSON.parse`. A single `\` starts a JSON escape:

| Written in JSON string | After parse | Result |
|------------------------|-------------|--------|
| `"\\frac{1}{2}"` | `\frac{1}{2}` | ✅ KaTeX |
| `"\frac{1}{2}"` | form-feed + `rac{1}{2}` | ❌ silent corruption |
| `"\sigma"` | invalid escape | ❌ `JSON.parse` throws |

**Rule: every LaTeX backslash is `\\` inside JSON.** CJK inside `\\text{…}` is fine.

```json
{
  "question": "样本标准差 $s$ 的公式是什么？",
  "answer": "$s = \\sqrt{\\frac{1}{N-1}\\sum_{i=1}^{N}(r_i-\\bar{r})^2}$"
}
```

## Examples

All examples below are meant to be imitated. They obey Form A/B, tags/aliases, no sets, and URI-only `source`.

### Example 1 — Form A concepts & entities (Chinese source)

```json
{
  "deck": "生物学",
  "course": "生物课 · 细胞结构",
  "source": "https://example.edu/bio/cell-structure",
  "cards": [
    {
      "question": "细胞膜的主要功能是什么？",
      "answer": "控制物质进出细胞，维持细胞内部环境相对稳定。",
      "tags": ["type:entity", "细胞", "alias:细胞膜", "alias:cell membrane"],
      "category": "细胞生物学",
      "source_quote": "细胞膜控制物质进出"
    },
    {
      "question": "细胞核中主要含有哪种遗传物质？",
      "answer": "DNA。",
      "tags": ["type:entity", "遗传", "alias:DNA"],
      "category": "细胞生物学",
      "source_quote": "细胞核含有遗传物质DNA"
    },
    {
      "question": "细胞质是指细胞中哪两个结构之间的部分？",
      "answer": "细胞膜与细胞核之间的部分。",
      "tags": ["type:concept", "细胞", "alias:细胞质"],
      "category": "细胞生物学",
      "source_quote": "细胞主要由细胞膜、细胞质和细胞核组成"
    },
    {
      "question": "线粒体为什么常被称为细胞的“能量工厂”？",
      "answer": "因为它通过有氧呼吸产生 ATP，为细胞生命活动供能。",
      "tags": ["type:entity", "能量代谢", "alias:线粒体", "alias:mitochondria"],
      "category": "细胞生物学",
      "source_quote": "线粒体是细胞的能量工厂，通过有氧呼吸产生ATP。"
    }
  ]
}
```

### Example 2 — Form B cloze + comparison (technical)

```json
{
  "deck": "计算机科学",
  "course": "FSRS 算法说明",
  "source": "https://github.com/open-spaced-repetition/fsrs4anki/wiki",
  "cards": [
    {
      "question": "What is FSRS?",
      "answer": "A spaced-repetition algorithm that models memory with stability, difficulty, and retrievability.",
      "tags": ["type:concept", "spaced-repetition", "alias:FSRS", "alias:Free Spaced Repetition Scheduler"],
      "category": "学习科学",
      "source_quote": "FSRS is a spaced repetition algorithm that uses a three-component model of memory: stability, difficulty, and retrievability."
    },
    {
      "question": "In FSRS, the {{c1::stability}} variable estimates how long a memory can be retained before forgetting becomes likely.",
      "answer": "stability",
      "tags": ["type:entity", "memory-model", "alias:stability", "alias:S"],
      "category": "学习科学",
      "source_quote": "Stability (S) increases with each successful review."
    },
    {
      "question": "After each successful review in FSRS, stability tends to {{c1::increase}}.",
      "answer": "increase",
      "tags": ["fsrs", "review"],
      "category": "学习科学",
      "source_quote": "Stability (S) increases with each successful review."
    },
    {
      "question": "What is the key difference between FSRS and SM-2?",
      "answer": "FSRS tracks stability independently of difficulty; SM-2 mainly folds difficulty into a single factor.",
      "tags": ["comparison", "alias:SM-2"],
      "category": "学习科学",
      "source_quote": "Unlike SM-2 which only uses a single difficulty factor, FSRS tracks stability independently."
    }
  ]
}
```

Note: "three components" is **not** one set card. If each component must be memorized, emit separate cards (as above for stability) rather than "list the three components."

### Example 3 — Math / LaTeX escaping

```json
{
  "deck": "数学",
  "course": "统计基础",
  "source": "/notes/stats-sd.md",
  "cards": [
    {
      "question": "样本标准差 $s$ 的公式是什么？",
      "answer": "$s = \\sqrt{\\frac{1}{N-1}\\sum_{i=1}^{N}(r_i-\\bar{r})^2}$",
      "tags": ["type:concept", "statistics", "alias:样本标准差", "alias:sample standard deviation"],
      "category": "概率论",
      "source_quote": "样本标准差用无偏估计，分母为 N-1。"
    },
    {
      "question": "样本方差公式的分母使用 {{c1::N-1}} 而不是 $N$，是为了得到无偏估计。",
      "answer": "N-1",
      "tags": ["statistics", "unbiased"],
      "category": "概率论",
      "source_quote": "样本标准差用无偏估计，分母为 N-1。"
    }
  ]
}
```

### Example 4 — High-density technical without set cards

```json
{
  "deck": "计算机科学",
  "course": "Python 语法",
  "source": "https://docs.python.org/3/glossary.html#term-decorator",
  "cards": [
    {
      "question": "What is a Python decorator?",
      "answer": "A callable that takes a function and returns a modified function or callable wrapper.",
      "tags": ["type:concept", "python", "alias:decorator", "alias:装饰器"],
      "category": "程序设计语言",
      "source_quote": "Python decorators are functions that modify other functions."
    },
    {
      "question": "What is the syntax for applying a decorator to a Python function?",
      "answer": "Place `@decorator_name` on the line immediately above the `def`.",
      "tags": ["python", "syntax"],
      "category": "程序设计语言",
      "source_quote": "The syntax is @decorator_name above a function definition."
    },
    {
      "question": "In Python, `@log` placed before `def foo():` is equivalent to what assignment?",
      "answer": "`foo = log(foo)`",
      "tags": ["python", "desugar"],
      "category": "程序设计语言",
      "source_quote": "Under the hood, @log before def foo(): is equivalent to foo = log(foo)."
    },
    {
      "question": "For stacked decorators `@a` then `@b` above `def f():`, what is the binding order?",
      "answer": "`f = a(b(f))` — the decorator closest to the function applies first.",
      "tags": ["python", "decorators"],
      "category": "程序设计语言",
      "source_quote": "Decorators can stack: @a @b def f(): means f = a(b(f))."
    },
    {
      "question": "Caching is one common use of Python decorators. Name one other common use.",
      "answer": "Any one of: logging, timing, or access control.",
      "tags": ["python", "application"],
      "category": "程序设计语言",
      "source_quote": "Common uses: logging, timing, access control, caching."
    }
  ]
}
```

The last card intentionally asks for **one** member, not the whole set.
