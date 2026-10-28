import { tallyRows } from "./tally.js";
import type { Caps, InsertResult, Row, Store } from "./types.js";

export function capCheck(rows: Row[], row: Row, caps: Caps): InsertResult {
  if (rows.some((r) => r.study === row.study && r.session === row.session)) return "duplicate";
  if (rows.length >= (caps.totalCap ?? 20000)) return "cap";
  if (rows.filter((r) => r.received_day === row.received_day).length >= (caps.dailyCap ?? 500)) return "cap";
  return "ok";
}

/** In-process store for local development and tests. Forgets everything on restart. */
export function memoryStore(caps: Caps = {}): Store {
  const rows: Row[] = [];
  return {
    async insert(row) {
      const r = capCheck(rows, row, caps);
      if (r === "ok") rows.push(structuredClone(row));
      return r;
    },
    async tally(study, minN) {
      return tallyRows(study, rows, minN);
    },
    async rows(study) {
      return rows.filter((r) => r.study === study).map((r) => structuredClone(r));
    },
    async ping() {},
  };
}
