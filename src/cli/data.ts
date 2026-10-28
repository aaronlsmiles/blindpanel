import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileStore } from "../server/stores/file.js";
import { supabaseStore } from "../server/stores/supabase.js";
import type { Row, Store } from "../server/stores/types.js";
import { krippendorffOrdinal, nanmean, spearmanPairs } from "../stats/index.js";
import type { Loaded } from "./load.js";
import { UsageError } from "./load.js";

export function openStore(kind: string | undefined, dataDir?: string): Store {
  if (!kind || kind === "file") return fileStore({ dir: dataDir });
  if (kind === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new UsageError("set SUPABASE_URL and SUPABASE_SECRET_KEY (e.g. through `op run --env-file=…`)");
    return supabaseStore({ url, key });
  }
  throw new UsageError(`unknown store: ${kind} (use file or supabase)`);
}

/**
 * Writes one ratings-V0001.json… per visitor, in the reference shape
 * ({rater, instrument, ratings: [{clip, <question>…}], baseline: [{panel, <question>}]}),
 * items keyed by their `ref` and listed in the order the visitor saw them, plus a tidy CSV.
 * Session UUIDs are never exported.
 */
export function exportRows(l: Loaded, rows: Row[], out: string) {
  mkdirSync(out, { recursive: true });
  const csv = ["visitor,instrument,part,position,item,question,score,flags"];
  rows.forEach((r, i) => {
    const visitor = `V${String(i + 1).padStart(4, "0")}`;
    const file = {
      rater: visitor,
      instrument: r.instrument,
      ratings: r.order.clips.map((c) => ({ clip: l.refs.clips[c] ?? c, ...r.answers.clips[c] })),
      baseline: r.order.baseline.map((p) => ({ panel: l.refs.panels[p] ?? p, ...r.answers.baseline[p] })),
      flags: r.flags,
    };
    writeFileSync(join(out, `ratings-${visitor}.json`), JSON.stringify(file, null, 1) + "\n");
    for (const [part, order, refs] of [
      ["clips", r.order.clips, l.refs.clips],
      ["baseline", r.order.baseline, l.refs.panels],
    ] as const) {
      order.forEach((code, pos) => {
        for (const [q, v] of Object.entries(r.answers[part][code] ?? {}))
          csv.push([visitor, r.instrument, part, pos + 1, refs[code] ?? code, q, v, r.flags.join(" ")].join(","));
      });
    }
  });
  writeFileSync(join(out, "ratings.csv"), csv.join("\n") + "\n");
  return rows.length;
}

/** The same numbers the page shows, for the crowd as a whole. */
export function report(l: Loaded, rows: Row[]): string {
  const kept = rows.filter((r) => r.flags.length === 0 && r.instrument === l.study.instrument);
  const codes = l.study.parts.clips.items.map((i) => i.code);
  const ref = l.reveal.reference;
  const lines = [
    `${l.study.title} (${l.study.id}, instrument ${l.study.instrument})`,
    `${rows.length} submissions; ${kept.length} unflagged on the current instrument; ${rows.length - kept.length} left out`,
  ];
  for (const q of l.study.questions.filter((x) => x.part === "clips")) {
    const crowd = kept.map((r) => codes.map((c) => r.answers.clips[c]?.[q.id] ?? null));
    const crowdMean = codes.map((_, j) => nanmean(crowd.map((r) => r[j])));
    lines.push("", `${q.short ?? q.id}:`);
    lines.push(`  crowd α ${fmt(krippendorffOrdinal(crowd))} over ${crowdMean.filter((m) => m !== null).length} clips`);
    if (ref) {
      const panelMean = codes.map((_, j) => nanmean(ref.ratings[q.id].map((r) => r[j])));
      lines.push(`  panel α ${fmt(krippendorffOrdinal(ref.ratings[q.id]))}; crowd mean vs panel mean ρ ${fmt(spearmanPairs(crowdMean, panelMean).rho)}`);
      for (const m of ref.metrics) {
        const c = spearmanPairs(m.values, crowdMean);
        const pub = m.published?.[q.id];
        lines.push(`  ${m.label}: crowd ρ ${fmt(c.rho)} (n ${c.n})${pub ? `; panel, published ρ ${fmt(pub.rho)} (n ${pub.n})` : ""}`);
      }
    }
  }
  return lines.join("\n");
}

const fmt = (v: number | null) => (v === null ? "n/a" : v.toFixed(3));
