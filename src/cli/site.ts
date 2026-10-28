import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Loaded } from "./load.js";

/** dist/, where the compiled browser modules live (also when this file runs from src/ under tests) */
const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DIST = basename(here) === "src" ? resolve(here, "..", "dist") : here;

/** The browser modules the standalone page needs: app.js and what it imports, nothing else. */
export function browserModules(entry = "ui/app.js"): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const rel = queue.shift()!;
    if (seen.has(rel)) continue;
    seen.add(rel);
    const src = readFileSync(join(DIST, rel), "utf8");
    for (const m of src.matchAll(/(?:import|export)\s[^"']*?from\s*["'](\.{1,2}\/[^"']+)["']|import\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const spec = m[1] ?? m[2];
      queue.push(relative(DIST, resolve(dirname(join(DIST, rel)), spec)));
    }
  }
  return [...seen].sort();
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function indexHtml(title: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<link rel="stylesheet" href="blindpanel/ui/style.css">
<style>
  html { background: #e2e2de; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { html { background: #1c1915; } }
  body { margin: 0; padding: 24px 16px 48px; }
  .bp-again { margin-top: 16px; }
</style>
</head>
<body>
<main id="app"></main>
<script type="module">
  import { bootStandalone } from "./blindpanel/ui/app.js";
  bootStandalone(document.getElementById("app"));
</script>
</body>
</html>
`;
}

/** Writes the standalone site: index.html, study.json, reveal.json, the kit's browser modules and local media. */
export function buildSite(l: Loaded, out: string) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "index.html"), indexHtml(l.study.title));
  writeFileSync(join(out, "study.json"), JSON.stringify(l.study) + "\n");
  writeFileSync(join(out, l.study.endpoints.reveal.replace(/^\.?\//, "")), JSON.stringify(l.reveal) + "\n");
  for (const rel of [...browserModules(), "ui/style.css"]) {
    const to = join(out, "blindpanel", rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(DIST, rel), to);
  }
  for (const m of l.media) {
    const to = join(out, m.to);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(l.dir, m.from), to);
  }
  return out;
}
