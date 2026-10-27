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
  "layout": "cover+cards",
  "footerLabel": "偏差-方差权衡",
  "cards": [
    { "question": "第一张卡的 question 原文", "answer": "第一张卡的 answer 原文" }
  ]
}
```

- `title`: cover title — short version of the post title if that is >20 chars.
- `kicker`: category or deck (≤8 chars looks best).
- `footerLabel`: topic line on card pages; optional.
- `layout`: `"cover+cards"` (default; cover + one image per card) or
  `"cards"` (no cover). Max 8 images total per Xiaohongshu post — keep
  cards ≤5 so there is room for the cover.
- `cardMode`: default `"split"` emits a question page then an answer page
  for every card (`02-q.png`, `03-a.png`, …). Set `"combined"` for the
  old one-page Q/A layout. Keep total images within the platform cap
  (cover + 2×cards ≤ 8, so ≥3 cards per post in split mode).
- Use the cards' ORIGINAL `question`/`answer` text. Cloze cards are fill-in
  exercises: the Q page shows the sentence with blank underlines; the A page
  shows the same sentence with each answer filled in and underlined (answers
  never wrap — they move whole to the next line). `$...$` / `$$...$$` and
  bare semicolon-separated TeX (`\\text{Bias}^2; …`) are typeset with
  MathJax; markdown media becomes `[图片]`/`[音频]` placeholders.
  Card content blocks are vertically centered, so short cards look balanced
  without manual padding. You MAY lightly shorten an over-long answer for
  the poster, but never change the meaning.

## Step 4 — Render

```bash
node <skill-root>/scripts/render.mjs share-spec.json --out out/<topic>/ [--scale 2]
```

- `sharp` and `mathjax-full` must be installed once:
  `npm i -g sharp mathjax-full` (recommended), or add both in the workspace.
  The scripts resolve CWD-local first, then global.
- Output: `01-cover.png`, `02-card.png`, … each 1242x1660 (3:4).
  `--scale 2` doubles resolution for crisper uploads.
- `share-spec.used.json` is copied into the output dir for reproducibility.

## Step 5 — Human check, then publish manually

ALWAYS show the user before declaring done:
- the rendered image paths (and inline preview if the interface supports it),
- the full `copy.md` content.

The user publishes manually in Xiaohongshu: upload images in filename order,
paste title/body/hashtags. There is no publish API — do not promise
auto-posting. Ask the user to check the cover line breaks; if the title
wraps awkwardly (e.g. a single character on the last line), shorten the
title and re-render.

## Limitations (be upfront)

- LaTeX is typeset locally through MathJax (base + ams packages). Complex
  macros outside those packages fail explicitly; shorten or simplify them.
- Images/audio in cards become `[图片]`/`[音频]` placeholders — normally
  skip those cards instead.
- Long cards are truncated at the renderer's line budget; prefer concise
  cards or shorten the poster text in the spec.
