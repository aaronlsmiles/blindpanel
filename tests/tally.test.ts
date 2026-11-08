import { describe, expect, test } from "vitest";
import { tallyRows } from "../src/server/stores/tally.js";
import type { Row } from "../src/server/stores/types.js";

const row = (n: number, clips: Row["answers"]["clips"]): Row => ({
  study: "s", instrument: "1", session: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  order: { baseline: [], clips: Object.keys(clips) },
  answers: { baseline: {}, clips },
  delivery: { autoplay: true, keyboard: false, duration_s: 60, ui: "t" }, flags: [], received_day: "2026-10-30",
});

describe("tallyRows", () => {
  test("ordinal answers still give five counts", () => {
    const t = tallyRows("s", [row(1, { c1: { q: 2 } }), row(2, { c1: { q: 5 } })], 1);
    expect(t.items.c1.q).toEqual({ n: 2, counts: [0, 1, 0, 0, 1] });
  });
  test("choice answers up to 12 are counted; counts grow to the highest option chosen", () => {
    const t = tallyRows("s", [row(1, { c1: { q: 2 } }), row(2, { c1: { q: 2 } }), row(3, { c1: { q: 12 } })], 1);
    expect(t.items.c1.q).toEqual({ n: 3, counts: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] });
  });
  test("a cell whose highest option is 7 has seven counts", () => {
    const t = tallyRows("s", [row(1, { c1: { q: 7 } })], 1);
    expect(t.items.c1.q.counts).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });
  test("cells under the minimum are left out", () => {
    expect(tallyRows("s", [row(1, { c1: { q: 9 } })], 2).items).toEqual({});
  });
});
