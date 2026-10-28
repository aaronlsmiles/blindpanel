import { describe, expect, test } from "vitest";
import {
  alphaFromCounts, baselineAdjusted, bootstrapRho, krippendorffOrdinal, landing, nanmean, rank, spearman, spearmanPairs,
} from "../src/stats/index.js";

describe("rank and Spearman", () => {
  test("ties get the average rank", () => {
    expect(rank([1, 2, 2, 3])).toEqual([1, 2.5, 2.5, 4]);
    expect(rank([5, 5, 5])).toEqual([2, 2, 2]);
  });
  test("matches scipy.stats.spearmanr on a tied fixture", () => {
    expect(spearman([1, 2, 2, 3, 5, 5, 5, 4], [2, 1, 4, 4, 3, 5, 5, 1])).toBeCloseTo(0.5250410204321445, 14);
  });
  test("undefined (null) when either side is constant or n < 3", () => {
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(spearman([1, 2], [2, 1])).toBeNull();
  });
  test("spearmanPairs drops missing pairs", () => {
    expect(spearmanPairs([1, null, 3, 4, NaN], [1, 9, 3, 4, 2])).toEqual({ rho: 1, n: 3 });
  });
});

describe("Krippendorff's alpha, ordinal", () => {
  test("matches the release's collect.py port on a small matrix with a gap", () => {
    expect(krippendorffOrdinal([[1, 2, 3, 3], [2, 2, 3, 4], [1, 3, 3, null]])).toBeCloseTo(0.7086247086247086, 14);
  });
  test("perfect agreement is 1, no pairable values is null", () => {
    expect(krippendorffOrdinal([[1, 2, 3], [1, 2, 3]])).toBe(1);
    expect(krippendorffOrdinal([[1, null], [null, 2]])).toBeNull();
  });
  test("from per-item counts equals from the matrix", () => {
    const m = [[1, 2, 3, 3], [2, 2, 3, 4], [1, 3, 3, null]];
    const counts = [0, 1, 2, 3].map((j) => {
      const c = [0, 0, 0, 0, 0];
      for (const r of m) if (r[j] != null) c[r[j]! - 1]++;
      return c;
    });
    expect(alphaFromCounts(counts)).toBeCloseTo(krippendorffOrdinal(m)!, 14);
  });
});

describe("where you land", () => {
  const panel = [
    [5, 4, 2, 1, 3, 4],
    [4, 4, 1, 2, 3, 5],
    [5, 3, 2, 1, 2, 4],
    [3, 5, 3, 2, 4, 3],
  ];
  const raters = ["A", "B", "C", "D"];
  test("a visitor at the panel mean lands near the top; beats counts raters below you", () => {
    const you = [0, 1, 2, 3, 4, 5].map((j) => nanmean(panel.map((r) => r[j]))!);
    const l = landing({ you, panel, raters });
    expect(l.n).toBe(6);
    expect(l.of).toBe(4);
    expect(l.rho_you).toBeGreaterThan(0.9);
    expect(l.beats).toBe(l.rater_rhos.filter((r) => r.rho !== null && r.rho < l.rho_you!).length);
    expect(l.beats).toBe(3); // rater A (0.955) tracks the mean more closely than the mean itself does under LOO
    expect(l.alpha_with_you).not.toBeNull();
  });
  test("leave-one-out: each rater against the mean of the others", () => {
    const l = landing({ you: [5, 4, 2, 1, 3, 4], panel, raters });
    const others = [0, 1, 2, 3, 4, 5].map((j) => nanmean([panel[1][j], panel[2][j], panel[3][j]]));
    expect(l.rater_rhos[0]).toEqual({ rater: "A", rho: spearman(panel[0], others as number[]) });
  });
  test("only the items you rated count; constant answers give a null rho and a caveat", () => {
    const l = landing({ you: [3, 3, null, null, 3, null], panel, raters });
    expect(l.n).toBe(3);
    expect(l.rho_you).toBeNull();
    expect(l.caveats).toContain("constant");
    expect(l.caveats).toContain("small_n");
  });
  test("excluding a rater drops it from the panel", () => {
    const l = landing({ you: [5, 4, 2, 1, 3, 4], panel, raters, exclude: "A" });
    expect(l.rater_rhos.map((r) => r.rater)).toEqual(["B", "C", "D"]);
    expect(l.of).toBe(3);
  });
  test("bias and mean absolute error against the panel mean", () => {
    const you = [5, 5, 5, 5, 5, 5];
    const l = landing({ you, panel, raters });
    const means = [0, 1, 2, 3, 4, 5].map((j) => nanmean(panel.map((r) => r[j]))!);
    expect(l.bias).toBeCloseTo(means.reduce((a, m) => a + (5 - m), 0) / 6, 12);
    expect(l.mae).toBeCloseTo(l.bias, 12);
  });
  test("metric rho for you and for each rater", () => {
    const metric = { id: "m", label: "m", worse: "higher" as const, values: [0.1, 0.2, 0.9, 1.5, 0.5, null] };
    const l = landing({ you: [5, 4, 2, 1, 3, 4], panel, raters, metrics: [metric] });
    expect(l.metrics[0].rho_you).toBe(-1);
    expect(l.metrics[0].n).toBe(5);
    expect(l.metrics[0].rho_raters).toHaveLength(4);
  });
});

test("baseline-adjusted scores", () => {
  expect(baselineAdjusted([4, 2, 5], [0, 1, 0], [5, 3])).toEqual({ diffs: [-1, -1, 0], mean: -2 / 3 });
  expect(baselineAdjusted([4, null], [0, 1], [5, null]).diffs).toEqual([-1, null]);
});

test("bootstrap is deterministic for a seed", async () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8], y = [2, 1, 4, 3, 6, 5, 8, 7];
  const a = await bootstrapRho(x, y, { n: 200, seed: "s" });
  expect(await bootstrapRho(x, y, { n: 200, seed: "s" })).toEqual(a);
  expect(a.ci95[0]).toBeLessThanOrEqual(a.ci95[1]);
});
