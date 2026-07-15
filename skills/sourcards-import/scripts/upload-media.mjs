#!/usr/bin/env node
/**
 * Upload local media referenced in a cards.json payload and rewrite markdown
 * srcs to absolute HTTPS URLs (BYO CDN — decoupled from SourCards app server).
 *
 * Usage:
 *   node upload-media.mjs cards.json --out cards.media.json
 *   node upload-media.mjs cards.json --provider map --map media-map.json --out out.json
 *   node upload-media.mjs cards.json --dry-run
 *   cat cards.json | node upload-media.mjs --out -
 *
 * Providers: s3 (R2/S3 SigV4), http (POST multipart), map (JSON rewrite only),
 *            command (shell $FILE $KEY $CONTENT_TYPE).
 *
 * Exit: 0 success, 1 upload/IO/unresolved local media, 2 bad usage.
 */

import { createHash, createHmac } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  classifyMediaSrc,
  extractPayloadMediaSrcs,
  isPublicHttpsMediaSrc,
  needsMediaUpload,
  rewritePayloadMedia,
} from '../../../lib/card-media-md.mjs';
import { putGithubMedia } from './media-put-github.mjs';

// ---- args --------------------------------------------------------------------

const argv = process.argv.slice(2);
let inputFile = null;
let outFile = null;
let provider = null;
let mapFile = null;
let rootOpt = null; // null | path | 'auto'
let dryRun = false;
let jsonOut = false;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out') outFile = argv[++i];
  else if (a.startsWith('--out=')) outFile = a.slice('--out='.length);
  else if (a === '--provider') provider = argv[++i];
  else if (a.startsWith('--provider=')) provider = a.slice('--provider='.length);
  else if (a === '--map') mapFile = argv[++i];
  else if (a.startsWith('--map=')) mapFile = a.slice('--map='.length);
  else if (a === '--root') rootOpt = argv[++i];
  else if (a.startsWith('--root=')) rootOpt = a.slice('--root='.length);
  else if (a === '--dry-run') dryRun = true;
  else if (a === '--json') jsonOut = true;
  else if (a === '-h' || a === '--help') {
    printHelp();
    process.exit(0);
  } else if (!a.startsWith('-')) {
    inputFile = a;
  } else {
    console.error(`Unknown flag: ${a}`);
    process.exit(2);
  }
}

function printHelp() {
  console.log(`Usage: upload-media.mjs [cards.json] [options]

Rewrite local media paths in card markdown to absolute HTTPS via a BYO CDN.

Options:
  --out <file|->     Write rewritten JSON (default: stdout if dry-run else required)
  --provider <name>  github | s3 | http | map | command  (or $SOURCARDS_MEDIA_PROVIDER)
  --map <file>       JSON map { "local/path": "https://..." } (map provider / override)
  --root <dir|auto>  Resolve relative paths (default: cwd; auto = cards.json dir)
  --dry-run          Plan only; do not upload or write unless --out set
  --json             Machine-readable summary on stdout

Providers (both can stay configured; switch with --provider / SOURCARDS_MEDIA_PROVIDER):
  github  public git repo + jsDelivr (SOURCARDS_MEDIA_REPO_DIR + _GITHUB_BASE_URL)
  s3      R2/S3 SigV4 (SOURCARDS_MEDIA_S3_* + _S3_BASE_URL)
  http    POST multipart to your gateway
  map     rewrite only from --map file
  command shell $FILE $KEY via SOURCARDS_MEDIA_UPLOAD_CMD

Env: see references/media.md (SOURCARDS_MEDIA_*).`);
}

// ---- read payload ------------------------------------------------------------

let raw;
try {
  raw = inputFile
    ? readFileSync(inputFile, 'utf8')
    : readFileSync(0, 'utf8');
} catch (e) {
  console.error(`Cannot read input: ${e.message}`);
  process.exit(2);
}

if (!raw || !raw.trim()) {
  console.error('Empty input. Pass cards.json or pipe JSON on stdin.');
  process.exit(2);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch (e) {
  console.error(`JSON.parse failed: ${e.message}`);
  process.exit(1);
}

if (!payload || typeof payload !== 'object' || !Array.isArray(payload.cards)) {
  console.error('Payload must be an object with a "cards" array.');
  process.exit(1);
}

const resolveRoot = (() => {
  if (rootOpt === 'auto') {
    return inputFile ? dirname(resolve(inputFile)) : process.cwd();
  }
  if (rootOpt) return resolve(rootOpt);
  return process.cwd();
})();

// ---- content types / limits --------------------------------------------------

const EXT_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  webm: 'audio/webm',
};

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'aac', 'webm']);

function maxBytesForExt(ext) {
  const imgMax = Number(process.env.SOURCARDS_MEDIA_MAX_IMAGE_BYTES || 8 * 1024 * 1024);
  const audMax = Number(process.env.SOURCARDS_MEDIA_MAX_AUDIO_BYTES || 20 * 1024 * 1024);
  if (IMAGE_EXTS.has(ext)) return imgMax;
  if (AUDIO_EXTS.has(ext)) return audMax;
  return Math.min(imgMax, audMax);
}

function extOf(filePath) {
  const base = basename(filePath);
  const i = base.lastIndexOf('.');
  if (i < 0) return '';
  return base.slice(i + 1).toLowerCase();
}

// ---- path resolve ------------------------------------------------------------

function expandHome(p) {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  if (p === '~') return homedir();
  return p;
}

/**
 * Turn a media src that needs upload into an absolute local filesystem path.
 * @returns {{ ok: true, path: string } | { ok: false, reason: string }}
 */
function resolveLocalPath(src) {
  let s = src.trim();
  if (s.startsWith('file://')) {
    try {
      s = fileURLToPath(s);
    } catch {
      return { ok: false, reason: `invalid file:// URL: ${src}` };
    }
  }
  s = expandHome(s);
  const abs = isAbsolute(s) ? s : resolve(resolveRoot, s);
  if (!existsSync(abs)) {
    return { ok: false, reason: `file not found: ${abs} (src ${JSON.stringify(src)})` };
  }
  let st;
  try {
    st = statSync(abs);
  } catch (e) {
    return { ok: false, reason: `stat failed: ${e.message}` };
  }
  if (!st.isFile()) {
    return { ok: false, reason: `not a file: ${abs}` };
  }
  return { ok: true, path: abs };
}

function publicUrlForKey(key, baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/${key.replace(/^\/+/, '')}`;
}

function objectKeyForFile(filePath, body) {
  const prefix = process.env.SOURCARDS_MEDIA_PREFIX ?? 'cards/';
  const normalizedPrefix = prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix;
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
  const name = basename(filePath).replace(/[^\w.\-()+@]/g, '_');
  return `${normalizedPrefix}${hash}/${name || 'media.bin'}`;
}

// ---- providers ---------------------------------------------------------------

function detectProvider() {
  if (provider) return provider.toLowerCase();
  if (process.env.SOURCARDS_MEDIA_PROVIDER) {
    return process.env.SOURCARDS_MEDIA_PROVIDER.toLowerCase();
  }
  if (mapFile) return 'map';
  // Prefer github when a media repo clone is configured (default personal path).
  if (process.env.SOURCARDS_MEDIA_REPO_DIR) return 'github';
  if (process.env.SOURCARDS_MEDIA_S3_ENDPOINT && process.env.SOURCARDS_MEDIA_S3_BUCKET) {
    return 's3';
  }
  if (process.env.SOURCARDS_MEDIA_UPLOAD_URL) return 'http';
  if (process.env.SOURCARDS_MEDIA_UPLOAD_CMD) return 'command';
  return null;
}

/**
 * Provider-specific public base URL, falling back to SOURCARDS_MEDIA_BASE_URL.
 * Keeps github + s3 configs side-by-side without overwriting each other.
 */
function resolveMediaBaseUrl(providerName) {
  const shared = (process.env.SOURCARDS_MEDIA_BASE_URL || '').replace(/\/+$/, '');
  if (providerName === 'github') {
    return (
      (process.env.SOURCARDS_MEDIA_GITHUB_BASE_URL || '').replace(/\/+$/, '') ||
      shared
    );
  }
  if (providerName === 's3') {
    return (
      (process.env.SOURCARDS_MEDIA_S3_BASE_URL || '').replace(/\/+$/, '') || shared
    );
  }
  if (providerName === 'http') {
    return (
      (process.env.SOURCARDS_MEDIA_HTTP_BASE_URL || '').replace(/\/+$/, '') ||
      shared
    );
  }
  return shared;
}

/** Apply resolved base URL into env for providers that read SOURCARDS_MEDIA_BASE_URL. */
function applyProviderBaseUrl(providerName) {
  const base = resolveMediaBaseUrl(providerName);
  if (base) process.env.SOURCARDS_MEDIA_BASE_URL = base;
  return base;
}

function loadMapFile(path) {
  const text = readFileSync(path, 'utf8');
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('map file must be a JSON object of localPath → https URL');
  }
  return obj;
}

/** map provider: only rewrite using provided JSON map (keys match src strings as written). */
async function uploadMap(src, _localPath, _body, _contentType, _key) {
  if (!mapFile) {
    throw new Error('map provider requires --map <file>');
  }
  const m = loadMapFile(mapFile);
  // Try exact src, then basename-ish variants
  if (m[src]) return m[src];
  const keys = Object.keys(m);
  const hit = keys.find((k) => k === src || resolve(resolveRoot, k) === resolve(resolveRoot, src));
  if (hit) return m[hit];
  throw new Error(`map has no entry for ${JSON.stringify(src)}`);
}

async function uploadHttp(src, localPath, body, contentType, key) {
  const url = process.env.SOURCARDS_MEDIA_UPLOAD_URL;
  if (!url) throw new Error('SOURCARDS_MEDIA_UPLOAD_URL required for http provider');
  const token = process.env.SOURCARDS_MEDIA_UPLOAD_TOKEN || '';
  const baseUrl = process.env.SOURCARDS_MEDIA_BASE_URL || '';

  // multipart form: file + key + contentType
  const boundary = `----sourcards${Date.now().toString(16)}`;
  const filename = basename(localPath);
  const chunks = [];
  const push = (s) => chunks.push(typeof s === 'string' ? Buffer.from(s) : s);
  push(`--${boundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\n${key}\r\n`);
  push(`--${boundary}\r\nContent-Disposition: form-data; name="contentType"\r\n\r\n${contentType}\r\n`);
  push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  push(body);
  push(`\r\n--${boundary}--\r\n`);
  const formBody = Buffer.concat(chunks);

  const headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': String(formBody.length),
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(url, { method: 'POST', headers, body: formBody });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`http upload ${res.status}: ${text.slice(0, 200)}`);
  }
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (data && typeof data.url === 'string' && /^https?:\/\//i.test(data.url)) {
    return data.url;
  }
  const built = publicUrlForKey(key, baseUrl);
  if (built) return built;
  throw new Error('http upload succeeded but response has no url and SOURCARDS_MEDIA_BASE_URL is unset');
}

async function uploadCommand(src, localPath, body, contentType, key) {
  const tmpl = process.env.SOURCARDS_MEDIA_UPLOAD_CMD;
  if (!tmpl) throw new Error('SOURCARDS_MEDIA_UPLOAD_CMD required for command provider');
  const baseUrl = process.env.SOURCARDS_MEDIA_BASE_URL || '';
  // Substitute without shell-quoting hell: pass via env + simple replace for display.
  const env = {
    ...process.env,
    SOURCARDS_MEDIA_FILE: localPath,
    SOURCARDS_MEDIA_KEY: key,
    SOURCARDS_MEDIA_CONTENT_TYPE: contentType,
  };
  // Prefer $SOURCARDS_MEDIA_FILE / _KEY / _CONTENT_TYPE in the command template
  // (set in env below) so paths with spaces are not double-quoted incorrectly.
  // Legacy $FILE / $KEY / $CONTENT_TYPE are still substituted as JSON strings.
  const cmd = tmpl
    .replaceAll('$FILE', JSON.stringify(localPath))
    .replaceAll('$KEY', JSON.stringify(key))
    .replaceAll('$CONTENT_TYPE', JSON.stringify(contentType));
  const r = spawnSync(cmd, {
    shell: true,
    env,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`command upload failed (exit ${r.status}): ${(r.stderr || r.stdout || '').slice(0, 400)}`);
  }
  // Prefer last https URL printed by the command
  const combined = `${r.stdout || ''}\n${r.stderr || ''}`;
  const urls = combined.match(/https:\/\/[^\s"'<>]+/g);
  if (urls && urls.length) return urls[urls.length - 1];
  const built = publicUrlForKey(key, baseUrl);
  if (built) return built;
  throw new Error('command produced no https URL and SOURCARDS_MEDIA_BASE_URL is unset');
}

/** First-class GitHub + jsDelivr (same as media-put-github.mjs). */
async function uploadGithub(src, localPath, body, contentType, key) {
  return putGithubMedia({
    file: localPath,
    key,
    env: process.env,
  });
}

// Minimal AWS SigV4 for S3 PutObject (path-style for R2 compatibility).
async function uploadS3(src, localPath, body, contentType, key) {
  const endpoint = (process.env.SOURCARDS_MEDIA_S3_ENDPOINT || '').replace(/\/+$/, '');
  const bucket = process.env.SOURCARDS_MEDIA_S3_BUCKET || '';
  const accessKey = process.env.SOURCARDS_MEDIA_S3_ACCESS_KEY_ID || '';
  const secretKey = process.env.SOURCARDS_MEDIA_S3_SECRET_ACCESS_KEY || '';
  const region = process.env.SOURCARDS_MEDIA_S3_REGION || 'auto';
  const baseUrl = process.env.SOURCARDS_MEDIA_BASE_URL || '';

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new Error(
      's3 provider needs SOURCARDS_MEDIA_S3_ENDPOINT, _BUCKET, _ACCESS_KEY_ID, _SECRET_ACCESS_KEY',
    );
  }

  const host = new URL(endpoint).host;
  // Path-style: https://endpoint/bucket/key
  const canonicalUri = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const url = `${endpoint}${canonicalUri}`;

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash('sha256').update(body).digest('hex');

  const headers = {
    host,
    'content-type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  const signedHeaderKeys = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const signedHeaders = signedHeaderKeys.join(';');
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join('');
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  function hmac(key, data) {
    return createHmac('sha256', key).update(data).digest();
  }
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization =
    `${algorithm} Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      authorization,
      'content-length': String(body.length),
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`s3 PUT ${res.status}: ${t.slice(0, 300)}`);
  }

  const built = publicUrlForKey(key, baseUrl);
  if (built) return built;
  // Fallback: endpoint/bucket/key (often private; warn user to set BASE_URL)
  return `${endpoint}/${bucket}/${key}`;
}

async function runProvider(name, src, localPath, body, contentType, key) {
  switch (name) {
    case 'map':
      return uploadMap(src, localPath, body, contentType, key);
    case 'http':
      return uploadHttp(src, localPath, body, contentType, key);
    case 'command':
      return uploadCommand(src, localPath, body, contentType, key);
    case 'github':
      return uploadGithub(src, localPath, body, contentType, key);
    case 's3':
      return uploadS3(src, localPath, body, contentType, key);
    default:
      throw new Error(`unknown provider: ${name}`);
  }
}

// ---- main --------------------------------------------------------------------

const allSrcs = extractPayloadMediaSrcs(payload);
const rewriteMap = new Map();
const summary = {
  skippedHttps: 0,
  skippedRemote: 0,
  skippedRootRelative: 0,
  uploaded: 0,
  planned: 0,
  errors: [],
  map: {},
};

const toUpload = [];
for (const src of allSrcs) {
  const kind = classifyMediaSrc(src);
  if (kind === 'https') {
    summary.skippedHttps++;
    continue;
  }
  if (kind === 'http' || kind === 'data') {
    summary.skippedRemote++;
    continue;
  }
  if (kind === 'root-relative') {
    summary.skippedRootRelative++;
    continue;
  }
  if (!needsMediaUpload(src)) continue;
  toUpload.push(src);
}

const providerName = detectProvider();
if (providerName) applyProviderBaseUrl(providerName);

if (toUpload.length === 0) {
  // Nothing to do — still write through if --out requested
  if (!jsonOut) {
    console.error(`✓ no local media to upload (${summary.skippedHttps} https, ${summary.skippedRemote} remote/data, ${summary.skippedRootRelative} root-relative).`);
  }
} else {
  if (!providerName && !dryRun) {
    console.error(
      `Found ${toUpload.length} local media src(s) but no provider configured.\n` +
        `Set SOURCARDS_MEDIA_PROVIDER (github|s3|http|map|command) and related env, or pass --provider map --map file.json.\n` +
        `See references/media.md.`,
    );
    for (const s of toUpload) console.error(`  - ${s}`);
    process.exit(1);
  }
  if (!providerName && dryRun) {
    if (!jsonOut) {
      console.error(`dry-run: would need a provider for ${toUpload.length} local src(s):`);
      for (const s of toUpload) console.error(`  - ${s}`);
    }
    summary.planned = toUpload.length;
  } else {
    for (const src of toUpload) {
      try {
        // map provider: rewrite from JSON only; local file optional.
        if (providerName === 'map' && !dryRun) {
          const url = await uploadMap(src, '', Buffer.alloc(0), '', '');
          if (!/^https?:\/\//i.test(url)) {
            summary.errors.push(`${src}: map value is not a URL: ${JSON.stringify(url)}`);
            continue;
          }
          rewriteMap.set(src, url);
          summary.map[src] = url;
          summary.uploaded++;
          if (!jsonOut) console.error(`✓ ${src} → ${url}`);
          continue;
        }

        const resolved = resolveLocalPath(src);
        if (!resolved.ok) {
          summary.errors.push(resolved.reason);
          continue;
        }
        const ext = extOf(resolved.path);
        if (!EXT_MIME[ext]) {
          summary.errors.push(`unsupported extension .${ext || '?'} for ${src}`);
          continue;
        }
        const contentType = EXT_MIME[ext];
        const body = readFileSync(resolved.path);
        const max = maxBytesForExt(ext);
        if (body.length > max) {
          summary.errors.push(
            `${src}: ${body.length} bytes exceeds max ${max} for .${ext}`,
          );
          continue;
        }
        const key = objectKeyForFile(resolved.path, body);

        if (dryRun) {
          const baseUrl = process.env.SOURCARDS_MEDIA_BASE_URL || '';
          const plannedUrl =
            publicUrlForKey(key, baseUrl) || `https://example.invalid/${key}`;
          rewriteMap.set(src, plannedUrl);
          summary.map[src] = plannedUrl;
          summary.planned++;
          if (!jsonOut) console.error(`plan  ${src} → ${plannedUrl}`);
          continue;
        }

        const url = await runProvider(
          providerName,
          src,
          resolved.path,
          body,
          contentType,
          key,
        );
        if (!isPublicHttpsMediaSrc(url) && !/^https?:\/\//i.test(url)) {
          summary.errors.push(`${src}: provider returned non-URL ${JSON.stringify(url)}`);
          continue;
        }
        if (!isPublicHttpsMediaSrc(url)) {
          if (!jsonOut) console.error(`⚠ ${src}: non-https URL ${url}`);
        }
        rewriteMap.set(src, url);
        summary.map[src] = url;
        summary.uploaded++;
        if (!jsonOut) console.error(`✓ ${src} → ${url}`);
      } catch (e) {
        summary.errors.push(`${src}: ${e.message || e}`);
      }
    }
  }
}

if (summary.errors.length) {
  for (const e of summary.errors) console.error(`✗ ${e}`);
  process.exit(1);
}

const nextPayload =
  rewriteMap.size > 0 ? rewritePayloadMedia(payload, rewriteMap) : payload;
const outText = `${JSON.stringify(nextPayload, null, 2)}\n`;

// Payload write: --out file / --out - ; default stdout when rewrites happened and not --json.
// --json always owns stdout for the machine summary (payload only via real --out path).
if (outFile && outFile !== '-') {
  writeFileSync(outFile, outText, 'utf8');
  if (!jsonOut) console.error(`wrote ${outFile}`);
} else if (outFile === '-' && !jsonOut) {
  process.stdout.write(outText);
} else if (!outFile && !jsonOut && !dryRun && rewriteMap.size > 0) {
  process.stdout.write(outText);
}

if (jsonOut) {
  console.log(
    JSON.stringify(
      {
        provider: providerName,
        dryRun,
        uploaded: summary.uploaded,
        planned: summary.planned,
        skippedHttps: summary.skippedHttps,
        skippedRemote: summary.skippedRemote,
        skippedRootRelative: summary.skippedRootRelative,
        map: summary.map,
      },
      null,
      2,
    ),
  );
} else {
  console.error(
    `done: uploaded=${summary.uploaded} planned=${summary.planned} ` +
      `https=${summary.skippedHttps} remote=${summary.skippedRemote} rootRel=${summary.skippedRootRelative}`,
  );
}

process.exit(0);
