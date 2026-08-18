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

## Agent workflow (default = your own image host)

The `http` provider posts to **your** configured upload endpoint — no official
upload URL is hard-coded. Configure it one of three ways:

1. **Config file (recommended):** copy `media.config.example.json` → `media.config.json`
   (gitignored), fill in your gateway, and pass `--config media.config.json`
   (or `$SOURCARDS_MEDIA_CONFIG`, or let the script auto-discover `media.config.json`
   from the script dir / cwd).
2. **Env vars:** `SOURCARDS_MEDIA_UPLOAD_URL` (+ optional `SOURCARDS_MEDIA_UPLOAD_TOKEN`,
   `SOURCARDS_MEDIA_HTTP_BASE_URL`).
3. **BYO repo / bucket without any upload endpoint:** `--provider github` (public repo
   + jsDelivr) or `--provider s3`.

```text
1. Formulate cards.json  (may embed ./local media paths)
2. node scripts/upload-media.mjs cards.json --config media.config.json --out cards.json
   → posts to YOUR uploadUrl with YOUR token
3. node scripts/lint-cards.mjs cards.json [--catalog …]  (catalog:read)
4. POST /api/import with the same x-api-key  (imports:create; see api.md)
```

```bash
SKILL_ROOT="skills/sourcards-import"   # or package install path

# http → your configured endpoint
node "$SKILL_ROOT/scripts/upload-media.mjs" cards.json \
  --config media.config.json --out cards.json
# or: sourcards-upload-media cards.json --config media.config.json --out cards.json

# GitHub BYO (no upload endpoint needed):
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
| **Your own gateway** (configured `http` endpoint) | Anyone with an upload endpoint | **Default** when `SOURCARDS_MEDIA_UPLOAD_URL` / config is set |
| **GitHub BYO** public repo + jsDelivr | Any membership (incl. Free) | `--provider github` |
| **S3/R2** | Personal bucket | `--provider s3` |

The platform's own `/api/media` is a **maintainer-only** endpoint (not available
to regular users) — regular imports host media on their own CDN. Schema stays
unchanged: only URLs in markdown.

## Providers

| Provider | When | Needs |
|----------|------|--------|
| **`http`** (default) | Your own upload gateway | `SOURCARDS_MEDIA_UPLOAD_URL` (via env or `media.config.json`) |
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

`upload-media` also auto-loads monorepo `.env.local` / `.env` for missing keys (never overrides already-set env).

**Default auto-detect** when `SOURCARDS_MEDIA_PROVIDER` unset:

1. `SOURCARDS_MEDIA_UPLOAD_URL` (or `SOURCARDS_MEDIA_UPLOAD_TOKEN`) → **`http`**
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
| `SOURCARDS_MEDIA_UPLOAD_URL` | http provider POST target (your gateway — required for `http`) |
| `SOURCARDS_MEDIA_UPLOAD_TOKEN` | Optional Bearer token for your gateway |
| `SOURCARDS_MEDIA_HTTP_BASE_URL` | Public origin if response has no `url` |
| `SOURCARDS_MEDIA_UPLOAD_CMD` | Shell command for `command` provider |
| `SOURCARDS_MEDIA_MAX_IMAGE_BYTES` | Default 8 MiB |
| `SOURCARDS_MEDIA_MAX_AUDIO_BYTES` | Default 20 MiB |

**The `http` provider uses your configured upload URL/token** — never a
hard-coded official endpoint. GitHub/S3 BYO use their own env vars, not that token.

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
| `no provider configured` | Set `SOURCARDS_MEDIA_*` or use `--provider map` |

## Non-goals

- No binary media inside `POST /api/import`; official uploads use the separate `POST /api/media` route
- Import rollback does **not** delete CDN objects
- No automatic remote→CDN re-host of already-https URLs
