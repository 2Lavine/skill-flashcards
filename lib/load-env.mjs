/**
 * Personal overlay env loader for skill scripts.
 *
 * Resolution (first existing key wins; files never override process.env):
 *   1. keys already in `env` (shell export, Claude session, CI)
 *   2. skill-folder `.env.local` then `.env` (parent of `scripts/`)
 *   3. walk-up `.env.local` / `.env` from cwd, then from the script dir
 *
 * Secrets stay in gitignored overlay files — never committed into the skill pack.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const FLASHCARD_API_KEY = 'FLASHCARD_API_KEY';
const SKILL_OVERLAY = '.env.local';

/**
 * Minimal dotenv. Does not override keys already present in `env`
 * (including an explicit empty string).
 * @param {string} filePath
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ file: string, set: string[] } | null}
 */
export function loadEnvFile(filePath, env = process.env) {
  if (!filePath || !existsSync(filePath)) return null;
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  const set = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (Object.prototype.hasOwnProperty.call(env, key)) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
    set.push(key);
  }
  return { file: filePath, set };
}

export function walkUpFind(startDir, names) {
  let dir = resolve(startDir);
  for (let i = 0; i < 12; i++) {
    for (const name of names) {
      const p = join(dir, name);
      if (existsSync(p)) return p;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function shouldSkip(env) {
  return (
    env.SOURCARDS_SKIP_ENV_FILE === '1' ||
    env.SOURCARDS_API_SKIP_ENV_FILE === '1' ||
    env.SOURCARDS_MEDIA_SKIP_ENV_FILE === '1'
  );
}

/**
 * Ordered unique env files: skill overlay first, then cwd/script ancestors.
 * @param {string} scriptDir directory containing the calling script (`…/scripts`)
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function collectEnvFiles(scriptDir, cwd = process.cwd()) {
  const files = [];
  const seen = new Set();
  const add = (p) => {
    if (!p) return;
    const abs = resolve(p);
    if (seen.has(abs) || !existsSync(abs)) return;
    seen.add(abs);
    files.push(abs);
  };

  const skillRoot = dirname(resolve(scriptDir));
  add(join(skillRoot, '.env.local'));
  add(join(skillRoot, '.env'));

  for (const start of [cwd, scriptDir]) {
    let dir = resolve(start);
    for (let i = 0; i < 12; i++) {
      add(join(dir, '.env.local'));
      add(join(dir, '.env'));
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return files;
}

/**
 * Load overlay files into `env` (missing keys only).
 * @param {{ scriptDir: string, cwd?: string, env?: NodeJS.ProcessEnv }} opts
 * @returns {string[]} paths that contributed at least one key
 */
export function bootstrapEnv(opts = {}) {
  const env = opts.env || process.env;
  if (shouldSkip(env)) return [];
  if (!opts.scriptDir) throw new Error('bootstrapEnv: scriptDir is required');
  const loaded = [];
  for (const p of collectEnvFiles(opts.scriptDir, opts.cwd ?? process.cwd())) {
    const r = loadEnvFile(p, env);
    if (r && r.set.length) loaded.push(p);
  }
  return loaded;
}

/**
 * Trim, strip wrapping quotes. Empty if missing.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeFlashcardApiKey(raw) {
  if (raw == null) return '';
  let v = String(raw).trim();
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/** Personal Integration Token prefix used by the SourCards API. */
export function isFlashcardApiKey(raw) {
  const v = normalizeFlashcardApiKey(raw);
  return v.startsWith('sc_int_') && v.length > 'sc_int_'.length;
}

export function hasFlashcardApiKey(env = process.env) {
  return Boolean(normalizeFlashcardApiKey(env.FLASHCARD_API_KEY));
}

function encodeEnvValue(value) {
  if (/[\s#'"\\]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * Insert or replace `KEY=value` in a dotenv file. Preserves other lines.
 * Creates the file (mode 0600) if missing.
 * @param {string} filePath
 * @param {string} key
 * @param {string} value
 * @returns {string} filePath
 */
export function upsertEnvKey(filePath, key, value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`upsertEnvKey: invalid key ${key}`);
  }
  const line = `${key}=${encodeEnvValue(value)}`;
  let text = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'gm');
  if (new RegExp(`^${key}=.*$`, 'm').test(text)) {
    text = text.replace(re, line);
  } else {
    if (!text) {
      text = `# Personal overlay. Do not commit.\n${line}\n`;
    } else {
      if (!text.endsWith('\n')) text += '\n';
      text += `${line}\n`;
    }
  }
  if (!text.endsWith('\n')) text += '\n';
  writeFileSync(filePath, text, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Windows / exotic FS: write succeeded; mode is best-effort.
  }
  return filePath;
}

/**
 * Write FLASHCARD_API_KEY to this skill folder's gitignored `.env.local`
 * and set it on `env` so the current process can use it immediately.
 * @param {string} scriptDir directory containing the calling script (`…/scripts`)
 * @param {string} token
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} overlay path
 */
export function persistFlashcardApiKey(scriptDir, token, env = process.env) {
  const normalized = normalizeFlashcardApiKey(token);
  if (!isFlashcardApiKey(normalized)) {
    throw new Error('Personal Integration Token must start with sc_int_');
  }
  if (!scriptDir) throw new Error('persistFlashcardApiKey: scriptDir is required');
  const skillRoot = dirname(resolve(scriptDir));
  const file = join(skillRoot, SKILL_OVERLAY);
  upsertEnvKey(file, FLASHCARD_API_KEY, normalized);
  env.FLASHCARD_API_KEY = normalized;
  return file;
}
