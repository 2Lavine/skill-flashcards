/**
 * Pure SVG poster builders for Xiaohongshu share images (1242x1660, 3:4).
 * No DOM / no sharp here — string in, string out. Testable in isolation.
 *
 * Design language: restrained neutral surface, generous whitespace, one accent.
 * Brand bar pinned to the bottom of every image.
 */

export const POSTER_WIDTH = 1242;
export const POSTER_HEIGHT = 1660;
export const BRAND_LINE = "SourCards";

const FONT_STACK =
  "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif";

const THEME = {
  bg: "#FAFAF8",
  ink: "#1C1C1A",
  body: "#3A3A36",
  muted: "#8A8A82",
  hairline: "#E4E2DC",
  accent: "#2F5FE3",
  kickerBg: "#EFEDE7",
};

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Prepare raw card text for poster display:
 * - cloze {{c1::answer}} (optionally with ::hint) → answer
 * - $$...$$ / $...$ LaTeX delimiters → inner source (no renderer offline)
 * - markdown images / audio tags → semantic placeholders
 * - markdown emphasis/code fences → plain text
 */
export function plainCardText(input) {
  let text = String(input ?? "");
  text = text.replace(/\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g, (_m, answer) => answer);
  // Cloze stripping can leave double spaces / spaces between CJK; collapse them.
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/([　-〿㐀-鿿＀-￯]) (?=[　-〿㐀-鿿＀-￯])/g, "$1");
  text = text.replace(/\$\$([^$]+)\$\$/g, "$1");
  text = text.replace(/\$([^$\n]+)\$/g, "$1");
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "[图片]");
  text = text.replace(/<audio[^>]*>.*?<\/audio>/gs, "[音频]");
  text = text.replace(/<audio[^>]*\/>/g, "[音频]");
  text = text.replace(/```[\s\S]*?```/g, (m) =>
    m.replace(/```[^\n]*\n?/g, "").trim(),
  );
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^\s*[-*]\s+/gm, "· ");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/** Approximate display width: CJK ≈ 1em, everything else ≈ 0.52em. */
function charUnits(ch) {
  const code = ch.codePointAt(0);
  if (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x20000 && code <= 0x2fa1f)
  ) {
    return 1;
  }
  // Wide punctuation that the flat 0.52em estimate collides on. Em/en dashes
  // and the ellipsis are a full em in CJK faces, and dashes are routinely
  // written doubled (——); at 0.52em the pair overlaps into a single dash.
  if (code === 0x2014 || code === 0x2013 || code === 0x2015 || code === 0x2026) {
    return 1;
  }
  if (code === 0x25 || code === 0x2b || code === 0xd7 || code === 0xf7) {
    return 0.62;
  }
  return 0.52;
}

// Characters that must not start a line (CJK closing punctuation etc.).
const NO_LINE_START = new Set(
  "，。；：！？、）】》」』〕…·".split(""),
);

/**
 * Greedy wrap into lines that fit `maxUnits`. Splits on explicit newlines
 * first; over-long lines wrap at the last breakable char when possible.
 */
export function wrapText(text, fontSize, maxWidthPx) {
  const maxUnits = maxWidthPx / fontSize;
  const lines = [];
  for (const rawLine of String(text).split("\n")) {
    let line = rawLine.trim();
    if (line === "") {
      lines.push("");
      continue;
    }
    let current = "";
    let units = 0;
    for (const ch of line) {
      const w = charUnits(ch);
      if (units + w > maxUnits && current !== "") {
        // CJK punctuation hangs on the previous line instead of starting a new one.
        if (NO_LINE_START.has(ch)) {
          lines.push(current.trimEnd() + ch);
          current = "";
          units = 0;
          continue;
        }
        lines.push(current.trimEnd());
        current = ch === " " ? "" : ch;
        units = current === "" ? 0 : w;
      } else {
        current += ch;
        units += w;
      }
    }
    if (current !== "") lines.push(current.trimEnd());
  }
  return lines;
}

/**
 * Cover title wrap. Greedy wrapping is right for body copy but produces orphan
 * lines on display type: "明知道该改，为什么改不掉" split as "…为什么改" +
 * "不掉" reads as a bug. When the greedy result is two lines with a stub
 * second line, re-split at a punctuation boundary nearest to balanced.
 */
function wrapTitle(text, fontSize, maxWidthPx) {
  const natural = wrapText(text, fontSize, maxWidthPx);
  if (natural.length !== 2) return natural;
  const maxUnits = maxWidthPx / fontSize;
  const chars = [...String(text).replace(/\s*\n\s*/g, "")];
  const units = (arr) => arr.reduce((sum, ch) => sum + charUnits(ch), 0);
  if (units([...natural[1]]) >= maxUnits * 0.45) return natural;

  let best = null;
  for (let i = 1; i < chars.length; i += 1) {
    if (!"，。、：；！？".includes(chars[i - 1])) continue;
    const head = units(chars.slice(0, i));
    const tail = units(chars.slice(i));
    if (head > maxUnits || tail > maxUnits) continue;
    const skew = Math.abs(head - tail);
    if (!best || skew < best.skew) {
      best = {
        skew,
        lines: [chars.slice(0, i).join(""), chars.slice(i).join("")],
      };
    }
  }
  return best ? best.lines : natural;
}

/**
 * Rich content model: { type:"text"|"math"|"blank"|"break", width, underline? }.
 * clozeMode "hide" renders cloze answers as blank underlines (question
 * side); "reveal" renders the full sentence with answers underlined
 * (answer side). TeX stays typeset in both modes.
 */
const CLOZE_MIN_BLANK_WIDTH = 96;

/**
 * Split a token into positioning runs. CJK may break between any two chars, so
 * each CJK char gets its own run. Latin/digit/punctuation sequences stay in ONE
 * run: their real advances vary far too much (i ≈ 0.27em, m ≈ 0.85em) for a
 * flat per-char estimate to land correctly — split per char and "Rich" renders
 * as "R ch" with the i shoved sideways.
 */
function splitRuns(token) {
  const out = [];
  let buf = "";
  for (const ch of token) {
    if (/[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch)) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      out.push(ch);
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function buildContent(text, fontSize, renderMath, color, clozeMode) {
  const runs = [];
  const pushText = (target, value, underline = false) => {
    if (value === "") return;
    const tokens = plainCardText(value).match(/\n{2,}|\n|[ \t]+|\S+/g) ?? [];
    // Leading whitespace survives as a spacer run (e.g. " + $x$").
    if (/^\s/.test(value) && tokens.length > 0 && !/^\s/.test(tokens[0])) {
      tokens.unshift(" ");
    }
    for (const token of tokens) {
      // Authored paragraph breaks must survive: they are the only thing
      // separating an answer's 结论 / 机制 / 落点.
      if (/^\n+$/.test(token)) {
        target.push({ type: "break", value: token, width: 0 });
        continue;
      }
      // CJK sentences have no spaces: split per char so lines can break.
      // Whitespace never belongs to an underline span.
      const isSpace = /^\s+$/.test(token);
      const parts = isSpace ? [token] : splitRuns(token);
      for (const part of parts) {
        const width = [...part].reduce(
          (sum, ch) => sum + charUnits(ch) * fontSize,
          0,
        );
        target.push({
          type: "text",
          value: part,
          width,
          underline: isSpace ? false : underline,
        });
      }
    }
  };
  const fragmentRuns = (fragment, underline = false) => {
    const out = [];
    const pattern = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g;
    let cursor = 0;
    for (const match of fragment.matchAll(pattern)) {
      pushText(out, fragment.slice(cursor, match.index), underline);
      const tex = match[1] ?? match[2];
      out.push({
        type: "math",
        underline,
        ...renderMath(tex, { fontSize, color }),
      });
      cursor = match.index + match[0].length;
    }
    pushText(out, fragment.slice(cursor), underline);
    return out;
  };
  // Normalize: keep cloze answers inline (marked), wrap bare LaTeX commands.
  const source = String(text).replace(
    /\{\{c\d+::(.*?)(?:::(.*?))?\}\}|\$\$[^$]+\$\$|\$[^$\n]+\$|\\[A-Za-z]+(?:\{[^{}]*\})(?:\^\{?[^;}\s]+\}?)*/g,
    (token, clozeAnswer) => {
      if (clozeAnswer !== undefined) return `\u0000${clozeAnswer}\u0000`;
      if (token.startsWith("$")) return token;
      return `$${token}$`;
    },
  );
  const clozePattern = /\u0000([^\u0000]+)\u0000/g;
  let cursor = 0;
  for (const match of source.matchAll(clozePattern)) {
    runs.push(...fragmentRuns(source.slice(cursor, match.index)));
    const answer = match[1];
    if (clozeMode === "hide") {
      const answerWidth = fragmentRuns(answer, false).reduce(
        (sum, run) => sum + run.width,
        0,
      );
      runs.push({
        type: "blank",
        width: Math.max(answerWidth, CLOZE_MIN_BLANK_WIDTH),
        underline: true,
      });
    } else {
      // Every cloze answer is one indivisible unit so the underline never
      // splits across a line break.
      const parts = fragmentRuns(answer, false);
      runs.push({
        type: "unit",
        width: parts.reduce((sum, run) => sum + run.width, 0),
        runs: parts,
        underline: true,
      });
    }
    cursor = match.index + match[0].length;
  }
  runs.push(...fragmentRuns(source.slice(cursor)));
  return runs;
}

/** Break runs into lines; a math run never splits and carries operators. */
function breakRuns(runs, maxWidthPx) {
  const lines = [];
  let line = [];
  let width = 0;
  const flush = () => {
    while (line[0]?.type === "text" && /^\s+$/.test(line[0].value)) {
      line.shift();
    }
    lines.push(line);
    line = [];
    width = 0;
  };
  for (const run of runs) {
    if (run.type === "break") {
      if (line.length > 0) flush();
      // Any authored newline is a paragraph gap (copy is not hard-wrapped).
      // "\n\n" and "\n" behave the same; never stack two blank lines.
      if (lines.length > 0 && lines[lines.length - 1].length !== 0) {
        lines.push([]);
      }
      continue;
    }
    if (width + run.width > maxWidthPx && line.length > 0) {
      // CJK closing punctuation hangs on the previous line.
      if (
        run.type === "text" &&
        [...run.value].length === 1 &&
        NO_LINE_START.has(run.value)
      ) {
        line.push(run);
        width += run.width;
        continue;
      }
      // " +" before a formula/cloze belongs to the PREVIOUS item — move it
      // to the previous line instead of leading the next one.
      if (
        line.length > 0 &&
        run.type === "text" &&
        run.value === " " &&
        (runs[runs.indexOf(run) + 1]?.type === "math" ||
          runs[runs.indexOf(run) + 1]?.type === "unit")
      ) {
        // don't flush yet: the space itself fits nowhere, but the next run
        // triggers the break; keep the space on this line if possible.
        if (width + run.width <= maxWidthPx) {
          line.push(run);
          width += run.width;
          continue;
        }
      }
      // Operators stay at the end of the previous line; a formula that
      // doesn't fit moves whole to the next line.
      flush();
    }
    line.push(run);
    width += run.width;
  }
  flush();
  return lines;
}

function richTspans(lines, x, startY, lineHeight, attrs, underlineColor) {
  const mathAttrs = attrs.replace(/font-weight="[^"]*"/, 'font-weight="400"');
  return lines
    .map((line, i) => {
      let offset = 0;
      const baseline = startY + i * lineHeight;
      const segments = [];
      let pending = []; // contiguous plain-text runs, rendered as one <text>
      let groupStart = null; // estimated x where the pending group begins

      // Emit the pending text group at `groupStart`, letting the renderer
      // advance glyphs with real font metrics. Positioning every run at an
      // absolute x from a flat 0.52em/1em estimate drifts: "Rich Roll  酗酒"
      // gained a double gap because both the space and the Latin run were
      // over-measured. xml:space="preserve" is required, or the spaces between
      // Latin words collapse away entirely.
      const flushText = () => {
        if (pending.length === 0) {
          groupStart = null;
          return;
        }
        const value = pending.map((run) => run.value).join("");
        const groupX = x + (groupStart ?? offset);
        pending = [];
        groupStart = null;
        if (value.trim() === "") return; // a lone spacer at line end paints nothing
        segments.push(
          `<text x="${groupX}" y="${baseline}" ${attrs} xml:space="preserve">${escapeXml(value)}</text>`,
        );
      };

      for (const run of line) {
        if (run.type === "text") {
          if (groupStart === null) groupStart = offset;
          pending.push(run);
          // Still advance the ESTIMATE: runs after a math segment are placed
          // absolutely, so the estimate is what keeps them from overlapping.
          offset += run.width;
          continue;
        }
        flushText();
        if (run.type === "blank") {
          offset += run.width;
          continue;
        }
        if (run.type === "unit") {
          // Whole cloze answer (possibly containing math) at one fixed origin.
          let inner = 0;
          for (const part of run.runs) {
            segments.push(
              part.type === "math"
                ? part.markup(x + offset + inner, baseline).replace("<svg ", `<svg ${mathAttrs} `)
                : `<text x="${x + offset + inner}" y="${baseline}" ${attrs}>${escapeXml(part.value)}</text>`,
            );
            inner += part.width;
          }
          offset += run.width;
          continue;
        }
        // Math: an embedded <svg> needs an absolute origin, so the text flow
        // restarts at the estimated x after it.
        segments.push(
          run.markup(x + offset, baseline).replace("<svg ", `<svg ${mathAttrs} `),
        );
        offset += run.width;
      }
      flushText();
      const content = segments.join("");
      const underline = line
        .filter((run) => run.underline && run.value !== " ")
        .map((run) => {
          const runOffset = line
            .slice(0, line.indexOf(run))
            .reduce((sum, item) => sum + item.width, 0);
          return `<line x1="${x + runOffset}" y1="${baseline + 16}" x2="${x + runOffset + run.width}" y2="${baseline + 16}" stroke="${underlineColor}" stroke-width="5"/>`;
        })
        .join("");
      return (content || `<text x="${x}" y="${baseline}" ${attrs}> </text>`) + underline;
    })
    .join("\n");
}

function tspans(lines, x, startY, lineHeight, attrs) {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${startY + i * lineHeight}" ${attrs}>${escapeXml(line) || " "}</text>`,
    )
    .join("\n");
}

/**
 * Q/A side marker. A 34px letter on its own was too quiet — at the size a
 * Xiaohongshu feed renders these, the question page and the answer page looked
 * identical in the thumbnail strip. A filled accent block with the letter
 * knocked out, plus the Chinese label, reads at any size.
 */
function sideBadge(letter, label, x, y, size = 78) {
  const letterSize = Math.round(size * 0.55);
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="${THEME.accent}"/>
  <text x="${x + size / 2}" y="${y + Math.round(size * 0.69)}" text-anchor="middle" font-size="${letterSize}" font-weight="700" fill="#FFFFFF">${letter}</text>
  <text x="${x + size + 26}" y="${y + Math.round(size * 0.66)}" font-size="30" fill="${THEME.muted}" letter-spacing="4">${escapeXml(label)}</text>`;
}

function brandBar() {
  const y = POSTER_HEIGHT - 88;
  return `
  <line x1="96" y1="${y - 28}" x2="${POSTER_WIDTH - 96}" y2="${y - 28}" stroke="${THEME.hairline}" stroke-width="2"/>
  <text x="96" y="${y + 14}" font-size="30" fill="${THEME.muted}" letter-spacing="1">${escapeXml(BRAND_LINE)}</text>`;
}

function svgShell(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" viewBox="0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}" font-family="${FONT_STACK}">
  <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="${THEME.bg}"/>
${body}
</svg>`;
}

/**
 * Cover poster: kicker (deck/category), big title, card count, brand bar.
 * input: { kicker, title, countLabel }
 */
export function buildCoverSvg({ kicker, title, countLabel }) {
  const margin = 96;
  const maxW = POSTER_WIDTH - margin * 2;
  const titleLines = wrapTitle(title, 96, maxW).slice(0, 4);
  const titleLineH = 128;
  const kickerH = kicker ? 112 : 0; // chip + gap
  const countH = countLabel ? 96 : 0; // gap + count text
  const blockH =
    kickerH + 96 + (titleLines.length - 1) * titleLineH + countH;
  const blockTop = Math.round((POSTER_HEIGHT - 150 - blockH) / 2);

  const titleStartY = blockTop + kickerH + 96;
  const afterTitleY =
    titleStartY + (titleLines.length - 1) * titleLineH + 96;

  const kickerSvg = kicker
    ? `<rect x="${margin}" y="${blockTop}" rx="14" height="64" width="${Math.min(kicker.length * 34 + 56, maxW)}" fill="${THEME.kickerBg}"/>
  <text x="${margin + 28}" y="${blockTop + 44}" font-size="30" fill="${THEME.body}" letter-spacing="2">${escapeXml(kicker)}</text>`
    : "";

  const countSvg = countLabel
    ? `<text x="${margin}" y="${afterTitleY}" font-size="36" fill="${THEME.muted}">${escapeXml(countLabel)}</text>`
    : "";

  return svgShell(`
  <rect x="0" y="0" width="${POSTER_WIDTH}" height="10" fill="${THEME.accent}"/>
  ${kickerSvg}
  ${tspans(titleLines, margin, titleStartY, titleLineH, `font-size="96" font-weight="700" fill="${THEME.ink}"`)}
  ${countSvg}
  ${brandBar()}`);
}

/**
 * Overview / agenda poster. Sits between the cover and the first card so the
 * post reads as one argument instead of N unrelated cards: the reader sees
 * the whole structure before any single Q/A.
 */
export function buildOverviewSvg({ label = "", items = [], note = "" }) {
  const margin = 96;
  const maxW = POSTER_WIDTH - margin * 2;
  const labelLines = label ? wrapText(label, 64, maxW) : [];
  const labelStartY = 300;
  const labelLineH = 88;
  let y =
    labelStartY +
    (labelLines.length > 0 ? (labelLines.length - 1) * labelLineH : 0) +
    120;

  const listSvg = items
    .map((raw, i) => {
      const lines = wrapText(raw, 44, maxW - 92);
      const num = String(i + 1).padStart(2, "0");
      const lineH = 66;
      const svg = `
  <text x="${margin}" y="${y}" font-size="36" font-weight="700" fill="${THEME.accent}">${num}</text>
  ${tspans(lines, margin + 92, y, lineH, `font-size="44" fill="${THEME.body}"`)}
  <line x1="${margin}" y1="${y + (lines.length - 1) * lineH + 34}" x2="${POSTER_WIDTH - margin}" y2="${y + (lines.length - 1) * lineH + 34}" stroke="${THEME.hairline}" stroke-width="2"/>`;
      y += lines.length * lineH + 46;
      return svg;
    })
    .join("");

  // The attribution sits on the same baseline as the card pages' footer, not
  // right under the list — otherwise a three-item agenda leaves the bottom
  // half of the poster empty and the whole page reads as unfinished.
  const noteSvg = note
    ? `<text x="${margin}" y="${POSTER_HEIGHT - 150}" font-size="30" fill="${THEME.muted}">${escapeXml(note)}</text>`
    : "";

  return svgShell(`
  <rect x="0" y="0" width="${POSTER_WIDTH}" height="10" fill="${THEME.accent}"/>
  <text x="${margin}" y="200" font-size="30" fill="${THEME.accent}" font-weight="600" letter-spacing="6">总览</text>
  ${label ? tspans(labelLines, margin, labelStartY, labelLineH, `font-size="64" font-weight="700" fill="${THEME.ink}"`) : ""}
  ${listSvg}
  ${noteSvg}
  ${brandBar()}`);
}

/**
 * Card poster. side="both" combines Q/A; "question" and "answer" render
 * standalone sides for cardMode="split".
 *
 * The answer side reprints the question as a ruled pull-quote: the reader
 * arrives there by scrolling past a full-screen image, and by then the prompt
 * is gone. Cloze cards are the exception — their answer side already reprints
 * the whole sentence.
 */
export function buildCardSvg({
  index,
  total,
  question,
  answer,
  footerLabel,
  renderMath,
  side = "both",
}) {
  const margin = 96;
  const maxW = POSTER_WIDTH - margin * 2;
  // Cloze card: Q = sentence with blank underlines; A = same sentence with
  // answers filled in and underlined. Non-cloze: A shows the answer field.
  const isCloze = /\{\{c\d+::/.test(question);
  const answerSource = isCloze ? question : answer;
  const questionLines = renderMath
    ? breakRuns(buildContent(question, 56, renderMath, THEME.ink, "hide"), maxW)
    : wrapText(plainCardText(question), 56, maxW);
  const answerLines = renderMath
    ? breakRuns(buildContent(answerSource, 44, renderMath, THEME.body, "reveal"), maxW)
    : wrapText(plainCardText(answerSource), 44, maxW);
  // Q and A are vertically optically aligned with the badge, not the text top.
  const pager =
    typeof index === "number" && typeof total === "number"
      ? `<text x="${POSTER_WIDTH - margin}" y="196" text-anchor="end" font-size="34" fill="${THEME.muted}">${index + 1} / ${total}</text>`
      : "";
  const footer = footerLabel
    ? `<text x="${margin}" y="${POSTER_HEIGHT - 150}" font-size="30" fill="${THEME.muted}">${escapeXml(footerLabel)}</text>`
    : "";

  const bodyTop = 300;
  const bodyBottom = POSTER_HEIGHT - 170;
  const bodyH = bodyBottom - bodyTop;

  if (side !== "both") {
    const isQuestion = side === "question";
    const fontSize = isQuestion ? 56 : 44;
    const lineHeight = isQuestion ? 84 : 68;
    const capTop = Math.round(fontSize * 0.78);
    const attrs = `font-size="${fontSize}" font-weight="${isQuestion ? 600 : 400}" fill="${isQuestion ? THEME.ink : THEME.body}"`;
    const head = sideBadge(
      isQuestion ? "Q" : "A",
      isQuestion ? "问题" : "答案",
      margin,
      150,
    );

    const recapLines =
      isQuestion || isCloze
        ? []
        : (renderMath
            ? breakRuns(
                buildContent(question, 32, renderMath, THEME.muted, "reveal"),
                maxW - 52,
              )
            : wrapText(plainCardText(question), 32, maxW - 52)
          ).slice(0, 3);
    const recapLineH = 50;
    const recapStart = 30; // baseline of the first recap line, from block top
    const ruleOffset = recapLines.length
      ? recapStart + (recapLines.length - 1) * recapLineH + 58
      : 0;
    const recapH = recapLines.length ? ruleOffset + 34 : 0;

    // Budget the answer lines against what the recap left behind, so a long
    // answer is trimmed instead of running into the footer.
    const maxAnswerLines = Math.max(
      3,
      Math.floor((bodyH - recapH - 56) / lineHeight) + 1,
    );
    const lines = isQuestion
      ? questionLines.slice(0, 8)
      : answerLines.slice(0, Math.min(14, maxAnswerLines));
    const blockH = recapH + (lines.length - 1) * lineHeight + fontSize;
    const top = Math.round(bodyTop + Math.max(0, (bodyH - blockH) / 2));
    const textSvg = renderMath
      ? richTspans(lines, margin, top + recapH + capTop, lineHeight, attrs, THEME.accent)
      : tspans(lines, margin, top + recapH + capTop, lineHeight, attrs);

    const recapSvg =
      recapLines.length === 0
        ? ""
        : `<line x1="${margin}" y1="${top + recapStart - 28}" x2="${margin}" y2="${top + recapStart + (recapLines.length - 1) * recapLineH + 10}" stroke="${THEME.accent}" stroke-width="4"/>
  ${renderMath ? richTspans(recapLines, margin + 52, top + recapStart, recapLineH, `font-size="32" fill="${THEME.muted}"`, THEME.accent) : tspans(recapLines, margin + 52, top + recapStart, recapLineH, `font-size="32" fill="${THEME.muted}"`)}
  <line x1="${margin}" y1="${top + ruleOffset}" x2="${POSTER_WIDTH - margin}" y2="${top + ruleOffset}" stroke="${THEME.hairline}" stroke-width="2"/>`;

    return svgShell(`
  ${head}
  ${pager}
  ${recapSvg}
  ${textSvg}
  ${footer}
  ${brandBar()}`);
  }

  const qLines = questionLines.slice(0, 7);
  const qLineH = 84;
  const aLines = answerLines.slice(0, 11);
  const aLineH = 68;
  // Lay out from measured extents, not from a hand-tuned magic number. The Q
  // block can be 1–7 lines, and a cloze blank draws an underline 16px below
  // its baseline — with a fixed 48px gap that underline landed almost on top
  // of the divider whenever the question was short.
  const qSpan = (qLines.length - 1) * qLineH;
  const aSpan = (aLines.length - 1) * aLineH;
  const GAP_AFTER_Q = 96; // clears the underline, then air before the rule
  const A_MARK_H = 158; // badge offset + badge + gap to the answer text
  const capTop = 44; // cap height of 56px type
  const descender = 20;
  const blockH = capTop + qSpan + GAP_AFTER_Q + A_MARK_H + aSpan + descender;
  const top = bodyTop + Math.max(0, (bodyH - blockH) / 2);
  const qStartY = Math.round(top + capTop);
  const dividerY = qStartY + qSpan + GAP_AFTER_Q;
  const aBadgeTop = dividerY + 22;
  const aStartY = aBadgeTop + 136;
  const qAttrs = `font-size="56" font-weight="600" fill="${THEME.ink}"`;
  const aAttrs = `font-size="44" fill="${THEME.body}"`;

  return svgShell(`
  ${sideBadge("Q", "问题", margin, 150)}
  ${pager}
  ${renderMath ? richTspans(qLines, margin, qStartY, qLineH, qAttrs, THEME.accent) : tspans(qLines, margin, qStartY, qLineH, qAttrs)}
  <line x1="${margin}" y1="${dividerY}" x2="${POSTER_WIDTH - margin}" y2="${dividerY}" stroke="${THEME.hairline}" stroke-width="2"/>
  ${sideBadge("A", "答案", margin, aBadgeTop, 56)}
  ${renderMath ? richTspans(aLines, margin, aStartY, aLineH, aAttrs, THEME.accent) : tspans(aLines, margin, aStartY, aLineH, aAttrs)}
  ${footer}
  ${brandBar()}`);
}
