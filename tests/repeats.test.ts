import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import vectors from "./fixtures/order-vectors.json" with { type: "json" };
import { compile, repeatId } from "../src/core/compile.js";
import { opaqueCode } from "../src/core/codes.js";
import { StudyConfig } from "../src/core/schema.js";
import { MIN_REPEAT_CHANCE, originalClipCodes, participantOrder, repeatPlacementChance, withRepeats } from "../src/core/order.js";
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

/** n clips (clip-0 … clip-<n−1>) with the given repeats, one block. */
function manyClips(n: number, min_gap: number, repeats: { of: number; position: number }[]) {
  const c = parse(read("study.yaml"));
  c.items.clips = Array.from({ length: n }, (_, i) => ({ id: `clip-${i}`, reference: "panel-a", file: `clip-${i}.mp4`, label: "X" }));
  c.parts.clips.extend = false;
  c.parts.clips.session_size = n + repeats.length;
  c.parts.clips.repeats = { min_gap, items: repeats.map((r) => ({ of: `clip-${r.of}`, position: r.position })) };
  return c;
}

/** every schema issue as "path: message" */
const issues = (c: unknown) => {
  const r = StudyConfig.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
};

/** The chance by brute force: every order of n originals, with repeat k of original k at its position. */
function bruteChance(n: number, positions: number[], minGap: number) {
  const perms = (xs: number[]): number[][] => (xs.length < 2 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  const sorted = [...positions].sort((a, b) => a - b);
  const all = perms(Array.from({ length: n }, (_, i) => i));
  const good = all.filter((p) => {
    const out: (number | string)[] = [...p];
    sorted.forEach((pos, k) => out.splice(pos - 1, 0, `r${k}`));
    return sorted.every((_, k) => out.indexOf(`r${k}`) - out.indexOf(k) >= minGap);
  });
  return good.length / all.length;
}

describe("repeats: schema", () => {
  test("a valid repeat parses", () => {
    expect(StudyConfig.safeParse(withRepeat()).success).toBe(true);
  });
  test.each([
    ["extend on", (c: any) => (c.parts.clips.extend = true), "parts.clips.extend", /extend must be false/],
    ["session_size not clips plus repeats", (c: any) => (c.parts.clips.session_size = 3), "parts.clips.session_size", /clips plus the repeats \(4\)/],
    ["an unknown clip", (c: any) => (c.parts.clips.repeats.items[0].of = "nope"), "parts.clips.repeats.items.0.of", /no clip named nope/],
    ["a position inside min_gap", (c: any) => (c.parts.clips.repeats.items[0].position = 2), "parts.clips.repeats.items.0.position", /from 3 to 4/],
    ["a position past the end", (c: any) => (c.parts.clips.repeats.items[0].position = 5), "parts.clips.repeats.items.0.position", /from 3 to 4/],
    ["the same clip twice", (c: any) => {
      c.parts.clips.session_size = 5;
      c.parts.clips.repeats.items.push({ of: "clip-b_engine-beta", position: 5 });
    }, "parts.clips.repeats.items", /clip clip-b_engine-beta is repeated more than once/],
    ["two repeats at one position", (c: any) => {
      c.parts.clips.session_size = 5;
      c.parts.clips.repeats.items.push({ of: "clip-c_engine-alpha", position: 4 });
    }, "parts.clips.repeats.items", /two repeats at position 4/],
    ["a layout no order satisfies (a at 2 and b at 3, min_gap 1, three clips)", (c: any) => {
      c.parts.clips.session_size = 5;
      c.parts.clips.repeats = { min_gap: 1, items: [{ of: "clip-a_engine-alpha", position: 2 }, { of: "clip-b_engine-beta", position: 3 }] };
    }, "parts.clips.repeats.items", /^repeats cannot be placed$/],
  ])("rejects %s, at its path", (_name, edit, path, message) => {
    expect(issues(withRepeat(edit))).toEqual([{ path, message: expect.stringMatching(message) }]);
  });
  test("the chance one draw places every repeat: a 55-clip study with repeats at 30 and 52, min_gap 5, is 25/55 × 45/54 = 25/66 ≈ 0.379", () => {
    expect(repeatPlacementChance(55, [30, 52], 5)).toBeCloseTo(25 / 66, 12);
    expect(repeatPlacementChance(55, [52, 30], 5).toFixed(3)).toBe("0.379");
    expect(repeatPlacementChance(3, [4], 2)).toBeCloseTo(2 / 3, 12); // the mini study above
    expect(repeatPlacementChance(3, [2, 3], 1)).toBe(0);
    // three repeats, min_gap 2, five clips: 1/5 × 3/4 × 3/3 = 3/20 (also checked by brute force below)
    expect(repeatPlacementChance(5, [3, 7, 8], 2)).toBeCloseTo(3 / 20, 12);
  });
  test.each([
    [3, [4], 2], [3, [2, 3], 1], [5, [3, 6], 1], [5, [4, 7], 2], [6, [3, 5, 9], 1], [6, [7, 8], 3], [5, [2, 4, 6], 1], [5, [3, 7, 8], 2],
  ] as [number, number[], number][])("the chance matches brute force: %i clips, positions %j, min_gap %i", (n, positions, gap) => {
    expect(repeatPlacementChance(n, positions, gap)).toBeCloseTo(bruteChance(n, positions, gap), 12);
  });
  test("a 55-clip study with repeats at 30 and 52, min_gap 5, is accepted", () => {
    expect(issues(manyClips(55, 5, [{ of: 6, position: 30 }, { of: 30, position: 52 }]))).toEqual([]);
  });
  test(`a layout below ${MIN_REPEAT_CHANCE} is refused as too unlikely; just above it, accepted`, () => {
    expect(MIN_REPEAT_CHANCE).toBe(2.8e-3);
    // one repeat right after min_gap: its original must be first, a chance of 1 in n
    expect(issues(manyClips(400, 5, [{ of: 0, position: 6 }]))).toEqual([
      { path: "parts.clips.repeats.items", message: "repeats are too unlikely to place: the 10,000-draw order search could fail" },
    ]);
    expect(issues(manyClips(300, 5, [{ of: 0, position: 6 }]))).toEqual([]);
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
  test("originalClipCodes: every clip code except the repeats, in study order", async () => {
    const plain = await compile(StudyConfig.parse(parse(read("study.yaml"))), io);
    const c = await compile(StudyConfig.parse(withRepeat()), io);
    const codes = plain.study.parts.clips.items.map((i) => i.code);
    expect(originalClipCodes(plain.study)).toEqual(codes);
    expect(originalClipCodes(c.study)).toEqual(codes);
    const o = await participantOrder(c.study, S);
    expect(o.clips.filter((x) => x !== c.study.parts.clips.repeats!.items[0].alias).sort()).toEqual([...codes].sort());
  });
});

describe("repeats: order", () => {
  test.each(vectors.repeats)("matches the Python reference: $key, min_gap $min_gap", async ({ key, originals, repeats, min_gap, order }) => {
    expect(await withRepeats(originals, key, { min_gap, items: repeats })).toEqual(order);
  });
  test("repeats listed highest position first give the same order", async () => {
    for (const v of vectors.repeats) {
      expect(await withRepeats(v.originals, v.key, { min_gap: v.min_gap, items: [...v.repeats].reverse() })).toEqual(v.order);
    }
  });
  test("a gap of exactly min_gap is enough: with two clips the only valid order, for any key", async () => {
    for (let i = 0; i < 20; i++) {
      expect(await withRepeats(["a", "b"], `k${i}`, { min_gap: 1, items: [{ alias: "r", of: "a", position: 2 }] })).toEqual(["a", "r", "b"]);
    }
  });
  test("refuses a repeat whose original is not among the clips", async () => {
    await expect(withRepeats(["a", "b"], "k", { min_gap: 1, items: [{ alias: "r", of: "z", position: 2 }] })).rejects.toThrow(
      "repeat r: its original z is not among the clips",
    );
  });
  test("refuses an alias that is also an original", async () => {
    await expect(withRepeats(["a", "b"], "k", { min_gap: 1, items: [{ alias: "b", of: "a", position: 2 }] })).rejects.toThrow(
      "repeat b is also an original clip",
    );
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
