---
name: sourcards-retro
description: >
  SourCards 今日复盘技能。用 Personal Integration Token 拉取某一本地日的刷卡次数、连续天数、
  近几日明细，以及当天复习过的卡片分页（题面、评分、牌组、分类、时间）。
  给本地 agent / cron 写复盘时使用。触发：复盘、今日刷卡、今天复习了什么、刷了哪些卡、
  day retro、review recap。不要用它制卡（sourcards-import）或只拉聚合日报（sourcards-daily-report）。
  番茄钟时长不在服务端，禁止编造专注分钟。
---

# SourCards 今日复盘

给 token 主人写一份当天复习复盘。数字和卡片只来自接口。接口没返回的，写「没有」，不要补。

## 先读什么

| 文件 | 何时读 |
|------|--------|
| [references/api.md](references/api.md) | 字段、时区、配额、404/401 |
| [scripts/fetch-retro.mjs](scripts/fetch-retro.mjs) | 跑脚本前确认参数 |

## 约束

1. **Token，不是登录会话。** `FLASHCARD_API_KEY`（`sc_int_…`，需 `stats:read`）。没有就走 `sourcards-import` 的 `scripts/login.mjs`，或让用户在 `Settings → Integrations → Personal Integration Tokens → Create` 新建。不要打印 token。
2. **只打这四个 GET：** `/api/stats`、`/api/daily-counts`、`/api/streak`、`/api/review-logs`。脚本会把当天复习记录翻完页。不要再去拉牌库、答案、Coach。
3. **没有番茄钟。** 专注开始/暂停/完成事件只在本机（`review_pomodoro_events`），服务端没有。复盘里不要写学了几分钟、番茄了几轮。用户把事件 JSON 贴进来时，才可以按那些事件算；否则整节省略。
4. **题面不是答案。** `logs[].question` 是正面。被截断时 `questionTruncated` 为 true，不要把题面补全。
5. **`stats.today` 和 `logs.length` 可以不一致。** 计数器按客户端写入时的 `localDay`；列表按 `localDay` + `tzOffsetMinutes` 切时间戳，并且已删卡片不会出现。两边不同就照实写，不要把缺口填成卡片。

## 步骤

`SKILL_ROOT` 是这份 SKILL.md 所在目录（名字 `sourcards-retro`，标记 `scripts/fetch-retro.mjs`）。

```bash
node "$SKILL_ROOT/scripts/fetch-retro.mjs" --json
node "$SKILL_ROOT/scripts/fetch-retro.mjs" --localDay 2026-10-28 --tzOffsetMinutes 480 --json
```

不传日期时，用跑脚本那台机器的本地日历日和时区。cron 机器的时区必须是用户的时区，否则两个参数都显式传。中国是 `480`（UTC+8 的分钟数）。

脚本退出码：0 成功，1 接口/网络失败，2 参数错误。404 表示线上还没有 `/api/review-logs`，停下来说明要等服务端部署，不要改用别的接口猜卡片。

## 复盘怎么写

用脚本打出的 JSON。短。用户读完能回答三件事：今天量怎么样、哪几张没过、明天先看哪。

```markdown
# YYYY-MM-DD 复习复盘

## 量
- 当日复习 N 次：优先取 `dailyCounts.daily` 里 `date == localDay` 的每日计数；
  `stats.today` 只对「今天」有效，查历史日会读到 0（脚本已按此取数）。
- 连续 M 天：这是**截至今天**的当前 streak；服务端不存「那一天的历史 streak」，不要反推。
- 近 7 天每日次数照 `dailyCounts.daily` 列，并说今天相对这几天是多还是少。只在这些数字上比较。

## 今天刷过的卡
按牌组 / 分类归堆。每张写题面和评分（1 Again，2 Hard，3 Good，4 Easy）。
Again / Hard 全部列出。Good / Easy 超过 30 张时只按牌组计数，不逐张抄。
翻页被 `reviews.truncated` 截断时，写明后面的卡没拿到。

## 明天
从 Again / Hard 里点出最多 5 张，说明为什么是它们（评分、同一分类扎堆）。不要布置接口里没有的新卡片。
```

`reviews.logs` 为空且 `stats.today` 为 0：写今天没有复习记录。不要用近几天的卡冒充今天。
