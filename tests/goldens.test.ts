// StillDrawn's published human-check values, reproduced from this repo's own
// copy of the reference data (examples/stilldrawn). Tolerance 1e-12.
import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { compile } from "../src/core/compile.js";
import { StudyConfig } from "../src/core/schema.js";
import { krippendorffOrdinal, nanmean, spearmanPairs } from "../src/stats/index.js";

const DIR = join(import.meta.dirname, "../examples/stilldrawn");
const io = {
  readText: (p: string) => readFileSync(join(DIR, p), "utf8"),
  listDir: (p: string) => readdirSync(join(DIR, p)),
};
const compiled = compile(StudyConfig.parse(parse(io.readText("study.yaml"))), io);

const GOLD_ALPHA = { register: 0.2087697206147856, sameness: 0.4776558778120862 };
const GOLD_RHO: Record<string, Record<string, number>> = {
  register: {
    line_chamfer_mean_px: -0.23942844039738934,
    tone_variance: -0.31852725738345344,
    edge_abs_slope: -0.6004593379051246,
    style_terminal: -0.4320286053858256,
    closure_abs_terminal: -0.45544274309030214,
  },
  sameness: {
    line_chamfer_mean_px: -0.41815417222245693,
    tone_variance: -0.5447937319730509,
    edge_abs_slope: -0.7380080869604303,
    style_terminal: -0.6404639853027505,
    closure_abs_terminal: -0.5708976492368084,
  },
};
const close = (a: number | null, b: number) => expect(Math.abs((a as number) - b)).toBeLessThan(1e-12);

describe("StillDrawn goldens", async () => {
  const ref = (await compiled).reveal.reference!;

  test("six raters, 20 clips, 14 panels", () => {
    expect(ref.raters).toEqual(["AARON", "R2", "R3", "R4", "R5", "R6"]);
    expect(ref.ratings.register.every((r) => r.length === 20)).toBe(true);
    expect(ref.ratings.hand_drawn[0]).toHaveLength(14);
  });

  test.each(Object.entries(GOLD_ALPHA))("alpha %s", (q, gold) => {
    close(krippendorffOrdinal(ref.ratings[q]), gold);
    expect(ref.published_alpha?.[q]).toBe(gold);
  });

  for (const [q, metrics] of Object.entries(GOLD_RHO)) {
    test.each(Object.entries(metrics))(`rho(%s, mean ${q})`, (id, gold) => {
      const m = ref.metrics.find((x) => x.id === id)!;
      const means = ref.ratings[q][0].map((_, j) => nanmean(ref.ratings[q].map((r) => r[j])));
      const { rho, n } = spearmanPairs(m.values, means);
      close(rho, gold);
      expect(n).toBe(id === "tone_variance" ? 16 : 20);
      expect(m.published?.[q].rho).toBe(gold);
    });
  }
});
