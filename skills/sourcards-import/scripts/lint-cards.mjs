#!/usr/bin/env node
// Lint a flashcard import payload BEFORE POSTing to /api/import.
//
// Why this exists: the server does no format validation — it stores whatever
// parses. The one *hard* failure is JSON/LaTeX escaping: a single-backslash
// `\sigma` makes JSON.parse throw and rejects the whole batch, while `\frac`/
// `\times`/`\bar` parse into silent control chars that corrupt KaTeX. Those two
// cases can only be caught on the RAW text, so this runs before JSON.parse.
// Everything else here is a soft quality signal already described in SKILL.md.
//
// Usage:
//   node lint-cards.mjs cards.json
//   node lint-cards.mjs < cards.json
//   cat cards.json | node lint-cards.mjs
//   node lint-cards.mjs cards.json --catalog https://sourcard.sourmonkey.xyz
//
// With --catalog <baseUrl>, the linter fetches your existing decks/categories
// (using $FLASHCARD_API_KEY) and prints a *reference* cross-check: which deck /
// categories in this payload already exist vs. are NEW, plus near-matches to
// existing ones. This is INFO only — it never blocks the exit code. The point
// is to hand the model a reference so it can re-confirm a new category is
// intentional and not a spelling/naming drift of one that already exists.
//
// Exit codes: 0 = clean or warnings only, 1 = blocking error(s), 2 = bad usage.

import { readFileSync } from 'node:fs';

const errors = [];   // blocking — import would fail or data would be corrupt
const warnings = []; // quality drift — import still succeeds
const infos = [];    // reference notes — never affect exit code

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }
function info(msg) { infos.push(msg); }

// ---- parse args: one positional input file + optional --catalog <url> -----
let inputFile = null;
let catalogBase = null;
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--catalog') { catalogBase = argv[++i]; }
    else if (a.startsWith('--catalog=')) { catalogBase = a.slice('--catalog='.length); }
    else if (!a.startsWith('-')) { inputFile = a; }
  }
}

// ---- read input (file arg or stdin) --------------------------------------
let raw;
try {
  raw = inputFile ? readFileSync(inputFile, 'utf8') : readFileSync(0, 'utf8');
} catch (e) {
  console.error(`lint-cards: cannot read input (${e.message})`);
  process.exit(2);
}
if (!raw.trim()) {
  console.error('lint-cards: empty input');
  process.exit(2);
}

// ---- 1. hard: does it parse? if not, hunt the invalid LaTeX escape --------
// Valid JSON string escapes: " \ / b f n r t u. Anything else after a
// backslash is an invalid escape and makes JSON.parse throw. LaTeX macros like
// \sigma \sqrt \sum \alpha \cdot \le \ne trip this. Point the author at them.
function scanInvalidEscapes(text) {
  const hits = [];
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== '\\') { inStr = !inStr; continue; }
    if (inStr && c === '\\') {
      const next = text[i + 1];
      if (!'"\\/bfnrtu'.includes(next)) {
        // capture a little context around the offending macro
        const ctx = text.slice(Math.max(0, i - 20), i + 12).replace(/\n/g, ' ');
        hits.push(`\\${next ?? ''} → …${ctx}…`);
      }
      i++; // skip the escaped char
    }
  }
  return hits;
}

let data;
let parsed = true;
try {
  data = JSON.parse(raw);
} catch (e) {
  parsed = false;
  const hits = scanInvalidEscapes(raw);
  err(`JSON.parse failed: ${e.message}`);
  if (hits.length) {
    err(
      `Found ${hits.length} invalid backslash escape(s) — almost certainly ` +
      `un-doubled LaTeX. Every LaTeX backslash must be "\\\\" in JSON:`,
    );
    for (const h of hits.slice(0, 15)) err(`    ${h}`);
    if (hits.length > 15) err(`    …and ${hits.length - 15} more`);
  }
  // Degrade to a safe empty shape so every check below no-ops instead of
  // throwing — we run all checks, then report once and exit at the very end.
  data = { cards: [] };
}

// ---- 2. hard: parsed OK, but LaTeX \f \t \b \v became control chars -------
// These ARE valid JSON escapes, so parse succeeds — but a card body that meant
// \frac \times \bar now holds a form-feed / tab / backspace. KaTeX gets garbage.
const CTRL = { '\f': '\\frac/\\f…', '\b': '\\bar/\\b…', '\v': '\\v…', '\x07': '\\a…' };
// Tab (\t) is intentionally NOT flagged: real card text can contain tabs, and
// \times corruption is better caught by the missing "$" pairing below.
function scanCtrlChars(str, where) {
  for (const [ch, hint] of Object.entries(CTRL)) {
    if (str.includes(ch)) {
      err(`${where}: contains a raw control char (0x${ch.charCodeAt(0).toString(16).padStart(2, '0')}) — a single-backslash LaTeX macro (${hint}) was eaten by JSON. Double the backslash.`);
    }
  }
}

// ---- 3. shape checks -------------------------------------------------------
if (parsed) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    err('Top-level value must be an object with { deck, cards }.');
    data = { cards: [] }; // degrade so the checks below no-op
  } else {
    if (!data.deck || typeof data.deck !== 'string') err('Missing top-level "deck" (first-level discipline).');
    if (!Array.isArray(data.cards) || data.cards.length === 0) {
      err('Missing or empty "cards" array.');
      data.cards = []; // degrade so the per-card loop no-ops
    }
  }
}

// ---- 4. source: must be a URI locator, not prose/description --------------
if (data.source != null) {
  const s = String(data.source);
  const looksLikeUri = /^(https?:\/\/|\/|~\/|\.\/|[a-z]:\\)/i.test(s.trim());
  const looksLikeProse = /\s/.test(s.trim()) || /[一-鿿]/.test(s) && !looksLikeUri;
  if (!looksLikeUri && looksLikeProse) {
    warn(`"source" (${JSON.stringify(s.slice(0, 40))}…) looks like a description, not a URI. A description belongs in "course"; "source" should be a URL or file path, or be omitted.`);
  }
}

// ---- 5. per-card checks ----------------------------------------------------
const TYPE_TAGS = new Set(['concept', 'entity', 'normal']);
data.cards.forEach((c, idx) => {
  const tag = `card[${idx}]`;
  if (!c || typeof c !== 'object') { err(`${tag}: not an object.`); return; }
  if (!c.question || typeof c.question !== 'string') err(`${tag}: missing "question".`);
  if (!c.answer || typeof c.answer !== 'string') err(`${tag}: missing "answer".`);

  if (typeof c.question === 'string') scanCtrlChars(c.question, `${tag}.question`);
  if (typeof c.answer === 'string') scanCtrlChars(c.answer, `${tag}.answer`);

  // category: single second-level discipline name, no "/" hierarchy
  if (c.category != null && String(c.category).includes('/')) {
    warn(`${tag}: category "${c.category}" contains "/" — use a single second-level discipline name, no hierarchy.`);
  }

  const tags = Array.isArray(c.tags) ? c.tags : [];
  const typeTags = tags.filter((t) => typeof t === 'string' && t.startsWith('type:')).map((t) => t.slice(5));
  const aliases = tags.filter((t) => typeof t === 'string' && t.startsWith('alias:'));

  for (const tt of typeTags) {
    if (!TYPE_TAGS.has(tt)) warn(`${tag}: unknown type tag "type:${tt}" — expected type:concept / type:entity / type:normal.`);
  }
  const isConceptOrEntity = typeTags.includes('concept') || typeTags.includes('entity');
  if (isConceptOrEntity && aliases.length === 0) {
    warn(`${tag}: tagged type:${typeTags.join('/')} but has no "alias:<canonical name>" tag (required for semantic linking).`);
  }

  // Cloze form checks. Form B answers *should* be the deleted term(s).
  // The failure mode is mixing Form A question prompts with Form B syntax.
  if (typeof c.question === 'string' && typeof c.answer === 'string') {
    const clozeContent = [];
    const re = /\{\{c\d+::([^}]+)\}\}/g;
    let m;
    while ((m = re.exec(c.question)) !== null) clozeContent.push(m[1].trim());
    if (clozeContent.length > 0) {
      const q = c.question.trim();
      // Question-shaped fronts with cloze = Form A prompt + Form B syntax.
      const mixedForm =
        /[?？]\s*$/.test(q) ||
        /^(What is|What are|What happens|How does|How do|Why |Which |什么是|什么叫|什么是|请问|为何|为什么|如何|怎么|哪个|哪些)/i.test(q) ||
        /(指什么|是什么|说明什么|意味着什么|的定义|的含义)\s*[?？]?\s*$/.test(q);
      if (mixedForm) {
        warn(`${tag}: cloze inside a question prompt — mixing Form A and Form B is invalid. Use Form A (no cloze) for "What is X?", or rewrite as a Form B statement.`);
      }

      // Long explanatory backs on cloze cards usually mean the author wanted Form A.
      if (c.answer.trim().length > 80) {
        warn(`${tag}: cloze card answer is long (${c.answer.trim().length} chars) — Form B backs should be the hidden term(s), not a full explanation.`);
      }
    }
    // unbalanced math delimiters — common after escape corruption or typos
    const dollars = (c.question.match(/\$/g) || []).length + (typeof c.answer === 'string' ? (c.answer.match(/\$/g) || []).length : 0);
    if (dollars % 2 !== 0) {
      warn(`${tag}: odd number of "$" across question+answer — unbalanced math delimiters (possible LaTeX corruption).`);
    }
  }
});

// ---- 6. reference: cross-check deck/category against existing catalog -----
// INFO only — never touches the exit code. Fetch failures degrade silently to
// one note. The value is handing the model a reference, not a verdict: a NEW
// category next to a near-existing one prompts a re-confirm (real new field vs.
// naming drift), rather than silently minting "对策论" when "博弈论" exists.
if (catalogBase && parsed && data.deck) {
  await catalogCrossCheck(catalogBase.replace(/\/+$/, ''));
}

report();
process.exit(errors.length ? 1 : 0);

// Normalize for fuzzy compare: strip whitespace/punctuation, casefold. Two
// names that normalize equal are almost certainly the same field spelled/spaced
// differently — exactly the drift we want to surface.
function norm(s) {
  return String(s).toLowerCase().replace(/[\s/·・:：_\-—、,，.。]/g, '').trim();
}
// Cheap near-match: catches spelling/spacing drift of the SAME name via
// containment, shared prefix, or edit distance ≤1 on normalized forms (e.g.
// "心里学" vs "心理学", "博弈 论" vs "博弈论"). It does NOT catch synonyms —
// "对策论" vs "博弈论" are the same field by meaning but far apart as strings;
// only discipline knowledge (disciplines.md) resolves that, not this check.
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 1) return 2; // we only care about ≤1; short-circuit
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}
function nearMatches(name, pool) {
  const nn = norm(name);
  if (!nn) return [];
  return pool.filter((p) => {
    const np = norm(p);
    if (!np || np === nn) return false;
    if (np.includes(nn) || nn.includes(np)) return true;
    const short = Math.min(nn.length, np.length);
    if (short >= 2 && nn.slice(0, short) === np.slice(0, short)) return true;
    return editDistance(nn, np) <= 1; // single-char typo drift
  });
}

async function catalogCrossCheck(base) {
  const key = process.env.FLASHCARD_API_KEY;
  if (!key) {
    info(`catalog cross-check skipped — FLASHCARD_API_KEY not set.`);
    return;
  }
  let decks = [];
  let categories = [];
  try {
    const headers = { 'x-api-key': key };
    const [dRes, cRes] = await Promise.all([
      fetch(`${base}/api/decks`, { headers }),
      fetch(`${base}/api/categories`, { headers }),
    ]);
    if (!dRes.ok || !cRes.ok) {
      info(`catalog cross-check skipped — server returned ${dRes.status}/${cRes.status} (bad key or endpoint?).`);
      return;
    }
    const dJson = await dRes.json();
    const cJson = await cRes.json();
    decks = (dJson.decks || []).map((d) => d.name ?? d).filter(Boolean);
    categories = (cJson.categories || []).filter(Boolean);
  } catch (e) {
    info(`catalog cross-check skipped — could not reach ${base} (${e.message}).`);
    return;
  }

  // deck: is the payload's deck the same as one already in the catalog, or new?
  let anyNew = false;
  const deck = data.deck;
  if (deck) {
    if (decks.some((d) => norm(d) === norm(deck))) {
      info(`deck "${deck}" — same as an existing deck (reusing).`);
    } else {
      anyNew = true;
      const near = nearMatches(deck, decks);
      info(near.length
        ? `deck "${deck}" — NEW, but looks like existing "${near.join('" / "')}". Same discipline? If yes, use the existing name.`
        : `deck "${deck}" — NEW (no existing deck matches).`);
    }
  }

  // categories used in this payload
  const used = [...new Set(data.cards.map((c) => c && c.category).filter(Boolean).map(String))];
  const catSet = new Set(categories.map(norm));
  const existing = used.filter((u) => catSet.has(norm(u)));
  const fresh = used.filter((u) => !catSet.has(norm(u)));
  if (existing.length) info(`category same as existing (reusing): ${existing.map((x) => `"${x}"`).join(', ')}`);
  for (const f of fresh) {
    anyNew = true;
    const near = nearMatches(f, categories);
    info(near.length
      ? `category "${f}" — NEW, but looks like existing "${near.join('" / "')}". Same sub-field? If yes, use the existing name.`
      : `category "${f}" — NEW (no existing category matches).`);
  }

  // Remind the naming rules only when something new is actually being created,
  // so the model can re-check the new name against the standard (from disciplines.md).
  if (anyNew) {
    info(`naming rules for any NEW deck/category:`);
    info(`  • deck = 一级学科的通行名 (金融学 / 心理学 / 数学 / 音乐 / 哲学 …), not an abstract layer.`);
    info(`  • category = 其下二级学科或具体细分方向, 中文, 单名, 无 "/", 不堆层级.`);
    info(`  • 实操/民间/跨界内容归入最接近的学术上位学科; 不新造 "XX学" 式伪学科.`);
    info(`  • 同一 deck 下的 category 应是彼此区分的子方向. 参见 references/disciplines.md.`);
  }
}

// ---- output ----------------------------------------------------------------
function report() {
  const n = Array.isArray(data?.cards) ? data.cards.length : 0;
  if (errors.length === 0 && warnings.length === 0 && infos.length === 0) {
    console.log(`✓ lint clean — ${n} card(s), safe to import.`);
    return;
  }
  if (errors.length) {
    console.log(`✗ ${errors.length} blocking error(s):`);
    for (const e of errors) console.log(`  ✗ ${e}`);
  }
  if (warnings.length) {
    console.log(`⚠ ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }
  if (infos.length) {
    console.log(`ℹ catalog reference (not blocking):`);
    for (const m of infos) console.log(`  ℹ ${m}`);
  }
  if (!errors.length) {
    const tail = warnings.length ? 'warnings only, import will succeed' : 'clean, safe to import';
    console.log(`\n(${n} card(s) — ${tail}.)`);
  }
}
