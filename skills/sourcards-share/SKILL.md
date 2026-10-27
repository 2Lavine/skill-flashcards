---
name: sourcards-share
description: Turn freshly generated SourCards flashcards (sourcards-import cards.json) into a Xiaohongshu (小红书) image-and-text post — poster PNGs (1242x1660) + title/body/hashtags copy. Use when the user wants to 分享卡片、发小红书、做运营图文, right after 制卡 or from an existing cards.json. Not for importing cards into the app (use sourcards-import), not for auditing the library.
---

# SourCards Share — 卡片 → 小红书图文

Local-only skill. No app code, no server, no account, no network API. Input is a
`cards.json` in the **sourcards-import** format; output is a folder of PNG
posters plus a Markdown copy file the user pastes into Xiaohongshu manually.

Typical pipeline in one agent session:

```
素材 → sourcards-import 制卡（cards.json，尚未导入 App 也可以）
     → sourcards-share（本 skill：选卡 + 写文案 + 渲图）
     → 用户手动在小红书发布
```

## When to use

- User just finished making cards with `sourcards-import` and wants to share
  the newest batch (cards do NOT need to be imported into the app first).
- User points at an existing `cards.json` / exported deck and says
  "发小红书 / 做成图文 / 分享最新卡".

Do NOT use for: importing cards, linting the library, making review-stat
"战报" images (no stats source in cards.json).

## Inputs

`cards.json` shape (same as sourcards-import output):

```json
{
  "deck": "计算机科学与技术",
  "course": "机器学习笔记 · 偏差-方差权衡",
  "cards": [
    { "question": "...", "answer": "...", "category": "机器学习",
      "tags": ["..."], "importanceScore": 8 }
  ]
}
```

If the user gives no path, look for `cards.json` in the current workspace
(the import skill's default output). If several exist, ask which one.

## Step 1 — Select cards (3–5 per post)

Pick cards that make a coherent standalone mini-lesson:

- One topic per post. Prefer cards sharing `category`; use `deck`/`course`
  as the topic label.
- Prefer high `importanceScore`, but relevance to the topic beats score.
- A good set reads as: 1 hook/concept card + 1–3 mechanism cards + (optional)
  1 "常见误区/下一步怎么做" card.
- Skip cards whose value depends on missing media (image/audio-only cards)
  or that need the full source document to make sense.
- Default to the newest batch (last N cards in the file) when the user says
  "分享最新的"; otherwise let the user pick the topic first if ambiguous.

## Step 2 — Write the copy (save as `copy.md` in the output dir)

```markdown
# 标题
（见下方标题规则）

# 正文
...

# 话题
#标签1 #标签2 #标签3
```

Title rules:
- ≤20 Chinese characters total; the cover poster fits ~10 chars per line,
  so ≤10 chars gives a one-line cover, ≤20 two lines. Never exceed 20.
- Hook with a concrete payoff or pain point, not clickbait:
  "过拟合总治不好？先分清偏差和方差" ✓ / "震惊！AI 竟然……" ✗
- No SourCards branding in the title — the post is nutrition first,
  the brand watermark does the rest.

Body rules:
- 100–300 Chinese characters. Expand on the cards, do not repeat them verbatim.
- Structure: 痛点/场景一句 → 核心结论 2–4 句 → 一句行动建议或总结.
- Light emoji use is fine (0–3 total); no emoji walls.
- Soft CTA at the end, at most one line, e.g.
  "这些卡是我用 SourCards 整理复习的，同类知识点会持续更新。"
- Never include QR codes, WeChat IDs, "私信我领", or link-stuffing.
  Do not put a URL in the images; the image watermark is just "SourCards".
  A plain-text domain may appear in the post body only when explicitly requested.

Hashtags: 3–5, topic-first, then one learning-method tag, e.g.
`#机器学习 #深度学习 #考研 #学习方法 #间隔重复`.

## Step 3 — Build `share-spec.json`

```json
{
  "kicker": "机器学习",
  "title": "过拟合总治不好？先分清偏差和方差",
  "layout": "cover+overview+cards",
  "footerLabel": "偏差-方差权衡",
  "overview": {
    "label": "偏差-方差的三层",
    "items": [
      "偏差高 = 欠拟合，模型太笨",
      "方差高 = 过拟合，模型太敏感",
      "总误差 = 偏差² + 方差 + 噪声"
    ],
    "note": "机器学习笔记 · 偏差-方差权衡"
  },
  "cards": [
    { "question": "第一张卡的 question 原文", "answer": "第一张卡的 answer 原文" }
  ]
}
```

- `title`: cover title — short version of the post title if that is >20 chars.
  The cover auto-breaks at a punctuation boundary when greedy wrapping would
  leave a stub line, so `明知道该改，为什么改不掉` becomes `明知道该改，` /
  `为什么改不掉` instead of `…为什么改` / `不掉`.
- `kicker`: category or deck (≤8 chars looks best).
- `footerLabel`: topic line on card pages; optional.
- `layout`: `"cover+cards"` (default; cover + N card images),
  `"cover+overview+cards"` (adds the agenda page), or `"cards"` (no cover).
- `overview`: optional agenda page between cover and cards — `label`
  (headline), `items` (2–4 one-line bullets, auto-numbered `01/02/03`),
  `note` (attribution, printed at the bottom on the cards' footer baseline).
  **Use it whenever the post has ≥3 cards.** Without it the set reads as N
  unrelated cards rather than one argument; with it the reader gets the
  structure before any single Q/A. Skip for 1–2 cards.
- `cardMode`: default `"split"` emits a question page then an answer page
  for every card (`02-q.png`, `03-a.png`, …). Set `"combined"` for the
  old one-page Q/A layout. Image budget: split costs two pages per card,
  so 3–4 cards + cover + overview (8–10 images) is the comfortable size.
- **Both sides are labelled with a filled accent badge** (`Q 问题` / `A 答案`)
  rather than a thin letter, so the two sides stay distinguishable in the
  feed's thumbnail strip. The answer page also **reprints the question** as a
  muted, rule-marked pull-quote above the answer: the reader arrives there by
  scrolling past a full-screen image and has lost the prompt. Cloze cards skip
  the recap — their answer side already reprints the whole sentence.
- Base Q/A on the cards' original text, but **situate the question**. A card's
  question is written for spaced repetition: the reviewer already has the
  context, so a bare "什么是X？" is enough. The poster reader has none, so the
  Q page opens with a concrete situation and only then asks:
  `一个人明明知道自己在毁掉生活，为什么还是不动？Rich Roll 酗酒二十年，
  他说转折点不是某次清醒，那到底是什么？` Two to three lines at 56px is the
  target — a one-line question wastes the whole page. Re-frame freely, but
  invent no facts.
- Answers: conclusion first, then mechanism, then the落点, separated by `\n`
  — every newline renders as a paragraph gap, which is what keeps a 44px
  answer readable on a phone. A single blob reads as a wall.
- Cloze cards are fill-in exercises: the Q page shows the sentence with blank
  underlines; the A page shows the same sentence with each answer filled in
  and underlined (answers never wrap — they move whole to the next line).
  `$...$` / `$$...$$` and bare semicolon-separated TeX (`\\text{Bias}^2; …`)
  are typeset with MathJax; markdown media becomes `[图片]`/`[音频]`
  placeholders. Card content blocks are vertically centered, so short cards
  look balanced without manual padding. You MAY lightly shorten an over-long
  answer for the poster, but never change the meaning.

## Step 4 — Render

```bash
node <skill-root>/scripts/render.mjs share-spec.json --out out/<topic>/ [--scale 2]
```

- `sharp` and `mathjax-full` must be installed once:
  `npm i -g sharp mathjax-full` (recommended), or add both in the workspace.
  The scripts resolve CWD-local first, then global.
- Output: `01-cover.png`, `02-overview.png` (when `overview` is set),
  `03-q.png` / `04-a.png` … each 1242x1660 (3:4). `--scale 2` doubles
  resolution for crisper uploads.
- `share-spec.used.json` is copied into the output dir for reproducibility.

## Step 5 — Human check, then publish manually

ALWAYS show the user before declaring done:
- the rendered image paths (and inline preview if the interface supports it),
- the full `copy.md` content.

The user publishes manually in Xiaohongshu: upload images in filename order,
paste title/body/hashtags. There is no publish API — do not promise
auto-posting. Cover line breaks are auto-balanced at punctuation, but still
look at the rendered cover: if the title had to break at a comma, the second
line should not be much shorter than the first. If it is, shorten `title`
and re-render.

## Limitations (be upfront)

- LaTeX is typeset locally through MathJax (base + ams packages). Complex
  macros outside those packages fail explicitly; shorten or simplify them.
- Images/audio in cards become `[图片]`/`[音频]` placeholders — normally
  skip those cards instead.
- Long cards are truncated at the renderer's line budget; prefer concise
  cards or shorten the poster text in the spec.

## Editing this skill (APM — read before patching)

This skill is installed by **APM**, not hand-managed. `~/.agents/skills/…`,
`~/.claude/skills/…` and `~/.config/opencode/skills/…` are **generated
copies**: `apm install -g` re-materialises them from the source checkout at
`~/.apm/apm_modules/2Lavine/skill-flashcards/skills/sourcards-share/`, which
is itself fetched from the `2Lavine/skill-flashcards` git repo.

So a patch applied only to a distributed copy is **silently reverted** on the
next `apm install` / sync. Correct order:

1. Edit the source checkout under `~/.apm/apm_modules/2Lavine/skill-flashcards/`.
2. Copy the changed files into the three distribution targets (or run
   `~/.apm/bridge.sh --prune`).
3. To survive the next fetch, the change must be committed and pushed to
   `2Lavine/skill-flashcards` — otherwise step 1 is a local-only patch with a
   half-life of one `apm install`.
