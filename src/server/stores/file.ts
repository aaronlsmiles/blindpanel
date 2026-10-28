import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { capCheck } from "./memory.js";
import { tallyRows } from "./tally.js";
import type { Caps, Row, Store } from "./types.js";

/** JSON Lines on disk, one file per study (default .blindpanel/data/<study>.jsonl). For local use. */
export function fileStore(opts: Caps & { dir?: string } = {}): Store {
  const dir = opts.dir ?? ".blindpanel/data";
  const file = (study: string) => join(dir, `${study}.jsonl`);
  const read = (study: string): Row[] =>
    existsSync(file(study))
      ? readFileSync(file(study), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row)
      : [];
  const all = () =>
    existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".jsonl")).flatMap((f) => read(f.slice(0, -6)))
      : [];
  let chain = Promise.resolve<unknown>(undefined);
  const serial = <T>(fn: () => T) => (chain = chain.then(fn, fn)) as Promise<T>;
  return {
    insert: (row) =>
      serial(() => {
        const r = capCheck(all(), row, opts);
        if (r === "ok") {
          mkdirSync(dir, { recursive: true });
          appendFileSync(file(row.study), JSON.stringify(row) + "\n");
        }
        return r;
      }),
    tally: async (study, minN) => tallyRows(study, read(study), minN),
    rows: async (study) => read(study),
    ping: async () => {},
  };
}
