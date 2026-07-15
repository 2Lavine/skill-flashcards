# Media hosting (BYO CDN)

SourCards **does not host** card images or audio. Review loads media by URL from whatever origin you put in the markdown. Import is JSON-only — keep media inside `question` / `answer` as:

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

## Agent workflow

```text
1. Formulate cards.json  (may embed ./local media paths)
2. node scripts/upload-media.mjs cards.json --out cards.json
3. node scripts/lint-cards.mjs cards.json [--catalog …]
4. POST /api/import   (see api.md)
```

```bash
SKILL_ROOT="skills/sourcards-import"   # or package install path

# After configuring env (below):
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

## Providers

| Provider | When | Needs |
|----------|------|--------|
| `s3` | Cloudflare R2 / any S3-compatible store | endpoint, bucket, keys, **public base URL** |
| `http` | Your own upload gateway | `SOURCARDS_MEDIA_UPLOAD_URL` → JSON `{ "url": "https://…" }` or base URL + key |
| `map` | Manual / pre-hosted | `--map file.json` |
| `command` | GitHub+jsDelivr, `wrangler`, `rclone`, custom CLI | `SOURCARDS_MEDIA_UPLOAD_CMD` with `$FILE` `$KEY` `$CONTENT_TYPE` |

Auto-detect order when `--provider` / `SOURCARDS_MEDIA_PROVIDER` unset: `map` (if `--map`) → `s3` (if endpoint+bucket) → `http` (if upload URL) → `command` (if cmd).

## Quick start: GitHub + jsDelivr (no R2)

Use a **public** repo as the blob store; jsDelivr serves it as CDN. This is the default path when Cloudflare R2 is not enabled on the account.

1. Public media repo (example already scaffolded): [`2Lavine/sourcards-media`](https://github.com/2Lavine/sourcards-media)
2. Clone once:

```bash
git clone https://github.com/2Lavine/sourcards-media.git ~/projects/div-skill/sourcards-media
```

3. Env (shell profile or monorepo `.env.local` — never commit secrets; GitHub path needs none beyond `gh`/`git` auth):

```bash
export SOURCARDS_MEDIA_PROVIDER=command
export SOURCARDS_MEDIA_BASE_URL="https://cdn.jsdelivr.net/gh/2Lavine/sourcards-media@main"
export SOURCARDS_MEDIA_REPO_DIR="$HOME/projects/div-skill/sourcards-media"
export SOURCARDS_MEDIA_PREFIX="cards/"
# $FILE $KEY are JSON-quoted by upload-media; media-put-github expects raw args:
export SOURCARDS_MEDIA_UPLOAD_CMD="node \$SKILL_ROOT/scripts/media-put-github.mjs \$SOURCARDS_MEDIA_FILE \$SOURCARDS_MEDIA_KEY"
# or absolute path to media-put-github.mjs (recommended in .env.local)
```

`upload-media` sets `SOURCARDS_MEDIA_FILE` / `SOURCARDS_MEDIA_KEY` / `SOURCARDS_MEDIA_CONTENT_TYPE` in the child env, and also substitutes `$FILE` / `$KEY` / `$CONTENT_TYPE` into the command string as JSON-quoted paths. Prefer the env-var form so the child shell expands them after the env is populated.

4. Run:

```bash
SKILL_ROOT=skills/sourcards-import   # or .claude/skills/sourcards-import
node "$SKILL_ROOT/scripts/upload-media.mjs" cards.json --out cards.json
```

jsDelivr may take a short time to pick up a brand-new path after push; pin `@main` is fine for personal use. For cache bust after overwrite, change the content hash key (default key layout already includes sha12).

### Env reference

| Env | Role |
|-----|------|
| `SOURCARDS_MEDIA_BASE_URL` | Public origin, e.g. `https://media.example.com` (no trailing slash) |
| `SOURCARDS_MEDIA_PREFIX` | Object key prefix (default `cards/`) |
| `SOURCARDS_MEDIA_PROVIDER` | `s3` \| `http` \| `map` \| `command` |
| `SOURCARDS_MEDIA_S3_ENDPOINT` | e.g. `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `SOURCARDS_MEDIA_S3_BUCKET` | Bucket name |
| `SOURCARDS_MEDIA_S3_ACCESS_KEY_ID` | R2/S3 access key |
| `SOURCARDS_MEDIA_S3_SECRET_ACCESS_KEY` | Secret |
| `SOURCARDS_MEDIA_S3_REGION` | Default `auto` (R2) |
| `SOURCARDS_MEDIA_UPLOAD_URL` | http provider POST target |
| `SOURCARDS_MEDIA_UPLOAD_TOKEN` | Optional Bearer token for http provider |
| `SOURCARDS_MEDIA_UPLOAD_CMD` | Shell command for command provider |
| `SOURCARDS_MEDIA_REPO_DIR` | Local clone of public media repo (GitHub put helper) |
| `SOURCARDS_MEDIA_MAX_IMAGE_BYTES` | Default 8 MiB |
| `SOURCARDS_MEDIA_MAX_AUDIO_BYTES` | Default 20 MiB |

Do **not** reuse `FLASHCARD_API_KEY` as media credentials — that key is only for the SourCards import/catalog API.

### Object keys

```text
{prefix}{sha256-12}/{original-basename}
# e.g. cards/a1b2c3d4e5f6/neko.mp3
```

Content-hash prefix → immutable, CDN-cache friendly, natural dedupe.

Allowed extensions: `png jpg jpeg webp gif svg` · `mp3 wav m4a ogg aac webm`.

## Quick start: Cloudflare R2

1. Create a public-read bucket (or custom domain on the bucket).
2. Create an R2 API token with Object Read & Write.
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

- No SourCards app `/api/media` in this skill path
- Import rollback does **not** delete CDN objects
- No automatic remote→CDN re-host of already-https URLs
