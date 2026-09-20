# SourCards Skills（`skill-flashcards`）

把学习材料变成 FSRS 间隔复习卡片的**外部 agent 技能包**（Codex plugin / multi-skill pack）。
制卡、校验、导入、回滚——全部通过开放 API，不依赖 App 内 Coach。

- 插件名：**`skill-flashcards`**；npm 包（可选）：**`@sourcards/skill-flashcards`**
- 主技能：**`sourcards-import`**（原 `sourcards-flashcards`）
- 辅助技能：**`sourcards-library-lint`**
- 报表技能：**`sourcards-daily-report`**

## 能帮你做什么

| 你想做的事 | 用哪个 | 需要什么 |
|-----------|--------|---------|
| 把笔记/文章/逐字稿制成本地卡片 `cards.json` | `sourcards-import`（制卡规则） | 无 |
| 校验 `cards.json` 能否安全导入 | `sourcards-import` → `lint-cards` | 无（可选 `--catalog` 需 token） |
| 导入一批卡片到你的 SourCards 库 | `sourcards-import` → `POST /api/import` | Personal Integration Token |
| 回滚导错的批次 | `sourcards-import` → `POST /api/imports/:id/rollback` | Personal Integration Token |
| 本地图片/音频 → 线上 `https` 媒体 | `sourcards-import` → `upload-media` | token 或 GitHub BYO |
| 整理已有牌库（重名/空组/未分类漂移） | `sourcards-library-lint` → `lint-library` | 完整牌库快照（导出） |
| 拉取每日复习统计/生成报表（含 cron 定时） | `sourcards-daily-report` → `fetch-daily-report` | Personal Integration Token（`stats:read`） |

能力边界（**令牌做不到的**）：不创建登录会话；不能访问卡片正文（导入 payload 之外）、
原始复习日志（raw review logs）、Coach 或 LLM、设置/计费/账户、以及本表之外任何路由。
令牌可以读取**聚合复习统计**（`/api/stats`、`/api/daily-counts`、`/api/streak`，`stats:read`），
按会员等级每日配额计量（Free 100 次/天，Lite/Lifetime 5000 次/天）。

## 30 秒跑通一个导入

```bash
# 1. 制卡 → 示例即模板：examples/cards.json 已覆盖所有格式约定，
#    把 examples/source-material.md 换成你自己的材料即可（见 examples/README.md）

# 2. 校验（不需要 token，EXIT=0 即安全）
node skills/sourcards-import/scripts/lint-cards.mjs examples/cards.json

# 3. 导入（需要 Personal Integration Token，见下）
node skills/sourcards-import/scripts/login.mjs   # browser login, writes .env.local
# or: export FLASHCARD_API_KEY=sc_int_… / save-token.mjs paste fallback
curl -X POST https://sourcard.sourmonkey.xyz/api/import \
  -H "Content-Type: application/json" \
  -H "x-api-key: $FLASHCARD_API_KEY" \
  -d @examples/cards.json

# 4. 导错了？回滚（importId 来自上一步响应）
curl -X POST https://sourcard.sourmonkey.xyz/api/imports/<importId>/rollback \
  -H "x-api-key: $FLASHCARD_API_KEY"
```

## 能力 × 权限 × 路由

Personal Integration Token（前缀 `sc_int_…`）新令牌默认恰好五个权限：

| 权限 | 路由 | 作用 |
|------|------|------|
| `imports:create` | `POST /api/import` | 导入一批卡片 |
| `imports:read` | `GET /api/imports` | 列出导入批次 |
| `imports:rollback` | `POST /api/imports/:id/rollback` | 回滚某批次 |
| `media:upload` | `POST /api/media` | 官方媒体上传（需账户 `media:upload` 权益与配额） |
| `catalog:read` | `GET /api/decks`, `GET /api/categories` | 读取牌组/分类（校验重名、交叉核对） |

> 令牌鉴权用 `x-api-key: $FLASHCARD_API_KEY` 或 `Authorization: Bearer …`。
> 完整字段/响应细节见 [api.md](skills/sourcards-import/references/api.md)。

## 技能详情

### `sourcards-import` — 制卡 → 校验 → 导入

制卡规则（原子卡、Form A/B、标签、学科归类、LaTeX 转义）都在
[SKILL.md](skills/sourcards-import/SKILL.md) 及其 `references/` 下，按需读取：

| 文件 | 何时读 |
|------|--------|
| [format.md](skills/sourcards-import/references/format.md) | 写卡片 JSON、cloze、标签、公式 |
| [quality-rules.md](skills/sourcards-import/references/quality-rules.md) | 判断该不该出卡、怎么拆/措辞 |
| [disciplines.md](skills/sourcards-import/references/disciplines.md) | 定 `deck` / `category` 学科 |
| [media.md](skills/sourcards-import/references/media.md) | 本地图片/音频 → 线上 URL |
| [api.md](skills/sourcards-import/references/api.md) | 令牌权限、导入/列表/回滚 |

### `sourcards-library-lint` — 整理已导入的牌库

对已导入的牌组做漂移审计（重名、近重复、空/过小组、未分类积压），**默认只读**。
CLI 只接受完整牌库快照（`catalog:read` 端点不含所需计数，不能重建快照），
见 [SKILL.md](skills/sourcards-library-lint/SKILL.md)。

### `sourcards-daily-report` — 拉取每日复习报表

用 Personal Integration Token（`stats:read`）拉取复习统计，生成 Markdown 或
JSON。完整手册（前置条件、参数、配额、**cron 定时示例**）见
[USAGE.md](skills/sourcards-daily-report/USAGE.md)，快捷用法：

```bash
# Markdown 报表（默认最近 7 天）
node skills/sourcards-daily-report/scripts/fetch-daily-report.mjs

# 原始 JSON（cron / agent 管道用）
node skills/sourcards-daily-report/scripts/fetch-daily-report.mjs --days 30 --json
```

## 本地工具

```bash
# 校验卡片 JSON（导入前）
node skills/sourcards-import/scripts/lint-cards.mjs cards.json
node skills/sourcards-import/scripts/lint-cards.mjs cards.json --catalog https://sourcard.sourmonkey.xyz

# 本地媒体 → 绝对 https（默认官方 /api/media；Free 用 GitHub BYO：--provider github）
node skills/sourcards-import/scripts/upload-media.mjs cards.json --out cards.json

# 牌库漂移（仅完整导出快照）
node skills/sourcards-library-lint/scripts/lint-library.mjs snapshot.json

npm test
```

媒体托管与 SourCards 服务端**解耦**：配置 `SOURCARDS_MEDIA_*`（R2/S3、http gateway、
map 文件或 shell 命令）见 [media.md](skills/sourcards-import/references/media.md)。

## 安装

### Codex plugin（多技能首选）

把本仓库根目录（含 `.codex-plugin/plugin.json`）作为本地/个人插件或 marketplace 安装：

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

### skills-manager / 单技能 copy 安装

指向技能目录（或暴露它的 release），它会**复制**到 `~/.skills-manager/skills/<name>`：

```text
skills/sourcards-import
```

不要把目标目录反向 symlink 回本仓库——copy 工具拒绝"目标在源内部"的递归。

### 项目内 symlink（Codex / Claude）

```bash
ln -sfn /path/to/skill-flashcards/skills/sourcards-import \
  .agents/skills/sourcards-import
ln -sfn /path/to/skill-flashcards/skills/sourcards-library-lint \
  .agents/skills/sourcards-library-lint
# 兼容别名（可选）
ln -sfn /path/to/skill-flashcards/skills/sourcards-import \
  .agents/skills/fsrs-flashcards
```

### npm（可选，未发布则跳过）

```bash
npm i -g @sourcards/skill-flashcards   # when published
sourcards-lint-cards cards.json
sourcards-upload-media cards.json --out cards.json
```

## 仓库结构

```text
.codex-plugin/plugin.json      # Codex plugin 清单
lib/                           # npm 共享核心（org-lint / catalog-name / card-media-md）
skills/
  sourcards-import/            # 导入前：制卡 + JSON 校验 + 导入/回滚
  sourcards-library-lint/      # 导入后：牌库漂移审计（SoT）
examples/                      # 端到端示例：source-material.md → cards.json
package.json                   # 可选 npm 包 + bin
README.md · LICENSE
```

`lib/` 与各技能内 `lib/` 的重复是**刻意设计**：技能目录对 copy-install 自包含，
根 `lib/` 供 npm 导入（`import { lintLibraryOrganization } from '@sourcards/skill-flashcards/org-lint'`）。
改共享核心时两份都要同步。

## 与 App 的关系

- 本仓库是**外部 agent 技能**的 source of truth，**不是** App 内 Learning Coach
  （后者在 `fsrs-flashcards/packages/platform/agent`）。
- App 的 Coach 工具 `lint_cards` 复用同一个 `lintLibraryOrganization` 核心。
- App 以 **git submodule** 引用本仓库：

```text
fsrs-flashcards/
  packages/platform/skill-flashcards/   ← 本插件仓库（submodule SoT）
  .agents/skills/sourcards-import       → 上者 skills/sourcards-import
  .agents/skills/sourcards-library-lint → 上者 skills/sourcards-library-lint
```

```bash
git submodule update --init packages/platform/skill-flashcards
pnpm install
pnpm skill:check
```

## 版本

独立于 App 版本。规则或 lint 变更时，`package.json` 与 `.codex-plugin/plugin.json`
的版本号一起升。
