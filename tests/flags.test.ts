import { beforeAll, describe, expect, test } from "vitest";
import type { Study, Submission } from "../src/core/types.js";
import { flagsFor } from "../src/server/flags.js";
import { loadExample, SESSION } from "./helpers.js";

let synthetic: Study; // look and same are ordinal
let choice: Study; // every question is a choice question
let mixed: Study; // synthetic with `same` turned into a choice scale
beforeAll(async () => {
  ({ study: synthetic } = await loadExample("synthetic"));
  ({ study: choice } = await loadExample("choice"));
  mixed = structuredClone(synthetic);
  mixed.scales.same = { ...mixed.scales.same, kind: "choice" };
});

const sub = (st: Study, clips: Record<string, Record<string, number>>, duration_s = 600): Submission => ({
  format: "blindpanel/1",
  study: st.id,
  instrument: st.instrument,
  session: SESSION,
  order: { baseline: [], clips: Object.keys(clips) },
  answers: { baseline: {}, clips },
  delivery: { autoplay: true, keyboard: false, duration_s, ui: "t" },
});

describe("flagsFor", () => {
  test("an ordinal study still flags a straight line, and not a varied one", () => {
    expect(flagsFor(synthetic, sub(synthetic, { a: { look: 3, same: 3 }, b: { look: 3, same: 3 } }))).toEqual(["straightline"]);
    expect(flagsFor(synthetic, sub(synthetic, { a: { look: 3, same: 3 }, b: { look: 4, same: 3 } }))).toEqual([]);
  });
  test("identical answers to choice questions are not straightlining", () => {
    expect(flagsFor(choice, sub(choice, { a: { trigger: 1, action: 1 }, b: { trigger: 1, action: 1 } }))).toEqual([]);
  });
  test("in a mixed study only the ordinal questions count", () => {
    // look never varies, same does: the ordinal answers are a straight line
    expect(flagsFor(mixed, sub(mixed, { a: { look: 3, same: 1 }, b: { look: 3, same: 4 } }))).toEqual(["straightline"]);
    // same never varies, look does: the choice answers do not count
    expect(flagsFor(mixed, sub(mixed, { a: { look: 2, same: 4 }, b: { look: 5, same: 4 } }))).toEqual([]);
  });
  test("too_fast still applies to choice studies", () => {
    expect(flagsFor(choice, sub(choice, { a: { trigger: 1, action: 2 }, b: { trigger: 3, action: 4 } }, 0))).toEqual(["too_fast"]);
  });
});
