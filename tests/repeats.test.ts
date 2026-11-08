import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import vectors from "./fixtures/order-vectors.json" with { type: "json" };
import { compile, repeatId } from "../src/core/compile.js";
import { opaqueCode } from "../src/core/codes.js";
import { StudyConfig } from "../src/core/schema.js";
import { participantOrder, withRepeats } from "../src/core/order.js";
import { buildSubmission, validateSubmission } from "../src/core/payload.js";

const DIR = join(import.meta.dirname, "fixtures/mini");
const read = (p: string) => readFileSync(join(DIR, p), "utf8");
const io = { readText: read, listDir: (p: string) => (p === "reference/" ? ["ratings-R1.json", "ratings-R2.json"] : []) };
const S = "11111111-1111-4111-8111-111111111111";

/** The mini study (three clips) with clip-b repeated at position 4, at least 2 places after itself. */
function withRepeat(edit: (c: any) => void = () => {}) {
  const c = parse(read("study.yaml"));
  c.parts.clips.extend = false;
  c.parts.clips.session_size = 4;
  c.parts.clips.repeats = { min_gap: 2, items: [{ of: "clip-b_engine-beta", position: 4 }] };
  edit(c);
  return c;
}

describe("repeats: schema", () => {
  test("a valid repeat parses", () => {
    expect(StudyConfig.safeParse(withRepeat()).success).toBe(true);
  });
  test.each([
    ["extend on", (c: any) => (c.parts.clips.extend = true)],
    ["session_size not clips plus repeats", (c: any) => (c.parts.clips.session_size = 3)],
    ["an unknown clip", (c: any) => (c.parts.clips.repeats.items[0].of = "nope")],
    ["a position inside min_gap", (c: any) => (c.parts.clips.repeats.items[0].position = 2)],
    ["a position past the end", (c: any) => (c.parts.clips.repeats.items[0].position = 5)],
    ["the same clip twice", (c: any) => {
      c.parts.clips.session_size = 5;
      c.parts.clips.repeats.items.push({ of: "clip-b_engine-beta", position: 5 });
    }],
    ["two repeats at one position", (c: any) => {
      c.parts.clips.session_size = 5;
      c.parts.clips.repeats.items.push({ of: "clip-c_engine-alpha", position: 4 });
    }],
  ])("rejects %s", (_name, edit) => {
    expect(StudyConfig.safeParse(withRepeat(edit)).success).toBe(false);
  });
});

describe("repeats: compile", () => {
  test("a repeat gets its own seeded code, its original's clip and still, no second media file, no new wording", async () => {
    const plain = await compile(StudyConfig.parse(parse(read("study.yaml"))), io);
    const c = await compile(StudyConfig.parse(withRepeat()), io);
    const of = await opaqueCode(c.study.seed, "clip", "clip-b_engine-beta");
    const alias = await opaqueCode(c.study.seed, "clip", repeatId("clip-b_engine-beta"));
    expect(alias).not.toBe(of);
    expect(c.study.parts.clips.repeats).toEqual({ min_gap: 2, items: [{ alias, of, position: 4 }] });
    const items = c.study.parts.clips.items;
    const a = items.find((i) => i.code === alias)!;
    const o = items.find((i) => i.code === of)!;
    expect(a.video).toBe(o.video);
    expect(a.reference).toBe(o.reference);
    expect(c.media).toEqual(plain.media);
    expect(c.lock.text_sha256).toBe(plain.lock.text_sha256);
    expect(c.reveal.items[alias]).toEqual(c.reveal.items[of]);
  });
  test("a study without repeats compiles exactly as before: no repeats key", async () => {
    const plain = await compile(StudyConfig.parse(parse(read("study.yaml"))), io);
    expect("repeats" in plain.study.parts.clips).toBe(false);
  });
});

describe("repeats: order", () => {
  test.each(vectors.repeats)("matches the Python reference: $key", async ({ key, originals, repeats, min_gap, order }) => {
    expect(await withRepeats(originals, key, { min_gap, items: repeats })).toEqual(order);
  });
  test("each participant: the repeat at its position, at least min_gap after its original, one block", async () => {
    const c = await compile(StudyConfig.parse(withRepeat()), io);
    const r = c.study.parts.clips.repeats!.items[0];
    for (const p of [S, "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"]) {
      const o = await participantOrder(c.study, p);
      expect(o.blocks).toHaveLength(1);
      expect(o.clips).toHaveLength(4);
      expect(o.clips.indexOf(r.alias)).toBe(3);
      expect(o.clips.indexOf(r.alias) - o.clips.indexOf(r.of)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("repeats: payload", () => {
  test("a submission answering the repeat validates; one without it is refused", async () => {
    const c = await compile(StudyConfig.parse(withRepeat()), io);
    const order = await participantOrder(c.study, S);
    const qs = (part: string) => c.study.questions.filter((q) => q.part === part).map((q) => q.id);
    const answers = {
      baseline: Object.fromEntries(order.blocks[0].baseline.map((p) => [p, Object.fromEntries(qs("baseline").map((q) => [q, 3]))])),
      clips: Object.fromEntries(order.clips.map((x) => [x, Object.fromEntries(qs("clips").map((q) => [q, 3]))])),
    };
    const s = buildSubmission(c.study, { session: S, order, blocks: 1, answers, delivery: { autoplay: true, keyboard: false, seconds: 30 } });
    expect(await validateSubmission(c.study, JSON.parse(JSON.stringify(s)))).toMatchObject({ ok: true });
    const missing = JSON.parse(JSON.stringify(s));
    delete missing.answers.clips[c.study.parts.clips.repeats!.items[0].alias];
    expect(await validateSubmission(c.study, missing)).toMatchObject({ ok: false });
  });
});
