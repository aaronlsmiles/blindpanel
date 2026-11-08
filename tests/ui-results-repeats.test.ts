// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { originalClipCodes, participantOrder } from "../src/core/order.js";
import { buildSubmission } from "../src/core/payload.js";
import type { Reveal, Study, Submission } from "../src/core/types.js";
import { mountResults } from "../src/ui/results.js";
import { landing } from "../src/stats/landing.js";
import { krippendorffOrdinal } from "../src/stats/krippendorff.js";
import { loadExample, SESSION, withSyntheticRepeat } from "./helpers.js";
import { cleanup, track } from "./ui-helpers.js";

afterEach(cleanup);
let study: Study, reveal: Reveal;
beforeAll(async () => {
  ({ study, reveal } = await loadExample("synthetic", withSyntheticRepeat));
});

/** the originals score 2, 3 and 4 (in study order), the repeat 5; both stills 4 */
async function submission(): Promise<Submission> {
  const order = await participantOrder(study, SESSION);
  const alias = study.parts.clips.repeats!.items[0].alias;
  const own = originalClipCodes(study);
  const score = (c: string) => (c === alias ? 5 : 2 + own.indexOf(c));
  return buildSubmission(study, {
    session: SESSION, order, blocks: 1,
    answers: {
      baseline: Object.fromEntries(order.blocks[0].baseline.map((p) => [p, { drawing: 4 }])),
      clips: Object.fromEntries(order.clips.map((c) => [c, { look: score(c), same: score(c) }])),
    },
    delivery: { autoplay: true, keyboard: false, seconds: 60 },
  });
}
async function mount() {
  const sub = await submission();
  const el = document.createElement("div");
  document.body.append(el);
  return { sub, c: track(mountResults(el, { study, reveal, submission: sub })) };
}
const text = () => document.body.textContent ?? "";

describe("mountResults with an attention repeat: the repeat's row is left out", () => {
  test("n, the small-n caveat and α with you added count the original clips only", async () => {
    const { sub, c } = await mount();
    const ref = reveal.reference!;
    const yours = originalClipCodes(study).map((x) => sub.answers.clips[x].look);
    const l = c.getState().landings.look;
    expect(l.n).toBe(3);
    expect(l).toEqual(landing({ you: yours, panel: ref.ratings.look, raters: ref.raters, metrics: ref.metrics }, "look"));
    expect(l.alpha_with_you).toBe(krippendorffOrdinal([...ref.ratings.look, yours]));
    expect(text()).toContain("You rated 3 clips.");
    expect(text()).not.toContain("You rated 4 clips.");
  });
  test("the strip has one row per original clip, none for the repeat", async () => {
    const { sub } = await mount();
    const shownAt = sub.order.clips.indexOf(study.parts.clips.repeats!.items[0].alias) + 1;
    for (const q of ["look", "same"]) {
      const rows = [...document.querySelectorAll(`.bp-section[data-q="${q}"] .bp-strip .bp-row`)];
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.querySelector(".bp-row-n")!.textContent)).not.toContain(`Clip ${shownAt}`);
    }
  });
  test("the baseline-adjusted mean leaves the repeat out", async () => {
    await mount();
    // 2, 3 and 4 against stills of 4: 1.0 lower on average (with the repeat's 5 it would read 0.5)
    expect(text()).toContain("You scored the clips 1.0 points lower than your own scores for their stills, on average.");
  });
});
