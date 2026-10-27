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
  return 0.52;
}

/**
 * Greedy wrap into lines that fit `maxUnits`. Splits on explicit newlines
 * first; over-long lines wrap at the last breakable char when possible.
 */
// Characters that must not start a line (CJK closing punctuation etc.).
const NO_LINE_START = new Set(
  "，。；：！？、）】》」』〕…·".split(""),
);

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
 * Rich content model: { type:"text"|"math"|"blank", width, underline? }.
 * clozeMode "hide" renders cloze answers as blank underlines (question
 * side); "reveal" renders the full sentence with answers underlined
 * (answer side). TeX stays typeset in both modes.
 */
const CLOZE_MIN_BLANK_WIDTH = 96;

function buildContent(text, fontSize, renderMath, color, clozeMode) {
  const runs = [];
  const pushText = (target, value, underline = false) => {
    if (value === "") return;
    const tokens = plainCardText(value).match(/[ \t]+|\S+/g) ?? [];
    // Leading whitespace survives as a spacer run (e.g. " + $x$").
    if (/^\s/.test(value) && tokens.length > 0 && !/^\s/.test(tokens[0])) {
      tokens.unshift(" ");
    }
    for (const token of tokens) {
      // CJK sentences have no spaces: split per char so lines can break.
      // Whitespace never belongs to an underline span.
      const isSpace = /^\s+$/.test(token);
      const parts =
        !isSpace && /[㐀-鿿]/.test(token) && [...token].length > 1
          ? [...token]
          : [token];
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
      const content = line
        .map((run) => {
          if (run.type === "blank") {
            offset += run.width;
            return "";
          }
          if (run.type === "unit") {
            // Whole cloze answer (possibly containing math) as one segment.
            let inner = 0;
            const parts = run.runs
              .map((part) => {
                const svg = part.type === "math"
                  ? part.markup(x + offset + inner, baseline).replace("<svg ", `<svg ${mathAttrs} `)
                  : `<text x="${x + offset + inner}" y="${baseline}" ${attrs}>${escapeXml(part.value)}</text>`;
                inner += part.width;
                return svg;
              })
              .join("");
            offset += run.width;
            return parts;
          }
          const svg = run.type === "math"
            ? run.markup(x + offset, baseline).replace("<svg ", `<svg ${mathAttrs} `)
            : `<text x="${x + offset}" y="${baseline}" ${attrs}>${escapeXml(run.value)}</text>`;
          offset += run.width;
          return svg;
        })
        .join("");
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
  const titleLines = wrapText(title, 96, maxW).slice(0, 4);
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
 * Card poster. side="both" combines Q/A; "question" and "answer" render
 * standalone sides for cardMode="split". Content blocks are vertically
 * centered between the header and the brand bar.
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
  const pager =
    typeof index === "number" && typeof total === "number"
      ? `<text x="${POSTER_WIDTH - margin}" y="180" text-anchor="end" font-size="34" fill="${THEME.muted}">${index + 1} / ${total}</text>`
      : "";
  const footer = footerLabel
    ? `<text x="${margin}" y="${POSTER_HEIGHT - 150}" font-size="30" fill="${THEME.muted}">${escapeXml(footerLabel)}</text>`
    : "";

  const bodyTop = 300;
  const bodyBottom = POSTER_HEIGHT - 170;

  if (side !== "both") {
    const isQuestion = side === "question";
    const lines = (isQuestion ? questionLines : answerLines).slice(0, 14);
    const fontSize = isQuestion ? 56 : 44;
    const attrs = `font-size="${fontSize}" font-weight="${isQuestion ? 600 : 400}" fill="${isQuestion ? THEME.ink : THEME.body}"`;
    const lineHeight = isQuestion ? 84 : 68;
    const blockH = (lines.length - 1) * lineHeight + fontSize;
    const startY = Math.round(bodyTop + (bodyBottom - bodyTop - blockH) / 2 + fontSize);
    const textSvg = renderMath
      ? richTspans(lines, margin, startY, lineHeight, attrs, THEME.accent)
      : tspans(lines, margin, startY, lineHeight, attrs);
    return svgShell(`
  <text x="${margin}" y="180" font-size="34" fill="${THEME.accent}" font-weight="600" letter-spacing="3">${isQuestion ? "Q" : "A"}</text>
  ${pager}
  ${textSvg}
  ${footer}
  ${brandBar()}`);
  }

  const qLines = questionLines.slice(0, 7);
  const qLineH = 84;
  const aLines = answerLines.slice(0, 11);
  const aLineH = 68;
  const qH = (qLines.length - 1) * qLineH + 56;
  const aH = 90 + (aLines.length - 1) * aLineH + 44; // divider + label + text
  const blockH = qH + aH + 48;
  const startY = Math.round(bodyTop + (bodyBottom - bodyTop - blockH) / 2);
  const qStartY = startY + 56;
  const dividerY = qStartY + (qLines.length - 1) * qLineH + 48;
  const aStartY = dividerY + 108;
  const qAttrs = `font-size="56" font-weight="600" fill="${THEME.ink}"`;
  const aAttrs = `font-size="44" fill="${THEME.body}"`;

  return svgShell(`
  <text x="${margin}" y="180" font-size="34" fill="${THEME.accent}" font-weight="600" letter-spacing="3">Q</text>
  ${pager}
  ${renderMath ? richTspans(qLines, margin, qStartY, qLineH, qAttrs, THEME.accent) : tspans(qLines, margin, qStartY, qLineH, qAttrs)}
  <line x1="${margin}" y1="${dividerY}" x2="${margin + 120}" y2="${dividerY}" stroke="${THEME.accent}" stroke-width="6"/>
  <text x="${margin}" y="${dividerY + 62}" font-size="34" fill="${THEME.accent}" font-weight="600" letter-spacing="3">A</text>
  ${renderMath ? richTspans(aLines, margin, aStartY + 56, aLineH, aAttrs, THEME.accent) : tspans(aLines, margin, aStartY + 56, aLineH, aAttrs)}
  ${footer}
  ${brandBar()}`);
}
