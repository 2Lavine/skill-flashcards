#!/usr/bin/env node
/**
 * Put a local file into a cloned public GitHub media repo and push.
 * Prints one absolute https URL (jsDelivr) on stdout.
 *
 * CLI:
 *   node media-put-github.mjs <file> <object-key>
 *
 * Library:
 *   import { putGithubMedia } from './media-put-github.mjs'
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
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * @param {{ file: string, key: string, env?: NodeJS.ProcessEnv }} opts
 * @returns {string} public https URL
 */
export function putGithubMedia(opts) {
  const env = opts.env || process.env;
  const file = opts.file;
  const key = opts.key;

  if (!file || !key) {
    throw new Error('putGithubMedia requires file and key');
  }

  const repoDir = env.SOURCARDS_MEDIA_REPO_DIR;
  const baseUrl = (env.SOURCARDS_MEDIA_BASE_URL || '').replace(/\/+$/, '');
  const remote = env.SOURCARDS_MEDIA_GIT_REMOTE || 'origin';
  const branch = env.SOURCARDS_MEDIA_GIT_BRANCH || 'main';
  const noPush = env.SOURCARDS_MEDIA_NO_PUSH === '1';

  if (!repoDir || !existsSync(repoDir)) {
    throw new Error(
      'SOURCARDS_MEDIA_REPO_DIR must point at a local clone of the public media repo.',
    );
  }
  if (!baseUrl || !/^https:\/\//i.test(baseUrl)) {
    throw new Error(
      'SOURCARDS_MEDIA_BASE_URL must be an absolute https origin (jsDelivr or raw).',
    );
  }

  const absFile = resolve(file);
  if (!existsSync(absFile)) {
    throw new Error(`file not found: ${absFile}`);
  }

  const relKey = key.replace(/^\/+/, '');
  const dest = join(repoDir, relKey);
  mkdirSync(dirname(dest), { recursive: true });

  let skipCommit = false;
  if (existsSync(dest)) {
    const a = createHash('sha256').update(readFileSync(absFile)).digest('hex');
    const b = createHash('sha256').update(readFileSync(dest)).digest('hex');
    if (a === b) skipCommit = true;
  } else {
    copyFileSync(absFile, dest);
  }

  function git(args) {
    const r = spawnSync('git', args, {
      cwd: repoDir,
      encoding: 'utf8',
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

  return publicUrl;
}

// CLI entry
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('media-put-github.mjs') ||
    process.argv[1].includes('media-put-github'));

if (isMain && process.argv[2] && process.argv[3]) {
  try {
    const url = putGithubMedia({
      file: process.argv[2],
      key: process.argv[3],
    });
    console.log(url);
    process.exit(0);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
} else if (isMain) {
  console.error('Usage: media-put-github.mjs <file> <object-key>');
  process.exit(2);
}
