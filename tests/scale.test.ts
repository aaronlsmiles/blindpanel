import { describe, expect, test } from "vitest";
import { isChoice, keyValue, maxFor, ORDINAL_MAX, scaleMax, valueKey } from "../src/core/scale.js";

describe("scale helpers", () => {
  test("ORDINAL_MAX is 5, and maxFor: 5 for an ordinal scale whatever its labels, the option count for a choice scale", () => {
    expect(ORDINAL_MAX).toBe(5);
    expect(maxFor("ordinal", ["a", "b", "c", "d", "e"])).toBe(5);
    expect(maxFor("ordinal", [])).toBe(5);
    expect(maxFor("choice", ["a", "b", "c"])).toBe(3);
    expect(maxFor("choice", Array.from({ length: 12 }, (_, i) => String(i)))).toBe(12);
  });
  test("isChoice: only kind choice; a scale from before 0.2 (no kind) is ordinal", () => {
    expect(isChoice({ kind: "choice" })).toBe(true);
    expect(isChoice({ kind: "ordinal" })).toBe(false);
    expect(isChoice({} as never)).toBe(false);
    expect(isChoice(undefined)).toBe(false);
  });
  test("scaleMax: the scale's max; 5 for a scale from before 0.2", () => {
    expect(scaleMax({ max: 12 })).toBe(12);
    expect(scaleMax({ max: 5 })).toBe(5);
    expect(scaleMax({} as never)).toBe(5);
    expect(scaleMax(undefined)).toBe(5);
  });
  test("keyValue: 1–9 are themselves, 0 is the tenth, anything else is not an answer key", () => {
    expect(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map(keyValue)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(["a", "Enter", "10", "", " "].map(keyValue)).toEqual([null, null, null, null, null]);
  });
  test("valueKey: the key hint for an option; the 11th and 12th have none", () => {
    expect([1, 5, 9, 10, 11, 12].map(valueKey)).toEqual(["1", "5", "9", "0", null, null]);
  });
});
