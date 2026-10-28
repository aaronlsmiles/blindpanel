import { beforeAll, describe, expect, test } from "vitest";
import { participantOrder } from "../src/core/order.js";
import { buildSubmission, validateSubmission } from "../src/core/payload.js";
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
