// Tests for lib/load-env.mjs. Run via package `pnpm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bootstrapEnv,
  collectEnvFiles,
  hasFlashcardApiKey,
  isFlashcardApiKey,
  loadEnvFile,
  persistFlashcardApiKey,
  upsertEnvKey,
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
  assert.equal(typeof a.persistFlashcardApiKey, 'function');
  assert.ok(__dirname.endsWith('lib'));
});

test('isFlashcardApiKey accepts sc_int_ prefix after trim/quotes', () => {
  assert.equal(isFlashcardApiKey('sc_int_abc'), true);
  assert.equal(isFlashcardApiKey('  "sc_int_abc"  '), true);
  assert.equal(isFlashcardApiKey('sc_int_'), false);
  assert.equal(isFlashcardApiKey('sk-old'), false);
  assert.equal(isFlashcardApiKey(''), false);
  assert.equal(hasFlashcardApiKey({ FLASHCARD_API_KEY: '  ' }), false);
  assert.equal(hasFlashcardApiKey({ FLASHCARD_API_KEY: 'sc_int_x' }), true);
});

test('upsertEnvKey creates overlay and replaces only that key', () => {
  const { root, cleanup } = tempTree();
  try {
    const file = join(root, '.env.local');
    upsertEnvKey(file, 'FLASHCARD_API_KEY', 'sc_int_one');
    upsertEnvKey(file, 'OTHER', 'keep');
    upsertEnvKey(file, 'FLASHCARD_API_KEY', 'sc_int_two');
    const text = readFileSync(file, 'utf8');
    assert.match(text, /FLASHCARD_API_KEY=sc_int_two/);
    assert.match(text, /OTHER=keep/);
    assert.equal(text.includes('sc_int_one'), false);
  } finally {
    cleanup();
  }
});

test('persistFlashcardApiKey writes skill .env.local and sets env', () => {
  const { skill, scripts, cleanup } = tempTree();
  try {
    const env = {};
    const file = persistFlashcardApiKey(scripts, '  sc_int_from-user  ', env);
    assert.equal(file, join(skill, '.env.local'));
    assert.equal(env.FLASHCARD_API_KEY, 'sc_int_from-user');
    const loaded = {};
    loadEnvFile(file, loaded);
    assert.equal(loaded.FLASHCARD_API_KEY, 'sc_int_from-user');
    assert.throws(
      () => persistFlashcardApiKey(scripts, 'not-a-token', {}),
      /sc_int_/,
    );
  } finally {
    cleanup();
  }
});

const SAVE_TOKEN = join(__dirname, '../skills/sourcards-import/scripts/save-token.mjs');

test('save-token --check tells the agent to use login.mjs', () => {
  const redirected = spawnSync('node', [SAVE_TOKEN, '--check'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SOURCARDS_SKIP_ENV_FILE: '1',
      FLASHCARD_API_KEY: 'sc_int_test',
    },
  });
  assert.equal(redirected.status, 2);
  assert.match(redirected.stderr, /login\.mjs --check/);
  assert.equal(redirected.stdout.includes('sc_int_test'), false);
});
