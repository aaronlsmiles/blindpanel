import type { Row, Tally } from "./types.js";

/** The reference tally; sql/schema.sql's blindpanel.tally() is tested against it. */
export function tallyRows(study: string, rows: Row[], minN: number): Tally {
  const kept = rows.filter((r) => r.study === study && r.flags.length === 0);
  const items: Tally["items"] = {};
  for (const r of kept) {
    for (const part of [r.answers.baseline, r.answers.clips]) {
      for (const [code, qs] of Object.entries(part)) {
        for (const [q, v] of Object.entries(qs)) {
          const cell = ((items[code] ??= {})[q] ??= { n: 0, counts: [0, 0, 0, 0, 0] });
          cell.n++;
          cell.counts[v - 1]++;
        }
      }
    }
  }
  for (const [code, qs] of Object.entries(items)) {
    for (const [q, cell] of Object.entries(qs)) if (cell.n < minN) delete qs[q];
    if (!Object.keys(qs).length) delete items[code];
  }
  return { study, n_sessions: kept.length, items };
}
