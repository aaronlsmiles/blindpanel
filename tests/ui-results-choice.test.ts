// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { participantOrder } from "../src/core/order.js";
import { buildSubmission } from "../src/core/payload.js";
import type { Reveal, Study } from "../src/core/types.js";
import { mountResults } from "../src/ui/results.js";
import { loadExample, SESSION } from "./helpers.js";
import { cleanup, track } from "./ui-helpers.js";

afterEach(cleanup);
let study: Study, reveal: Reveal;
beforeAll(async () => {
  ({ study, reveal } = await loadExample("synthetic"));
  // the same study with its second clip question turned into a choice question (five options)
  study = structuredClone(study);
  study.scales.same = { ...study.scales.same, kind: "choice" };
});
const text = () => document.body.textContent ?? "";

describe("mountResults with a choice question beside an ordinal one", () => {
  test("only the ordinal question gets a 'where you land' section and a crowd line", async () => {
    const order = await participantOrder(study, SESSION);
    const b = order.blocks[0];
    const submission = buildSubmission(study, {
      session: SESSION, order, blocks: 1,
      answers: {
        baseline: Object.fromEntries(b.baseline.map((p) => [p, { drawing: 4 }])),
        clips: Object.fromEntries(b.clips.map((c, i) => [c, { look: 2 + i, same: 3 }])),
      },
      delivery: { autoplay: true, keyboard: false, seconds: 60 },
    });
    const el = document.createElement("div");
    document.body.append(el);
    const tally = {
      study: "synthetic",
      n_sessions: 4,
      items: Object.fromEntries(
        study.parts.clips.items.map((i) => [i.code, { look: { n: 4, counts: [0, 1, 2, 1, 0] }, same: { n: 4, counts: [1, 1, 1, 1, 0] } }]),
      ),
    };
    const c = track(mountResults(el, { study, reveal, submission, loadTally: async () => tally }));
    expect(Object.keys(c.getState().landings)).toEqual(["look"]);
    expect(document.querySelector('.bp-section[data-q="look"]')).not.toBeNull();
    expect(document.querySelector('.bp-section[data-q="same"]')).toBeNull();
    await vi.waitFor(() => expect(text()).toContain("4 visitors have added"));
    expect(text()).toContain("Still a line drawing: the crowd's average");
    expect(text()).not.toContain("Same picture throughout: the crowd's average");
  });
});
