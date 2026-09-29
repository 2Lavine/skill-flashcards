#!/usr/bin/env node
/**
 * Print the absolute directory of one installed skill.
 * Nearest copy to the current working directory wins. $HOME is only a fallback.
 *
 *   node resolve-skill-root.mjs
 *   node resolve-skill-root.mjs sourcards-library-lint scripts/lint-library.mjs
 *
 * Keep the SKILL.md heredoc in sync with findSkillRoot.
 */
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

export function findSkillRoot(name, marker, cwd = process.cwd()) {
  const hits = [];
  const add = (p) => {
    if (!existsSync(join(p, 'SKILL.md')) || !existsSync(join(p, marker))) return;
    let real;
    try {
      real = realpathSync(p);
    } catch {
      return;
    }
    if (!hits.includes(real)) hits.push(real);
  };
  let dir = cwd;
  for (let i = 0; i < 8; i++) {
    add(dir);
    add(join(dir, 'skills', name));
    add(join(dir, '.agents', 'skills', name));
    add(join(dir, '.claude', 'skills', name));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (hits.length === 0) {
    const home = homedir();
    for (const rel of [
      join(home, '.agents', 'skills', name),
      join(home, '.claude', 'skills', name),
      join(home, '.skills-manager', 'skills', name),
    ]) add(rel);
  }
  return hits;
}

function isMain() {
  try {
    return import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  const name = process.argv[2] || 'sourcards-import';
  const marker = process.argv[3] || 'scripts/lint-cards.mjs';
  const hits = findSkillRoot(name, marker);
  if (hits.length === 0) {
    process.stderr.write(`${name} not found from ${process.cwd()}\n`);
    process.exit(1);
  }
  if (hits.length > 1) {
    process.stderr.write(`using nearest skill copy; ignored: ${hits.slice(1).join(', ')}\n`);
  }
  process.stdout.write(`${hits[0]}\n`);
}
