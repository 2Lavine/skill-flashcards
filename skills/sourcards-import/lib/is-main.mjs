/**
 * Entry-point detection that survives symlinks.
 *
 * Node resolves the ESM main module through symlinks, so `import.meta.url` is
 * already canonical while `process.argv[1]` may still be the symlink path. A raw
 * comparison therefore fails for every aliased invocation — `.agents/skills/…`
 * and `.claude/skills/…` installs, plus `node_modules/.bin` shims created by the
 * `bin` entries in package.json — and the CLI silently does nothing while still
 * exiting 0, which reads as success to a calling agent.
 *
 * Compare realpaths on both sides instead.
 */
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @param {string} importMetaUrl `import.meta.url` of the calling module
 * @param {string} [entryPath] process entry path; defaults to `process.argv[1]`
 * @returns {boolean} true when the caller is the running entry point
 */
export function isMainEntry(importMetaUrl, entryPath = process.argv[1]) {
  if (!importMetaUrl || !entryPath) return false;
  let real;
  try {
    real = realpathSync(entryPath);
  } catch {
    // Vanished shim or unreadable path: fall back to a lexical resolve, which
    // simply will not match importMetaUrl.
    real = resolve(entryPath);
  }
  return importMetaUrl === pathToFileURL(real).href;
}
