#!/usr/bin/env node
/**
 * Put a local file into a cloned public GitHub media repo and push.
 * Prints one absolute https URL (jsDelivr) on stdout for upload-media command provider.
 *
 * Usage:
 *   node media-put-github.mjs <file> <object-key>
 *
 * Env:
 *   SOURCARDS_MEDIA_REPO_DIR   absolute path to local clone of the public media repo
 *   SOURCARDS_MEDIA_BASE_URL   e.g. https://cdn.jsdelivr.net/gh/2Lavine/sourcards-media@main
 *   SOURCARDS_MEDIA_GIT_REMOTE optional remote name (default origin)
 *   SOURCARDS_MEDIA_GIT_BRANCH optional branch (default main)
 *   SOURCARDS_MEDIA_NO_PUSH    if "1", commit only (for offline tests)
 */

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const file = process.argv[2];
const key = process.argv[3];

if (!file || !key) {
  console.error('Usage: media-put-github.mjs <file> <object-key>');
  process.exit(2);
}

const repoDir = process.env.SOURCARDS_MEDIA_REPO_DIR;
const baseUrl = (process.env.SOURCARDS_MEDIA_BASE_URL || '').replace(/\/+$/, '');
const remote = process.env.SOURCARDS_MEDIA_GIT_REMOTE || 'origin';
const branch = process.env.SOURCARDS_MEDIA_GIT_BRANCH || 'main';
const noPush = process.env.SOURCARDS_MEDIA_NO_PUSH === '1';

if (!repoDir || !existsSync(repoDir)) {
  console.error(
    'SOURCARDS_MEDIA_REPO_DIR must point at a local clone of the public media repo.',
  );
  process.exit(1);
}
if (!baseUrl || !/^https:\/\//i.test(baseUrl)) {
  console.error('SOURCARDS_MEDIA_BASE_URL must be an absolute https origin (jsDelivr or raw).');
  process.exit(1);
}

const absFile = resolve(file);
if (!existsSync(absFile)) {
  console.error(`file not found: ${absFile}`);
  process.exit(1);
}

const relKey = key.replace(/^\/+/, '');
const dest = join(repoDir, relKey);
mkdirSync(dirname(dest), { recursive: true });

// Skip rewrite if identical content already present
let skipCommit = false;
if (existsSync(dest)) {
  const a = createHash('sha256').update(readFileSync(absFile)).digest('hex');
  const b = createHash('sha256').update(readFileSync(dest)).digest('hex');
  if (a === b) skipCommit = true;
} else {
  copyFileSync(absFile, dest);
}

function git(args, opts = {}) {
  const r = spawnSync('git', args, {
    cwd: repoDir,
    encoding: 'utf8',
    ...opts,
  });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${msg}`);
  }
  return r;
}

const publicUrl = `${baseUrl}/${relKey}`;

if (!skipCommit) {
  if (!existsSync(dest)) copyFileSync(absFile, dest);
  git(['add', '--', relKey]);
  // Only commit if something staged
  const st = spawnSync('git', ['diff', '--cached', '--quiet'], {
    cwd: repoDir,
    encoding: 'utf8',
  });
  if (st.status === 1) {
    git(['commit', '-m', `media: ${relKey}`]);
    if (!noPush) {
      git(['push', remote, branch]);
    }
  }
}

// Always print the public URL last so upload-media can scrape it.
console.log(publicUrl);
process.exit(0);
