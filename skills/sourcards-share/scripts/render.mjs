#!/usr/bin/env node
/**
 * Render Xiaohongshu share posters from a share-spec JSON file.
 *
 * Usage:
 *   node render.mjs <share-spec.json> [--out <dir>] [--scale <1|2>]
 *
 * share-spec.json shape:
 * {
 *   "kicker": "机器学习",                // optional, cover chip (deck/category)
 *   "title": "偏差-方差权衡，一篇讲透",    // cover title (XHS post title hook)
 *   "countLabel": "3 张卡片",            // optional, defaults from cards length
 *   "layout": "cover+cards",             // "cover+cards" (default) | "cards"
 *   "cardMode": "split",                  // default: separate q/a pages; "combined" = one page
 *   "footerLabel": "偏差-方差权衡",        // optional small footer on card pages
 * }
 *
 * Output: <out>/01-cover.png, 02-card.png ... plus a copy of the spec.
 * PNGs are 1242x1660 (--scale 2 → 2484x3320 for crisper upload).
 *
 * sharp resolution: local node_modules → global npm root → actionable error.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { buildCardSvg, buildCoverSvg } from "./poster-svg.mjs";
import { loadMathRenderer } from "./math-svg.mjs";


async function loadSharp() {
  // Resolve from CWD first (agent workspaces usually install sharp there),
  // then global npm root. Plain import() would resolve relative to THIS file.
  const attempts = [
    () => createRequire(path.resolve("noop.js"))("sharp"),
    () =>
      createRequire(
        path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "noop.js"),
      )("sharp"),
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      // try next source
    }
  }
  console.error(
    "sharp not found. Install it once, either:\n" +
      "  npm i -g sharp        # global, reusable across sessions\n" +
      "  pnpm add sharp        # or in the current workspace\n",
  );
  process.exit(1);
}
function parseArgs(argv) {
  const args = { spec: null, out: null, scale: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--scale") args.scale = Number(argv[++i]) || 1;
    else if (!a.startsWith("-")) args.spec = a;
    else {
      console.error(`unknown flag: ${a}`);
      process.exit(2);
    }
  }
  if (!args.spec) {
    console.error("usage: node render.mjs <share-spec.json> [--out <dir>] [--scale 2]");
    process.exit(2);
  }
  return args;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const specPath = path.resolve(args.spec);
  const spec = JSON.parse(readFileSync(specPath, "utf8"));

  if (!Array.isArray(spec.cards) || spec.cards.length === 0) {
    console.error("share-spec.json must contain a non-empty cards array");
    process.exit(2);
  }
  if (!spec.title || typeof spec.title !== "string") {
    console.error("share-spec.json must contain a title string");
    process.exit(2);
  }

  const outDir = path.resolve(
    args.out ?? path.join(path.dirname(specPath), "out"),
  );
  mkdirSync(outDir, { recursive: true });

  const sharp = await loadSharp();
  const renderMath = await loadMathRenderer();
  const density = args.scale >= 2 ? 2 : 1;

  const jobs = [];
  const layout = spec.layout ?? "cover+cards";
  if (layout !== "cards") {
    jobs.push({
      name: `${pad(1)}-cover.png`,
      svg: buildCoverSvg({
        kicker: spec.kicker ?? "",
        title: spec.title,
        countLabel: spec.countLabel ?? `${spec.cards.length} 张卡片`,
      }),
    });
  }
  const split = spec.cardMode !== "combined"; // split is the default
  let page = jobs.length;
  spec.cards.forEach((card, i) => {
    const sides = split ? ["question", "answer"] : ["both"];
    for (const side of sides) {
      const suffix = side === "question" ? "q" : side === "answer" ? "a" : "card";
      jobs.push({
        name: `${pad(++page)}-${suffix}.png`,
        svg: buildCardSvg({
          index: i,
          total: spec.cards.length,
          question: card.question,
          answer: card.answer,
          footerLabel: spec.footerLabel ?? "",
          renderMath,
          side,
        }),
      });
    }
  });

  for (const job of jobs) {
    const target = path.join(outDir, job.name);
    await sharp(Buffer.from(job.svg), { density: 144 * density })
      .resize({
        width: 1242 * density,
        height: 1660 * density,
        fit: "fill",
      })
      .png()
      .toFile(target);
    console.log(`wrote ${target}`);
  }

  writeFileSync(
    path.join(outDir, "share-spec.used.json"),
    JSON.stringify(spec, null, 2),
  );
  console.log(`done: ${jobs.length} image(s) → ${outDir}`);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
