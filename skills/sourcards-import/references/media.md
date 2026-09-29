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
| Drafting cards | Local / relative paths (`./clips/sample.mp3`) so the agent can point at files on disk |
| **Before import** | Every media `src` must be **absolute `https://…`** |

Relative, `file://`, and bare disk paths will not load in the web/desktop/mobile review hosts. `lint-cards` warns on them; `upload-media` rewrites them after upload.

Root-relative paths like `/demo/media/sample-a.mp3` are **SPA demo assets only** — not a model for user content.

## Agent workflow

Default when `FLASHCARD_API_KEY` is set and no BYO host is configured:
`upload-media` POSTs to `https://sourcard.sourmonkey.xyz/api/media` with that
token (`SOURCARDS_API_BASE_URL` / `FLASHCARD_API_BASE` override the origin).
Lite / Lifetime. Free receives 403 — then `--provider github`.

If the JSON has no local/relative image or audio, do not run `upload-media`.

Override the official endpoint in one of three ways:

1. **Config file:** copy `media.config.example.json` → `media.config.json`
   (gitignored), fill in your gateway, and pass `--config media.config.json`
   (or `$SOURCARDS_MEDIA_CONFIG`, or let the script auto-discover `media.config.json`
   from the script dir / cwd).
2. **Env vars:** `SOURCARDS_MEDIA_UPLOAD_URL` (+ optional `SOURCARDS_MEDIA_UPLOAD_TOKEN`,
   `SOURCARDS_MEDIA_HTTP_BASE_URL`). A set URL wins over the official default.
3. **BYO repo / bucket:** `--provider github` (public repo + jsDelivr) or `--provider s3`.
   A configured repo or full S3 env also wins over the official default.

```text
1. Formulate cards.json  (may embed ./local media paths)
2. node scripts/upload-media.mjs cards.json --config media.config.json --out cards.json
   → posts to YOUR uploadUrl with YOUR token
3. node scripts/lint-cards.mjs cards.json [--catalog …]  (catalog:read)
4. POST /api/import with the same x-api-key  (imports:create; see api.md)
```

```bash
# SKILL_ROOT = directory of sourcards-import/SKILL.md (see that file's resolver)

# official /api/media when FLASHCARD_API_KEY is set
node "$SKILL_ROOT/scripts/upload-media.mjs" cards.json --out cards.json

# your own gateway
node "$SKILL_ROOT/scripts/upload-media.mjs" cards.json \
  --config media.config.json --out cards.json

# GitHub BYO (Free, or 403 from /api/media):
# node "$SKILL_ROOT/scripts/upload-media.mjs" cards.json --provider github --out cards.json
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
| **Official `/api/media`** | Lite / Lifetime, token has `media:upload` | **Default** when `FLASHCARD_API_KEY` is set and no BYO host is configured |
| **Your own gateway** | Anyone with an upload endpoint | `SOURCARDS_MEDIA_UPLOAD_URL` or `media.config.json` |
| **GitHub BYO** public repo + jsDelivr | Any membership, including Free | `--provider github` |
| **S3/R2** | Personal bucket | `--provider s3` |

Schema stays unchanged: only URLs in markdown. Official upload is
`POST https://sourcard.sourmonkey.xyz/api/media` with the same
`x-api-key` as import. 403 `media_upload_required` means this account cannot
use that route — switch to `--provider github`.

## Providers

| Provider | When | Needs |
|----------|------|--------|
| **`http`** (default) | Official `/api/media`, or your gateway if `SOURCARDS_MEDIA_UPLOAD_URL` is set | `FLASHCARD_API_KEY`, or an explicit upload URL |
| **`github`** | Free / BYO | `SOURCARDS_MEDIA_REPO_DIR` + `SOURCARDS_MEDIA_GITHUB_BASE_URL` |
| **`s3`** | Personal R2/S3 (power user) | `SOURCARDS_MEDIA_S3_*` |
| `map` / `command` | Escape hatches | see below |

### media.config.json (user-owned)

`upload-media` accepts a config file for your own gateway. Template:
[`media.config.example.json`](../../media.config.example.json) — copy to
`media.config.json` (gitignored) and fill in.

```json
{
  "provider": "http",
  "http": {
    "uploadUrl": "https://your-gateway.example.com/api/media",
    "token": "your-secret-token",
    "baseUrl": "https://cdn.example.com"
  }
}
```

Resolution order for `--config`: explicit flag > `$SOURCARDS_MEDIA_CONFIG` >
auto-discovered `media.config.json` (script dir, then cwd walk-up). Values fill
missing env keys only — explicit env vars and `--provider` always win.

`upload-media` also auto-loads this skill folder's `.env.local` / `.env`, then walk-up files, for missing keys (never overrides already-set env).

**Default auto-detect** when `SOURCARDS_MEDIA_PROVIDER` unset:

1. `SOURCARDS_MEDIA_UPLOAD_URL` (or `SOURCARDS_MEDIA_UPLOAD_TOKEN`) → **`http`**
2. else `SOURCARDS_MEDIA_REPO_DIR` → `github`
3. else full personal `S3_*` → `s3`
4. else `command` if set
5. else `FLASHCARD_API_KEY` → **`http`** to `{API origin}/api/media` (`https://sourcard.sourmonkey.xyz` unless `SOURCARDS_API_BASE_URL` / `FLASHCARD_API_BASE` is set)

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
node "$SKILL_ROOT/scripts/upload-media.mjs" cards.json --provider github --out cards.json
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
| `SOURCARDS_MEDIA_UPLOAD_URL` | http POST target. Unset + `FLASHCARD_API_KEY` → official `/api/media` |
| `SOURCARDS_MEDIA_UPLOAD_TOKEN` | Optional Bearer token for your gateway |
| `SOURCARDS_MEDIA_HTTP_BASE_URL` | Public origin if response has no `url` |
| `SOURCARDS_MEDIA_UPLOAD_CMD` | Shell command for `command` provider |
| `SOURCARDS_MEDIA_MAX_IMAGE_BYTES` | Default 8 MiB |
| `SOURCARDS_MEDIA_MAX_AUDIO_BYTES` | Default 20 MiB |

**Official http target** is `https://sourcard.sourmonkey.xyz/api/media` with
`FLASHCARD_API_KEY`, unless `SOURCARDS_MEDIA_UPLOAD_URL` or a BYO provider is set.
GitHub/S3 keep their own env vars.

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
upload-media.mjs [cards.json] [--out file|-] [--config file] [--provider name]
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
| `no provider configured` | No `FLASHCARD_API_KEY` and no BYO host. Run `login.mjs --check`, or `--provider github`. If the JSON has no local media, skip `upload-media` |

## Non-goals

- No binary media inside `POST /api/import`; official uploads use the separate `POST /api/media` route
- Import rollback does **not** delete CDN objects
- No automatic remote→CDN re-host of already-https URLs
