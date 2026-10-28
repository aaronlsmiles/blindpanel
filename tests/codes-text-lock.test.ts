import { describe, expect, test } from "vitest";
import { assignCodes, opaqueCode } from "../src/core/codes.js";
import { parseBold, plainText, hasMarkup } from "../src/core/text.js";
import { canonicalJson, instrumentText, textHash } from "../src/core/lock.js";

describe("opaque codes", () => {
  test("shape, stability and seed dependence", async () => {
    const a = await opaqueCode("seed-1", "clip", "cu-line-3_campush_h3");
    expect(a).toMatch(/^c[0-9a-hjkmnp-tv-z]{5}$/);
    expect(await opaqueCode("seed-1", "clip", "cu-line-3_campush_h3")).toBe(a);
    expect(await opaqueCode("seed-2", "clip", "cu-line-3_campush_h3")).not.toBe(a);
    expect(await opaqueCode("seed-1", "panel", "cu-line-3")).toMatch(/^p/);
  });
  test("assignCodes maps every id and refuses collisions", async () => {
    const m = await assignCodes("s", "clip", ["a", "b", "c"]);
    expect(Object.keys(m)).toEqual(["a", "b", "c"]);
    expect(new Set(Object.values(m)).size).toBe(3);
    await expect(assignCodes("s", "clip", ["a", "a"])).rejects.toThrow(/duplicate/);
  });
});

describe("wording markup", () => {
  test("**bold** only", () => {
    expect(parseBold("a **b** c")).toEqual([{ t: "a " }, { t: "b", b: true }, { t: " c" }]);
    expect(parseBold("**x**")).toEqual([{ t: "x", b: true }]);
    expect(plainText("Count **only** new things")).toBe("Count only new things");
  });
  test("HTML is detected", () => {
    expect(hasMarkup("a <b>b</b>")).toBe(true);
    expect(hasMarkup("x < 3 and y > 2")).toBe(false);
  });
});

describe("instrument lock", () => {
  const study = {
    scales: { s: { min: 1, max: 5, labels: ["1", "2", "3", "4", "5"] } },
    questions: [{ id: "q", part: "clips", text: "Is it **same**?", notes: ["n"], intro_notes: [], scale: "s" }],
    parts: { baseline: null, clips: { intro: ["i"], watch_note: "w" } },
  };
  test("canonical JSON ignores key order", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe('{"a":[{"c":2,"d":1}],"b":1}');
  });
  test("hash is stable and moves with one character", async () => {
    const h = await textHash(instrumentText(study as never));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await textHash(instrumentText(structuredClone(study) as never))).toBe(h);
    const moved = structuredClone(study);
    moved.scales.s.labels[2] = "3.";
    expect(await textHash(instrumentText(moved as never))).not.toBe(h);
  });
});
