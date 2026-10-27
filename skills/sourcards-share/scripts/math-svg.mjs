import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

/** Create an offline TeX → SVG renderer. Resolved like sharp: CWD, then global. */
export async function loadMathRenderer() {
  let req;
  for (const root of [
    path.resolve("noop.js"),
    path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "noop.js"),
  ]) {
    try {
      req = createRequire(root);
      req.resolve("mathjax-full/js/mathjax.js");
      break;
    } catch {
      req = null;
    }
  }
  if (!req) {
    throw new Error(
      "mathjax-full not found. Install it once:\n" +
        "  npm i -g sharp mathjax-full\n" +
        "  # or: pnpm add sharp mathjax-full in the current workspace",
    );
  }

  const { mathjax } = await import(req.resolve("mathjax-full/js/mathjax.js"));
  const { TeX } = await import(req.resolve("mathjax-full/js/input/tex.js"));
  const { SVG } = await import(req.resolve("mathjax-full/js/output/svg.js"));
  const { liteAdaptor } = await import(
    req.resolve("mathjax-full/js/adaptors/liteAdaptor.js")
  );
  const { RegisterHTMLHandler } = await import(
    req.resolve("mathjax-full/js/handlers/html.js")
  );
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const document = mathjax.document("", {
    InputJax: new TeX({ packages: ["base", "ams"] }),
    OutputJax: new SVG({ fontCache: "none" }),
  });

  return function renderMath(tex, { fontSize, color }) {
    // MathJax uses 1000 viewBox units per em at the requested font size.
    const output = adaptor.outerHTML(
      document.convert(tex, { display: false }),
    );
    const match = output.match(/<svg([^>]*)>([\s\S]*)<\/svg>/);
    const viewBox = match?.[1].match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number);
    if (!match || viewBox?.length !== 4) {
      throw new Error(`MathJax did not produce SVG for: ${tex}`);
    }
    const [, , viewWidth, viewHeight] = viewBox;
    const scale = fontSize / 1000;
    const width = viewWidth * scale;
    const height = viewHeight * scale;

    const verticalAlign = Number(
      match[1].match(/vertical-align:\s*(-?[\d.]+)ex/)?.[1] ?? 0,
    ) * fontSize * 0.5;
    const attributes = match[1].replace(/\s(?:width|height)="[^"]*"/g, "");
    return {
      width,
      height,
      markup: (x, baseline) =>
        `<svg${attributes} x="${x}" y="${baseline - height - verticalAlign}" width="${width}" height="${height}" color="${color}">${match[2]}</svg>`,
    };
  };
}
