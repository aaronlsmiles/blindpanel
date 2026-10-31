import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { participantOrder } from "../src/core/order.js";
import { buildSubmission, UI_VERSION, validateSubmission } from "../src/core/payload.js";
import { flagsFor } from "../src/server/flags.js";
import type { Study, Submission } from "../src/core/types.js";
import { loadExample, SESSION } from "./helpers.js";

let study: Study;
beforeAll(async () => ({ study } = await loadExample("synthetic")));

async function make(blocks = 1, score = (i: number, q: number) => ((i + q) % 5) + 1): Promise<Submission> {
  const order = await participantOrder(study, SESSION);
  const clipQs = study.questions.filter((q) => q.part === "clips").map((q) => q.id);
  const baseQs = study.questions.filter((q) => q.part === "baseline").map((q) => q.id);
  const used = order.blocks.slice(0, blocks);
  const answers = { baseline: {} as Record<string, Record<string, number>>, clips: {} as Record<string, Record<string, number>> };
  used.flatMap((b) => b.baseline).forEach((p, i) => (answers.baseline[p] = Object.fromEntries(baseQs.map((q, k) => [q, score(i, k)]))));
  used.flatMap((b) => b.clips).forEach((c, i) => (answers.clips[c] = Object.fromEntries(clipQs.map((q, k) => [q, score(i, k)]))));
  return buildSubmission(study, { session: SESSION, order, blocks, answers, delivery: { autoplay: true, keyboard: false, seconds: 63 } });
}

describe("validateSubmission", () => {
  test("a one-block session validates, duration rounded to 10 s", async () => {
    const s = await make(1);
    expect(s.order.clips).toHaveLength(2);
    expect(s.delivery.duration_s).toBe(60);
    const r = await validateSubmission(study, JSON.parse(JSON.stringify(s)));
    expect(r).toMatchObject({ ok: true });
  });
  test("an extended session validates", async () => {
    const s = await make(2);
    expect(s.order.clips).toHaveLength(3);
    expect((await validateSubmission(study, s)).ok).toBe(true);
  });
  test("unknown fields are stripped", async () => {
    const s: any = await make(1);
    s.comment = "hello";
    s.delivery.userAgent = "x";
    s.answers.clips[s.order.clips[0]].extra = 3;
    const r = await validateSubmission(study, s);
    expect(r.ok).toBe(false); // an unknown question is an error, not stripped
    delete s.answers.clips[s.order.clips[0]].extra;
    const r2 = await validateSubmission(study, s);
    expect(r2.ok && JSON.stringify(r2.value)).not.toMatch(/hello|userAgent/);
  });
  test.each([
    ["wrong format", (s: any) => (s.format = "x")],
    ["wrong study", (s: any) => (s.study = "other")],
    ["old instrument", (s: any) => (s.instrument = "0")],
    ["non-uuid session", (s: any) => (s.session = "abc")],
    ["reordered clips", (s: any) => s.order.clips.reverse()],
    ["altered baseline order", (s: any) => s.order.baseline.push("pzzzzz")],
    ["extra item", (s: any) => (s.answers.clips.cxxxxx = { look: 3, same: 3 })],
    ["missing answer", (s: any) => delete s.answers.clips[s.order.clips[0]].same],
    ["out of range", (s: any) => (s.answers.clips[s.order.clips[0]].same = 6)],
    ["not an integer", (s: any) => (s.answers.clips[s.order.clips[0]].same = 2.5)],
    ["missing baseline", (s: any) => (s.answers.baseline = {})],
    ["negative duration", (s: any) => (s.delivery.duration_s = -10)],
    ["long ui string", (s: any) => (s.delivery.ui = "x".repeat(65))],
    ["not an object", (s: any) => (s.answers = [])],
  ])("rejects %s with 400", async (_n, mutate) => {
    const s = structuredClone(await make(1));
    mutate(s);
    const r = await validateSubmission(study, s);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  test("rejects a body that is not an object", async () => {
    expect(await validateSubmission(study, null)).toMatchObject({ ok: false, status: 400 });
    expect(await validateSubmission(study, "x")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("flags", () => {
  test("straightline when every clip answer is identical", async () => {
    expect(flagsFor(study, await make(2, () => 3))).toContain("straightline");
    expect(flagsFor(study, await make(2))).not.toContain("straightline");
  });
  test("too_fast under half the clip time", async () => {
    const s = await make(2);
    s.delivery.duration_s = 0;
    expect(flagsFor(study, s)).toContain("too_fast");
    s.delivery.duration_s = 10;
    expect(flagsFor(study, s)).not.toContain("too_fast");
  });
});

describe("validateSubmission with choice scales", () => {
  let cs: Study; // examples/choice: reacts has 8 options, acts has 12
  beforeAll(async () => ({ study: cs } = await loadExample("choice")));

  async function makeChoice(): Promise<Submission> {
    const order = await participantOrder(cs, SESSION);
    const used = order.blocks.slice(0, 1);
    const answers = {
      baseline: Object.fromEntries(used.flatMap((b) => b.baseline).map((p) => [p, { trigger_still: 8, action_still: 12 }])),
      clips: Object.fromEntries(used.flatMap((b) => b.clips).map((c, i) => [c, { trigger: i + 1, action: 12 - i }])),
    };
    return buildSubmission(cs, { session: SESSION, order, blocks: 1, answers, delivery: { autoplay: true, keyboard: false, seconds: 60 } });
  }

  test("the top option of each scale validates (8 of 8, 12 of 12)", async () => {
    const r = await validateSubmission(cs, await makeChoice());
    expect(r).toMatchObject({ ok: true });
  });
  test("each question is bounded by its own scale", async () => {
    const s = await makeChoice();
    const clip = s.order.clips[0];
    s.answers.clips[clip].trigger = 9; // 8 options
    expect(await validateSubmission(cs, s)).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("from 1 to 8") });
    s.answers.clips[clip].trigger = 8;
    s.answers.clips[clip].action = 13; // 12 options
    expect(await validateSubmission(cs, s)).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("from 1 to 12") });
  });
  test.each([0, -1, 2.5, "3", null])("%j is not an option", async (bad) => {
    const s: any = await makeChoice();
    s.answers.clips[s.order.clips[0]].action = bad;
    expect((await validateSubmission(cs, s)).ok).toBe(false);
  });
  test("an ordinal study still refuses 6 and says 1 to 5", async () => {
    const s: any = await make(1);
    s.answers.clips[s.order.clips[0]].look = 6;
    expect(await validateSubmission(study, s)).toMatchObject({ ok: false, error: expect.stringContaining("from 1 to 5") });
  });
});

test("delivery.ui names the package version", () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8"));
  expect(UI_VERSION).toBe(`blindpanel@${pkg.version}`);
  expect(pkg.version).toBe("0.2.0");
});
