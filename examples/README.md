# Examples

一份可以照着跑的**最小端到端示例**：从一段学习笔记到一批可通过 lint、可导入的卡片。

| File | What it is |
|------|-----------|
| [source-material.md](source-material.md) | 制卡**输入材料**（一段中文学习笔记）。替换成你自己的任何文本即可 |
| [cards.json](cards.json) | 从源材料生成的卡片 JSON——**既是 lint 输入，也是 `POST /api/import` 的请求体**（同一份文件，不重复维护）。安装进 agent 的副本在 `skills/sourcards-import/examples/`，不要写 `apm_modules/.../examples/cards.json` |

## 30-second path

```bash
# 1. Lint the example (no API key needed — exit 0 = safe to import)
node skills/sourcards-import/scripts/lint-cards.mjs examples/cards.json
#   ✓ lint clean — 7 card(s), safe to import.

# 2. Import (needs a Personal Integration Token, see references/api.md)
export FLASHCARD_API_KEY=sc_int_…            # or skill-folder .env (copy .env.example)
curl -X POST https://sourcard.sourmonkey.xyz/api/import \
  -H "Content-Type: application/json" \
  -H "x-api-key: $FLASHCARD_API_KEY" \
  -d @examples/cards.json

# 3. Roll back if it imported the wrong batch (grab the import id from the response)
curl -X POST https://sourcard.sourmonkey.xyz/api/imports/<importId>/rollback \
  -H "x-api-key: $FLASHCARD_API_KEY"
```

## What the example demonstrates

`cards.json` 刻意覆盖了本 skill 的所有核心格式约定，作为你自己制卡的参考模板：

| 约定 | 见 cards.json |
|------|--------------|
| Form A（应用/诊断型 Q&A，不带 cloze） | 第 2、3、5、6、7 张 |
| Form B（cloze 填空，`{{cN::…}}` + `;` 分隔答案） | 第 1、4 张 |
| LaTeX 用 `$$…$$`，JSON 内反斜杠双写（`\\text`） | 第 4 张 |
| `type:concept` + ≥1 个 `alias:<名>` | 全部卡片 |
| `source_quote` 精确取自源材料 | 第 1–4 张 |
| `deck`（一级学科） + `category`（二级、无 `/`） | 全部卡片 |
| 无清单式列举、无序数线索、不混用 Form A/B | 全部卡片 |

## Turn it into YOUR cards

1. 把 [source-material.md](source-material.md) 替换成你自己的笔记/文章/逐字稿。
2. 让 agent（或任何 LLM）按 `SKILL.md` 的规则产出 `cards.json`。
3. 跑 `lint-cards` 直到 `EXIT=0`，再导入。
