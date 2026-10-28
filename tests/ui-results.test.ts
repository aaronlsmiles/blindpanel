// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { participantOrder } from "../src/core/order.js";
import { buildSubmission } from "../src/core/payload.js";
import type { Reveal, Study, Submission } from "../src/core/types.js";
import { mountResults } from "../src/ui/results.js";
import { landing } from "../src/stats/landing.js";
import { loadExample, SESSION } from "./helpers.js";
import { cleanup, track } from "./ui-helpers.js";

afterEach(cleanup);
let study: Study, reveal: Reveal, sd: { study: Study; reveal: Reveal };
beforeAll(async () => {
  ({ study, reveal } = await loadExample("synthetic"));
  const s = await loadExample("stilldrawn");
  sd = { study: s.study, reveal: s.reveal };
});

async function sub(st: Study, score: (code: string, q: string) => number, blocks = 1): Promise<Submission> {
  const order = await participantOrder(st, SESSION);
  const used = order.blocks.slice(0, blocks);
  const q = (part: string) => st.questions.filter((x) => x.part === part).map((x) => x.id);
  return buildSubmission(st, {
    session: SESSION, order, blocks,
    answers: {
      baseline: Object.fromEntries(used.flatMap((b) => b.baseline).map((p) => [p, Object.fromEntries(q("baseline").map((id) => [id, 4]))])),
      clips: Object.fromEntries(used.flatMap((b) => b.clips).map((c) => [c, Object.fromEntries(q("clips").map((id) => [id, score(c, id)]))])),
    },
    delivery: { autoplay: true, keyboard: false, seconds: 300 },
  });
}
function mount(o: Partial<Parameters<typeof mountResults>[1]> & { study: Study; reveal: Reveal; submission: Submission }) {
  const el = document.createElement("div");
  document.body.append(el);
  return track(mountResults(el, o));
}
const text = () => document.body.textContent ?? "";

describe("mountResults (StillDrawn)", () => {
  test("a visitor who answers with the panel's mean lands near the top and sees the reveal", async () => {
    const ref = sd.reveal.reference!;
    const codes = sd.study.parts.clips.items.map((i) => i.code);
    const mean = (q: string, c: string) => {
      const j = codes.indexOf(c);
      const v = ref.ratings[q].map((r) => r[j]).filter((x): x is number => x !== null);
      return Math.min(5, Math.max(1, Math.round(v.reduce((a, b) => a + b, 0) / v.length)));
    };
    const submission = await sub(sd.study, (c, q) => mean(q, c));
    const c = mount({ ...sd, submission });
    const l = c.getState().landings;
    expect(Object.keys(l)).toEqual(["register", "sameness"]);
    expect(l.register.n).toBe(8);
    // the numbers on screen are the stats module's numbers
    const yours = codes.map((x) => submission.answers.clips[x]?.register ?? null);
    expect(l.register).toEqual(landing({ you: yours, panel: ref.ratings.register, raters: ref.raters, metrics: ref.metrics }, "register"));
    expect(document.querySelectorAll('[data-bp="headline"]')).toHaveLength(2);
    expect(text()).toMatch(/You agree with the panel's average more closely than/);
    expect(document.querySelectorAll('.bp-section[data-q="register"] .bp-strip .bp-row')).toHaveLength(8);
    expect(text()).toMatch(/Gen-4\.5|Gen-4 Turbo|Wan 2\.2|LTX-2\.3|H3/);
    expect(text()).toContain("Line drift (px)");
    expect(text()).toContain("−0.24 (n 20)"); // published register rho for line drift
    expect(text()).toContain("A6 addendum 4 and A8");
    expect(text()).toContain("CC BY 4.0");
    expect(text()).toMatch(/one answer can move ρ by about 0\.1/);
  });

  test("leaving the author out re-computes with five raters", async () => {
    const submission = await sub(sd.study, () => 4);
    const c = mount({ ...sd, submission });
    expect(c.getState().landings.register.of).toBe(6);
    const box = document.querySelector<HTMLInputElement>('[data-bp="exclude-author"]')!;
    box.click();
    expect(c.getState().exclude).toBe("AARON");
    expect(c.getState().landings.register.of).toBe(5);
    expect(c.getState().landings.register.rater_rhos.map((r) => r.rater)).not.toContain("AARON");
  });

  test("constant answers: rho undefined, said in plain words", async () => {
    const submission = await sub(sd.study, () => 3);
    mount({ ...sd, submission });
    expect(text()).toContain("All your answers to this question were the same");
    expect(text()).not.toMatch(/NaN|undefined|\bnull\b/);
  });
});

describe("opt-in and crowd", () => {
  test("submit is called once and the answer is shown; a duplicate says so", async () => {
    const submission = await sub(study, (c, q) => (c.charCodeAt(2) + q.length) % 5 + 1);
    const onSubmit = vi.fn(async () => ({ ok: true, status: 200 }));
    mount({ study, reveal, submission, onSubmit });
    const b = document.querySelector<HTMLButtonElement>('[data-bp="submit"]')!;
    b.click();
    await vi.waitFor(() => expect(text()).toContain("Added. Thank you."));
    expect(b.disabled).toBe(true);
    b.click();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    cleanup();
    mount({ study, reveal, submission, onSubmit: async () => ({ ok: false, status: 409 }) });
    document.querySelector<HTMLButtonElement>('[data-bp="submit"]')!.click();
    await vi.waitFor(() => expect(text()).toContain("already added"));
  });

  test("a failed submit can be retried", async () => {
    const submission = await sub(study, () => 2);
    mount({ study, reveal, submission, onSubmit: async () => { throw new Error("offline"); } });
    const b = document.querySelector<HTMLButtonElement>('[data-bp="submit"]')!;
    b.click();
    await vi.waitFor(() => expect(text()).toContain("Couldn't add them just now"));
    expect(b.disabled).toBe(false);
  });

  test("tally unavailable reads as unavailable; a tally shows counts", async () => {
    const submission = await sub(study, () => 2);
    mount({ study, reveal, submission, loadTally: async () => { throw new Error("down"); } });
    await vi.waitFor(() => expect(text()).toContain("The crowd tally is unavailable right now."));
    cleanup();
    const [c1, c2, c3] = study.parts.clips.items.map((i) => i.code);
    const cell = (counts: number[]) => ({ n: counts.reduce((a, b) => a + b, 0), counts });
    mount({
      study, reveal, submission,
      loadTally: async () => ({
        study: "synthetic", n_sessions: 4,
        items: { [c1]: { look: cell([0, 0, 0, 1, 3]) }, [c2]: { look: cell([0, 1, 2, 1, 0]) }, [c3]: { look: cell([3, 1, 0, 0, 0]) } },
      }),
    });
    await vi.waitFor(() => expect(text()).toContain("4 visitors have added their ratings so far."));
    expect(text()).toMatch(/Still a line drawing: the crowd's average agrees with the panel's at ρ 1\.00 over 3 clips/);
  });
});

test("tied raters sit side by side in rows of three, never stacked upward", async () => {
  const submission = await sub(sd.study, () => 4);
  mount({ ...sd, submission });
  for (const track of document.querySelectorAll<HTMLElement>('.bp-section[data-q="register"] .bp-track')) {
    const byLeft = new Map<string, { dx: number; row: number }[]>();
    for (const d of track.querySelectorAll<HTMLElement>(".bp-dot")) {
      const left = d.style.left;
      const pos = { dx: Number(d.style.getPropertyValue("--bp-dx")), row: Number(d.style.getPropertyValue("--bp-row")) };
      byLeft.set(left, [...(byLeft.get(left) ?? []), pos]);
    }
    for (const dots of byLeft.values()) {
      const keys = dots.map((p) => `${p.row}:${p.dx}`);
      expect(new Set(keys).size).toBe(dots.length); // no two dots share a spot
      for (const p of dots) {
        expect(p.row).toBeGreaterThanOrEqual(0);
        expect(Math.abs(p.dx)).toBeLessThanOrEqual(1);
      }
    }
  }
});
