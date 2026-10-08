// Regression tests for symlink-safe entry-point detection.
//
// A symlinked entry point — `.agents/skills/…` and `.claude/skills/…` installs,
// or the `node_modules/.bin` shims npm creates from the `bin` field — must still
// run its CLI. Comparing `import.meta.url` against a raw `process.argv[1]` made
// those invocations silently do nothing while exiting 0, which reads as success
// to the calling agent.
//
// Run: node --test lib/is-main.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainEntry } from './is-main.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(__dirname, '../../..');
const IMPORT_SCRIPTS = join(SKILL_ROOT, 'scripts');

// Run `target` through a symlink in a throwaway dir, mimicking a skill alias.
function viaSymlink(target, run) {
  const dir = mkdtempSync(join(tmpdir(), 'sourcards-is-main-'));
  try {
    const link = join(dir, basename(target));
    symlinkSync(target, link, 'file');
    return run(link);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('isMainEntry matches the realpath of the running module', () => {
  const self = realpathSync(fileURLToPath(import.meta.url));
  assert.equal(isMainEntry(import.meta.url, self), true);
});

test('isMainEntry rejects a different entry path', () => {
  assert.equal(isMainEntry(import.meta.url, join(__dirname, 'not-this-file.mjs')), false);
});

test('isMainEntry is false without an entry path', () => {
  assert.equal(isMainEntry(import.meta.url, ''), false);
  assert.equal(isMainEntry(import.meta.url, null), false);
});

test('resolve-skill-root.mjs prints the same root through a symlink', () => {
  const script = join(IMPORT_SCRIPTS, 'resolve-skill-root.mjs');
  const direct = spawnSync('node', [script], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(direct.status, 0);
  assert.notEqual(direct.stdout.trim(), '', 'direct invocation must print a root');

  viaSymlink(script, (link) => {
    const linked = spawnSync('node', [link], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(linked.status, 0);
    assert.equal(
      linked.stdout.trim(),
      direct.stdout.trim(),
      'a symlinked invocation must resolve the same skill root, not silently no-op',
    );
  });
});

test('login.mjs --check reports a missing token through a symlink', () => {
  const script = join(IMPORT_SCRIPTS, 'login.mjs');
  const env = { ...process.env, SOURCARDS_SKIP_ENV_FILE: '1', FLASHCARD_API_KEY: '' };

  viaSymlink(script, (link) => {
    const linked = spawnSync('node', [link, '--check'], { encoding: 'utf8', env });
    assert.equal(linked.status, 1, 'a missing token must not be reported as success');
    assert.match(linked.stderr, /missing/);
  });
});
