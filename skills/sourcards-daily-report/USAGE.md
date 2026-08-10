# sourcards-daily-report 使用说明

用 **Personal Integration Token** 拉取 SourCards 每日复习数据，生成 Markdown
报表（给人看）或 JSON（给 cron / agent 管道用）。只读三个端点：
`/api/stats`、`/api/daily-counts`、`/api/streak`。

## 前置条件

1. **Personal Integration Token**（`sc_int_…`，默认已含 `stats:read` 权限）：
   在 App 里创建，路径 `Settings → Integrations → Personal Integration Tokens → Create`，
   完整值只在创建时显示一次。
2. 把 token 放进环境变量（脚本会自动加载仓库根目录的 `.env.local` / `.env`，不覆盖已有环境变量）：

   ```bash
   export FLASHCARD_API_KEY=sc_int_…
   ```

3. 自托管 / 本地实例：用 `SOURCARDS_API_BASE_URL` 覆盖默认官方地址

   ```bash
   export SOURCARDS_API_BASE_URL=http://localhost:3000
   ```

## 手动用法

```bash
# 最近 7 天，Markdown → stdout（默认）
node skills/sourcards-daily-report/scripts/fetch-daily-report.mjs

# 最近 30 天
node skills/sourcards-daily-report/scripts/fetch-daily-report.mjs --days 30

# 按用户本地日历日锚定"今天"（不传则用 UTC）
node skills/sourcards-daily-report/scripts/fetch-daily-report.mjs --localDay 2026-08-11

# 原始 JSON（stats + dailyCounts + streak + 配额余量）—— cron / agent 二次加工用
node skills/sourcards-daily-report/scripts/fetch-daily-report.mjs --days 7 --json

# 写文件而不是 stdout
node skills/sourcards-daily-report/scripts/fetch-daily-report.mjs --out report.md
```

### 参数一览

| 参数 | 说明 | 默认 |
|------|------|------|
| `--days N` | 每日明细天数（1–365） | `7` |
| `--localDay YYYY-MM-DD` | 锚定"今天"的本地日历日 | 服务器 UTC 今天 |
| `--json` | 输出原始 JSON 代替 Markdown | 关 |
| `--out FILE` | 写入文件（stdout 打印提示） | stdout |

### Markdown 报表样例

```markdown
# 每日复习报表

## 今日概览
- 今日复习：**9** 张
- 累计复习：432 张
- 连续天数：5 天
- 卡片总数：120（待复习 12，学习中 2，复习中 7）
- 配额剩余：97 / 100（今日 API 次数）

## 每日明细
2026-08-10: 4
2026-08-11: 9
```

## 配额（重要）

Token 访问按**会员等级日配额**计量，每次报表 = 3 次请求：

| 会员等级 | 每日请求配额 |
|----------|--------------|
| Free | 100 |
| Lite | 5000 |
| Lifetime | 5000 |

- 每个响应带 `X-RateLimit-Limit` / `X-RateLimit-Remaining` 头；Markdown 报表会把余量打印出来。
- 超限返回 **429**，脚本退出码 1 并提示配额已用完（配额按服务器 UTC 日重置）。
- token 无效返回 **401**，脚本提示重新设置 `FLASHCARD_API_KEY`。

## Cron 定时拉取（接 agent / 日报）

目标：每天固定时间拉一次数据，留档 JSON，之后可让 agent 基于历史文件做趋势汇总。
脚本只读、幂等——重复跑没有副作用，只消耗配额。

### 示例：每天 09:00 拉取并存档

```cron
0 9 * * * cd /path/to/your/repo && /usr/bin/env FLASHCARD_API_KEY=sc_int_… \
  node skills/sourcards-daily-report/scripts/fetch-daily-report.mjs \
  --days 30 --json --out "$(date +\%Y-\%m-\%d).json" >> /tmp/sourcards-report.log 2>&1
```

注意：

- **cron 环境很干净**，没有 shell profile，也不会自动加载 `.env.local`——token
  要么写在 cron 行内，要么用 `source /path/to/.env.local` 先加载，要么把 token
  放在 cron 能读到的环境里。**不要把 token 明文提交进仓库。**
- `--out` 用 `$(date ...)` 按天命名，JSON 留档后即可算周均值、streak 变化、
  连续达标天数等趋势（这部分适合后续接 agent 生成报表）。
- 日志重定向到文件方便排查；脚本退出码：0 成功 / 1 API/IO 失败 / 2 用法错误。

### 给 agent 的建议流程

1. 跑 `--json` 拿当天数据（含配额余量）。
2. 若 `rateLimit.remaining` 很低，提示用户配额即将用完，减少调用频率。
3. 汇总时以 `dailyCounts.daily` 为时间序列、`stats.totalReviews` 为累计基线，
   不要与早前快照的 `today` 相加（它是当天计数，不是增量）。

## 排障

| 现象 | 原因与处理 |
|------|-----------|
| `API 未授权 (401)` | `FLASHCARD_API_KEY` 缺失/过期/不是 Personal Integration Token。重新创建并设置 |
| `配额已用完 (429)` | 当日请求超会员配额，明天重置；或联系提升额度 |
| `API 请求失败：HTTP …` | 网络/服务端异常，检查 `SOURCARDS_API_BASE_URL` 与网络 |
| 输出是英文日期标签 | `dailyCounts` 的 label 是星期缩写，数据仍是 UTC/指定 localDay 的日期 |
