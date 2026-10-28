// Copies non-TypeScript assets into dist/ after tsc.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

for (const [from, to] of [["src/ui/style.css", "dist/ui/style.css"]]) {
  if (!existsSync(from)) continue;
  mkdirSync(to.replace(/\/[^/]+$/, ""), { recursive: true });
  copyFileSync(from, to);
}
