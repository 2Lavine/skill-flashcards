# Media hosting

Review loads media by URL from whatever origin you put in the markdown. Import is JSON-only — keep media inside `question` / `answer` as:

```html
<audio src="https://…" controls></audio>
![alt](https://…)
```

Do **not** invent `audioUrl` / `imageUrl` fields. See [format.md](format.md).

## Absolute HTTPS rule

| Stage | Allowed src |
|-------|-------------|
| Drafting cards | Local / relative paths (`./clips/neko.mp3`) so the agent can point at files on disk |
| **Before import** | Every media `src` must be **absolute `https://…`** |

Relative, `file://`, and bare disk paths will not load in the web/desktop/mobile review hosts. `lint-cards` warns on them; `upload-media` rewrites them after upload.

Root-relative paths like `/demo/ja/neko.mp3` are **SPA demo assets only** — not a model for user content.

## Agent workflow (default = official upload)

**Auth is the same Personal Integration Token as import:** `FLASHCARD_API_KEY`
(prefix `sc_int_…`) in the environment. Check `echo "$FLASHCARD_API_KEY"` first;
if missing, user creates one in the app:
**Settings → Integrations → Personal Integration Tokens** (see [api.md](api.md)).

Official upload also needs the owner's effective entitlement `media:upload`
(Lite / Lifetime defaults, or an explicit grant) and remaining media quotas.

```text
1. Formulate cards.json  (may embed ./local media paths)
2. node scripts/upload-media.mjs cards.json --out cards.json
   → default: POST /api/media with x-api-key: $FLASHCARD_API_KEY
     (permission media:upload + entitlement media:upload)
3. node scripts/lint-cards.mjs cards.json [--catalog …]  (catalog:read)
4. POST /api/import with the same x-api-key  (imports:create; see api.md)
```

```bash
SKILL_ROOT="skills/sourcards-import"   # or package install path

# Requires FLASHCARD_API_KEY (Personal Integration Token) + media:upload entitlement
node "$SKILL_ROOT/scripts/upload-media.mjs" cards.json --out cards.json
# or: sourcards-upload-media cards.json --out cards.json
```

### Map-only (already hosted)

If files are already on a CDN, rewrite without uploading:

```bash
# media-map.json: { "./neko.mp3": "https://media.example/ja/neko.mp3" }
node scripts/upload-media.mjs cards.json \
  --provider map --map media-map.json --out cards.json
```

## Two product paths

| Path | Who | Skill |
|------|-----|--------|
| **Official** `POST /api/media` | Owner has effective `media:upload` (Lite / Lifetime defaults or explicit grant) | **Default** when `FLASHCARD_API_KEY` is set |
| **GitHub BYO** public repo + jsDelivr | Any membership (incl. Free) | `--provider github` |

Official store is SourCards R2. Schema unchanged — only URLs in markdown.
Token permission `media:upload` alone is not enough — the server also checks
the owner's entitlement and daily/total media quotas.

## Providers

| Provider | When | Needs |
|----------|------|--------|
| **`http`** (default) | Official media API | **`FLASHCARD_API_KEY`** (Personal Integration Token, same as import). Optional `SOURCARDS_MEDIA_UPLOAD_URL` (default `https://sourcard.sourmonkey.xyz/api/media`) |
| **`github`** | Free / BYO | `SOURCARDS_MEDIA_REPO_DIR` + `SOURCARDS_MEDIA_GITHUB_BASE_URL` |
| **`s3`** | Personal R2/S3 (power user) | `SOURCARDS_MEDIA_S3_*` |
| `map` / `command` | Escape hatches | see below |

### How the skill finds the Personal Integration Token

Same rules as import / catalog lint:

1. **`process.env.FLASHCARD_API_KEY`** (shell export, Claude session, monorepo `.env` / `.env.local` auto-load) — prefix `sc_int_…`
2. If missing → ask user: **Settings → Integrations → Personal Integration Tokens → Create**, store as `FLASHCARD_API_KEY`
3. Optional override token: `SOURCARDS_MEDIA_UPLOAD_TOKEN` (rarely needed)

`upload-media` also auto-loads monorepo `.env.local` / `.env` for missing keys (never overrides already-set env).

**Default auto-detect** when `SOURCARDS_MEDIA_PROVIDER` unset:

1. `FLASHCARD_API_KEY` (or upload token) → **`http`** (official)
2. else `SOURCARDS_MEDIA_REPO_DIR` → `github`
3. else full personal `S3_*` → `s3`
4. else `command` if set

```bash
# one-shot overrides
node scripts/upload-media.mjs cards.json --provider github --out cards.json
node scripts/upload-media.mjs cards.json --provider s3 --out cards.json
```

Provider-specific public bases (preferred over shared `SOURCARDS_MEDIA_BASE_URL`):

| Env | Used by |
|-----|---------|
| `SOURCARDS_MEDIA_GITHUB_BASE_URL` | `github` |
| `SOURCARDS_MEDIA_S3_BASE_URL` | `s3` |
| `SOURCARDS_MEDIA_HTTP_BASE_URL` | `http` (rarely needed; API returns full url) |
| `SOURCARDS_MEDIA_BASE_URL` | fallback for any provider |

## Quick start: GitHub + jsDelivr

1. Public media repo: [`2Lavine/sourcards-media`](https://github.com/2Lavine/sourcards-media)
2. Clone once:

```bash
git clone https://github.com/2Lavine/sourcards-media.git ~/projects/div-skill/sourcards-media
```

3. Env (monorepo `.env.local` — gitignored):

```bash
export SOURCARDS_MEDIA_PROVIDER=github
export SOURCARDS_MEDIA_GITHUB_BASE_URL="https://cdn.jsdelivr.net/gh/2Lavine/sourcards-media@main"
export SOURCARDS_MEDIA_REPO_DIR="$HOME/projects/div-skill/sourcards-media"
export SOURCARDS_MEDIA_PREFIX="cards/"
```

4. Run:

```bash
SKILL_ROOT=skills/sourcards-import
node "$SKILL_ROOT/scripts/upload-media.mjs" cards.json --out cards.json
# equivalent: --provider github
```

jsDelivr may lag briefly on brand-new paths after push. Object keys include a content hash so overwrites get new URLs.

### Env reference

| Env | Role |
|-----|------|
| `SOURCARDS_MEDIA_PROVIDER` | `github` \| `s3` \| `http` \| `map` \| `command` |
| `SOURCARDS_MEDIA_PREFIX` | Object key prefix (default `cards/`) |
| `SOURCARDS_MEDIA_BASE_URL` | Shared public origin fallback |
| **GitHub** | |
| `SOURCARDS_MEDIA_GITHUB_BASE_URL` | e.g. jsDelivr `https://cdn.jsdelivr.net/gh/user/repo@main` |
| `SOURCARDS_MEDIA_REPO_DIR` | Local clone of the public media repo |
| `SOURCARDS_MEDIA_GIT_REMOTE` / `_GIT_BRANCH` | default `origin` / `main` |
| `SOURCARDS_MEDIA_NO_PUSH` | `1` = commit only (tests) |
| **S3 / R2** | |
| `SOURCARDS_MEDIA_S3_BASE_URL` | Public CDN origin for objects |
| `SOURCARDS_MEDIA_S3_ENDPOINT` | e.g. `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `SOURCARDS_MEDIA_S3_BUCKET` | Bucket name |
| `SOURCARDS_MEDIA_S3_ACCESS_KEY_ID` | R2/S3 access key |
| `SOURCARDS_MEDIA_S3_SECRET_ACCESS_KEY` | Secret |
| `SOURCARDS_MEDIA_S3_REGION` | Default `auto` (R2) |
| **http / command** | |
| `SOURCARDS_MEDIA_UPLOAD_URL` | http provider POST target |
| `SOURCARDS_MEDIA_UPLOAD_TOKEN` | Optional Bearer token |
| `SOURCARDS_MEDIA_HTTP_BASE_URL` | Public origin if response has no `url` |
| `SOURCARDS_MEDIA_UPLOAD_CMD` | Shell command for `command` provider |
| `SOURCARDS_MEDIA_MAX_IMAGE_BYTES` | Default 8 MiB |
| `SOURCARDS_MEDIA_MAX_AUDIO_BYTES` | Default 20 MiB |

**Official media reuses the Personal Integration Token (`FLASHCARD_API_KEY`)**
(same as import; requires `media:upload` permission + entitlement). Personal
S3/GitHub BYO uses their own env vars, not that token.

### Object keys

```text
{prefix}{sha256-12}/{original-basename}
# e.g. cards/a1b2c3d4e5f6/neko.mp3
```

Content-hash prefix → immutable, CDN-cache friendly, natural dedupe.

Allowed extensions: `png jpg jpeg webp gif svg` · `mp3 wav m4a ogg aac webm`.

## Quick start: Cloudflare R2 (keep GitHub config; switch provider)

When the CF account has R2 enabled (Dashboard → R2 → enable if you see API code 10042):

1. Create a public-read bucket (or custom domain / r2.dev on the bucket).
2. Create an R2 API token with Object Read & Write.
3. Fill `SOURCARDS_MEDIA_S3_*` + `SOURCARDS_MEDIA_S3_BASE_URL` in `.env.local` (leave GitHub vars in place).
4. Switch:

```bash
export SOURCARDS_MEDIA_PROVIDER=s3
# or: --provider s3
```

### R2 env block (template)

```bash
export SOURCARDS_MEDIA_PROVIDER=s3
export SOURCARDS_MEDIA_S3_BASE_URL="https://media.yourdomain.com"
export SOURCARDS_MEDIA_S3_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
export SOURCARDS_MEDIA_S3_BUCKET="sourcards-media"
export SOURCARDS_MEDIA_S3_REGION="auto"
export SOURCARDS_MEDIA_S3_ACCESS_KEY_ID="…"
export SOURCARDS_MEDIA_S3_SECRET_ACCESS_KEY="…"
```
3. Export:

```bash
export SOURCARDS_MEDIA_PROVIDER=s3
export SOURCARDS_MEDIA_BASE_URL="https://media.yourdomain.com"
export SOURCARDS_MEDIA_S3_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
export SOURCARDS_MEDIA_S3_BUCKET="sourcards-media"
export SOURCARDS_MEDIA_S3_ACCESS_KEY_ID="…"
export SOURCARDS_MEDIA_S3_SECRET_ACCESS_KEY="…"
export SOURCARDS_MEDIA_S3_REGION="auto"
```

4. Put a test object, open `$SOURCARDS_MEDIA_BASE_URL/...` in a browser.
5. Run `upload-media.mjs` on a cards.json that references a local mp3/png.

### command provider + wrangler example

```bash
export SOURCARDS_MEDIA_PROVIDER=command
export SOURCARDS_MEDIA_BASE_URL="https://media.yourdomain.com"
export SOURCARDS_MEDIA_UPLOAD_CMD='npx wrangler r2 object put sourcards-media/$KEY --file=$FILE --content-type=$CONTENT_TYPE'
```

(`$FILE` / `$KEY` / `$CONTENT_TYPE` are substituted as JSON-quoted strings by the script.)

## CLI flags

```text
upload-media.mjs [cards.json] [--out file|-] [--provider name]
  [--map file] [--root dir|auto] [--dry-run] [--json]
```

| Exit | Meaning |
|------|---------|
| 0 | Success (including dry-run / nothing to upload) |
| 1 | Upload/IO failure or unresolved local media |
| 2 | Bad usage / empty input |

## Failures to expect

| Symptom | Likely cause |
|---------|----------------|
| Review: broken image / silent audio | Non-https or dead URL; re-lint for local srcs |
| 403 from CDN | Hotlink protection / private bucket — allow public GET or open CORS if you later canvas-read |
| Wrong player type | Missing/incorrect `Content-Type` on upload |
| `no provider configured` | Set `SOURCARDS_MEDIA_*` or use `--provider map` |

## Non-goals

- No binary media inside `POST /api/import`; official uploads use the separate `POST /api/media` route
- Import rollback does **not** delete CDN objects
- No automatic remote→CDN re-host of already-https URLs
