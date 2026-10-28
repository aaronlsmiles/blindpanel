import { describe, expect, test } from "vitest";
import vectors from "./fixtures/order-vectors.json" with { type: "json" };
import { rngFor, shuffle } from "../src/core/rng.js";
import { participantOrder } from "../src/core/order.js";
import type { Study } from "../src/core/types.js";

describe("seeded shuffle matches the Python reference", () => {
  test("raw xoshiro128** outputs", async () => {
    const rng = await rngFor(vectors.next.key);
    expect(Array.from({ length: 10 }, () => rng.next())).toEqual(vectors.next.values);
  });
  test.each(vectors.vectors)("$key", async ({ key, items, order }) => {
    expect(await shuffle(items, key)).toEqual(order);
  });
});

function study(): Study {
  const panels = ["p1", "p2", "p3", "p4"];
  const clips = Array.from({ length: 8 }, (_, i) => ({
    code: `c${i}`,
    video: `v${i}.mp4`,
    reference: panels[i % 4],
  }));
  return {
    blindpanel: 1, id: "t", instrument: "1", text_sha256: "", seed: "s", title: "t",
    scales: {}, questions: [], privacy: "",
    panels: panels.map((code) => ({ code, image: `${code}.png` })),
    parts: {
      baseline: { intro: [] },
      clips: {
        intro: [], watch_note: "", clip_seconds: 5, session_size: 3, extend: true,
        video: { loop: true, muted: true, autoplay: "unless_reduced_motion" }, items: clips,
      },
    },
    modes: { public: { submit: true, tally: true, min_crowd_n: 5 } },
    endpoints: { submit: "", tally: "", reveal: "" },
  };
}

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

describe("participantOrder", () => {
  test("deterministic per session, different across sessions", async () => {
    const a = await participantOrder(study(), S1);
    expect(await participantOrder(study(), S1)).toEqual(a);
    expect((await participantOrder(study(), S2)).clips).not.toEqual(a.clips);
    expect([...a.clips].sort()).toEqual(study().parts.clips.items.map((i) => i.code).sort());
  });

  test("blocks: baseline for the block's panels first, never repeated", async () => {
    const s = study();
    const o = await participantOrder(s, S1);
    const ref = Object.fromEntries(s.parts.clips.items.map((i) => [i.code, i.reference]));
    expect(o.blocks).toHaveLength(2);
    const [b1, b2] = o.blocks;
    expect(b1.clips).toEqual(o.clips.slice(0, 3));
    expect(b2.clips).toEqual(o.clips.slice(3));
    expect(new Set(b1.baseline)).toEqual(new Set(b1.clips.map((c) => ref[c])));
    expect(b2.baseline.filter((p) => b1.baseline.includes(p))).toEqual([]);
    expect(new Set([...b1.baseline, ...b2.baseline])).toEqual(new Set(["p1", "p2", "p3", "p4"]));
    // baseline codes keep the seeded baseline order inside each block
    const pos = (p: string) => o.baseline.indexOf(p);
    for (const b of o.blocks) expect(b.baseline.map(pos)).toEqual([...b.baseline.map(pos)].sort((x, y) => x - y));
  });

  test("no extension gives one block", async () => {
    const s = study();
    s.parts.clips.extend = false;
    const o = await participantOrder(s, S1);
    expect(o.blocks).toHaveLength(1);
    expect(o.blocks[0].clips).toHaveLength(3);
  });
});
