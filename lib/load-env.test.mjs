// Tests for lib/load-env.mjs. Run via package `pnpm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bootstrapEnv,
  collectEnvFiles,
  loadEnvFile,
  walkUpFind,
} from './load-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function tempTree() {
  const root = mkdtempSync(join(tmpdir(), 'sourcards-load-env-'));
  const skill = join(root, 'skill');
  const scripts = join(skill, 'scripts');
  mkdirSync(scripts, { recursive: true });
  return { root, skill, scripts, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('loadEnvFile fills missing keys and keeps quotes off', () => {
  const { root, cleanup } = tempTree();
  try {
    const file = join(root, '.env');
    writeFileSync(file, 'FOO=bar\nBAZ="quoted"\n# skip\nBAD LINE\n');
    const env = {};
    const r = loadEnvFile(file, env);
    assert.deepEqual(r.set.sort(), ['BAZ', 'FOO']);
    assert.equal(env.FOO, 'bar');
    assert.equal(env.BAZ, 'quoted');
  } finally {
    cleanup();
  }
});

test('loadEnvFile does not override existing keys, including empty string', () => {
  const { root, cleanup } = tempTree();
  try {
    const file = join(root, '.env');
    writeFileSync(file, 'FLASHCARD_API_KEY=from-file\nOTHER=yes\n');
    const env = { FLASHCARD_API_KEY: '' };
    loadEnvFile(file, env);
    assert.equal(env.FLASHCARD_API_KEY, '');
    assert.equal(env.OTHER, 'yes');
  } finally {
    cleanup();
  }
});

test('skill-folder .env is collected before ancestor .env', () => {
  const { root, skill, scripts, cleanup } = tempTree();
  try {
    writeFileSync(join(skill, '.env'), 'FLASHCARD_API_KEY=skill\n');
    writeFileSync(join(root, '.env.local'), 'FLASHCARD_API_KEY=repo\nSOURCARDS_API_BASE_URL=http://local\n');
    const files = collectEnvFiles(scripts, root);
    assert.equal(files[0], join(skill, '.env'));
    assert.ok(files.includes(join(root, '.env.local')));
  } finally {
    cleanup();
  }
});

test('bootstrapEnv: skill overlay wins over ancestor; process.env wins over files', () => {
  const { root, skill, scripts, cleanup } = tempTree();
  try {
    writeFileSync(join(skill, '.env'), 'FLASHCARD_API_KEY=skill\nSOURCARDS_API_BASE_URL=http://skill\n');
    writeFileSync(join(root, '.env.local'), 'FLASHCARD_API_KEY=repo\nEXTRA=from-repo\n');
    const env = { FLASHCARD_API_KEY: 'shell' };
    const loaded = bootstrapEnv({ scriptDir: scripts, cwd: root, env });
    assert.equal(env.FLASHCARD_API_KEY, 'shell');
    assert.equal(env.SOURCARDS_API_BASE_URL, 'http://skill');
    assert.equal(env.EXTRA, 'from-repo');
    assert.ok(loaded.length >= 2);
  } finally {
    cleanup();
  }
});

test('bootstrapEnv skips when SOURCARDS_SKIP_ENV_FILE=1', () => {
  const { root, skill, scripts, cleanup } = tempTree();
  try {
    writeFileSync(join(skill, '.env'), 'FLASHCARD_API_KEY=skill\n');
    const env = { SOURCARDS_SKIP_ENV_FILE: '1' };
    const loaded = bootstrapEnv({ scriptDir: scripts, cwd: root, env });
    assert.deepEqual(loaded, []);
    assert.equal(env.FLASHCARD_API_KEY, undefined);
  } finally {
    cleanup();
  }
});

test('walkUpFind returns nearest named file', () => {
  const { root, skill, scripts, cleanup } = tempTree();
  try {
    const cfg = join(skill, 'media.config.json');
    writeFileSync(cfg, '{}');
    assert.equal(walkUpFind(scripts, ['media.config.json']), cfg);
    assert.equal(walkUpFind(root, ['media.config.json']), null);
  } finally {
    cleanup();
  }
});

test('package lib and skill mirrors stay importable', async () => {
  const a = await import('./load-env.mjs');
  const b = await import('../skills/sourcards-import/lib/load-env.mjs');
  const c = await import('../skills/sourcards-daily-report/lib/load-env.mjs');
  assert.equal(typeof a.bootstrapEnv, 'function');
  assert.equal(typeof b.bootstrapEnv, 'function');
  assert.equal(typeof c.bootstrapEnv, 'function');
  assert.ok(__dirname.endsWith('lib'));
});
