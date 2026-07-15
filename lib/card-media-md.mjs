/**
 * Markdown media token helpers for the sourcards-import skill.
 *
 * Standalone mirror of monorepo `packages/core/shared/src/media/card-media.ts`
 * MEDIA_TOKEN_RE / absolute-src checks — skill scripts cannot depend on
 * `@sourcards/shared`. Keep regex behavior aligned when either side changes.
 */

/** Same capture groups as shared MEDIA_TOKEN_RE. */
export const MEDIA_TOKEN_RE =
  /<audio\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>|!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

/**
 * Ordered unique media src strings from markdown (audio + image).
 * @param {string | null | undefined} markdown
 * @returns {string[]}
 */
export function extractMediaSrcs(markdown) {
  if (!markdown || typeof markdown !== 'string') return [];
  const out = [];
  const seen = new Set();
  for (const match of markdown.matchAll(MEDIA_TOKEN_RE)) {
    const src = (match[1] || match[3] || match[4] || '').trim();
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push(src);
  }
  return out;
}

/**
 * True when src is already a public https URL (what import should ship).
 * @param {string | null | undefined} src
 */
export function isPublicHttpsMediaSrc(src) {
  const value = typeof src === 'string' ? src.trim() : '';
  return /^https:\/\//i.test(value);
}

/**
 * True when src is already network-fetchable without local disk (https/http/data/blob
 * or protocol-relative). Root-relative `/demo/...` is NOT absolute for upload purposes —
 * it is same-origin SPA demo only.
 * @param {string | null | undefined} src
 */
export function isRemoteOrDataMediaSrc(src) {
  const value = typeof src === 'string' ? src.trim() : '';
  if (!value) return false;
  if (/^(?:https?:|data:|blob:)/i.test(value)) return true;
  if (value.startsWith('//')) return true;
  return false;
}

/**
 * True when src still needs upload/rewrite before import (local / relative / file:).
 * @param {string | null | undefined} src
 */
export function needsMediaUpload(src) {
  const value = typeof src === 'string' ? src.trim() : '';
  if (!value) return false;
  if (isRemoteOrDataMediaSrc(value)) return false;
  // Root-relative app demo paths: not local files; leave alone (lint may note).
  if (value.startsWith('/') && !value.startsWith('//')) return false;
  return true;
}

/**
 * Classify a media src for lint messaging.
 * @returns {'https' | 'http' | 'data' | 'root-relative' | 'local' | 'empty'}
 */
export function classifyMediaSrc(src) {
  const value = typeof src === 'string' ? src.trim() : '';
  if (!value) return 'empty';
  if (/^https:\/\//i.test(value)) return 'https';
  if (/^http:\/\//i.test(value)) return 'http';
  if (/^data:/i.test(value)) return 'data';
  if (value.startsWith('//')) return 'http'; // protocol-relative; treat like insecure unless rewritten
  if (value.startsWith('/') && !value.startsWith('//')) return 'root-relative';
  return 'local';
}

/**
 * Replace every occurrence of `fromSrc` as a media src attribute/url with `toSrc`.
 * Only rewrites inside known media token shapes (audio/img/markdown image).
 * @param {string} markdown
 * @param {string} fromSrc
 * @param {string} toSrc
 */
export function rewriteMediaSrc(markdown, fromSrc, toSrc) {
  if (!markdown || !fromSrc || fromSrc === toSrc) return markdown ?? '';
  // Escape for use in a character-class-free exact string match inside tokens.
  const esc = fromSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = markdown;
  // <audio src="..."> / <img src="...">
  out = out.replace(
    new RegExp(`(<audio\\b[^>]*\\bsrc\\s*=\\s*["'])${esc}(["'][^>]*>)`, 'gi'),
    `$1${toSrc}$2`,
  );
  out = out.replace(
    new RegExp(`(<img\\b[^>]*\\bsrc\\s*=\\s*["'])${esc}(["'][^>]*>)`, 'gi'),
    `$1${toSrc}$2`,
  );
  // ![alt](src) or ![alt](src "title")
  out = out.replace(
    new RegExp(`(!\\[[^\\]]*\\]\\()${esc}(?=\\s|"|\\))`, 'g'),
    `$1${toSrc}`,
  );
  return out;
}

/**
 * Apply many from→to rewrites (order-stable; each key once).
 * @param {string} markdown
 * @param {Map<string, string> | Record<string, string>} map
 */
export function rewriteMediaSrcMap(markdown, map) {
  const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);
  let out = markdown ?? '';
  for (const [from, to] of entries) {
    if (from && to && from !== to) out = rewriteMediaSrc(out, from, to);
  }
  return out;
}

/**
 * Collect unique media srcs across all cards' question/answer fields.
 * @param {{ cards?: Array<{ question?: string, answer?: string }> }} payload
 * @returns {string[]}
 */
export function extractPayloadMediaSrcs(payload) {
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  const seen = new Set();
  const out = [];
  for (const c of cards) {
    for (const field of [c?.question, c?.answer]) {
      for (const src of extractMediaSrcs(field)) {
        if (seen.has(src)) continue;
        seen.add(src);
        out.push(src);
      }
    }
  }
  return out;
}

/**
 * Rewrite media srcs in every card question/answer. Returns a shallow-cloned payload.
 * @param {object} payload
 * @param {Map<string, string> | Record<string, string>} map
 */
export function rewritePayloadMedia(payload, map) {
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  return {
    ...payload,
    cards: cards.map((c) => {
      if (!c || typeof c !== 'object') return c;
      const next = { ...c };
      if (typeof next.question === 'string') {
        next.question = rewriteMediaSrcMap(next.question, map);
      }
      if (typeof next.answer === 'string') {
        next.answer = rewriteMediaSrcMap(next.answer, map);
      }
      return next;
    }),
  };
}
