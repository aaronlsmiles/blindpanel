import { describe, expect, test } from "vitest";
import { krippendorffNominal, krippendorffOrdinal } from "../src/stats/index.js";

describe("krippendorffNominal", () => {
  test("two raters, four items: 8/15 (hand-checked, see the plan)", () => {
    expect(krippendorffNominal([[1, 1, 2, 2], [1, 2, 2, 2]])).toBeCloseTo(8 / 15, 12);
  });
  test("an item with a single rating is skipped: α = 0", () => {
    expect(krippendorffNominal([[1, 2, null], [1, 1, 2]])).toBeCloseTo(0, 12);
  });
  test("three raters, five items: 9/37", () => {
    expect(krippendorffNominal([[1, 2, 3, 1, 2], [1, 3, 3, 2, 2], [2, 2, 3, 1, 1]])).toBeCloseTo(9 / 37, 12);
  });
  test("up to twelve options: 8/13", () => {
    expect(krippendorffNominal([[12, 11, 10], [12, 11, 9]])).toBeCloseTo(8 / 13, 12);
  });
  test("perfect agreement is 1, whatever the option numbers", () => {
    expect(krippendorffNominal([[1, 2, 3], [1, 2, 3]])).toBe(1);
    expect(krippendorffNominal([[7, 12, 3], [7, 12, 3]])).toBe(1);
  });
  test("no variation, or nothing pairable, is null", () => {
    expect(krippendorffNominal([[1, 1], [1, 1]])).toBeNull();
    expect(krippendorffNominal([[1, null], [null, 2]])).toBeNull();
    expect(krippendorffNominal([])).toBeNull();
  });
  test("the option numbers carry no order: relabelling them changes nothing, unlike the ordinal α", () => {
    const a = [[1, 2, 3, 1, 2], [1, 3, 3, 2, 2], [2, 2, 3, 1, 1]];
    const relabel: Record<number, number> = { 1: 3, 2: 1, 3: 2 };
    const b = a.map((row) => row.map((v) => relabel[v]));
    expect(krippendorffNominal(b)).toBeCloseTo(krippendorffNominal(a)!, 12);
    expect(Math.abs(krippendorffOrdinal(b)! - krippendorffOrdinal(a)!)).toBeGreaterThan(0.1);
  });
});
