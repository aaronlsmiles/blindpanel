import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { parse, stringify } from "yaml";
import { exportRows, report } from "../src/cli/data.js";
import { loadStudy, type Loaded } from "../src/cli/load.js";
import { buildSite } from "../src/cli/site.js";
import { verify, type Check } from "../src/cli/verify.js";
import { originalClipCodes, participantOrder } from "../src/core/order.js";
import { krippendorffOrdinal } from "../src/stats/krippendorff.js";
import type { Row } from "../src/server/stores/types.js";
import { withSyntheticRepeat } from "./helpers.js";

const EX = join(import.meta.dirname, "../examples/synthetic");
const tmp = mkdtempSync(join(tmpdir(), "bp-repeats-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const failed = (cs: Check[]) => cs.filter((c) => !c.ok).map((c) => c.name);
const DRAWN = "an order can be drawn for every session";

/** a copy of examples/synthetic with box-drift (ref c02) repeated at position 4 */
async function repeated(edit: (dir: string) => void = () => {}) {
  const dir = mkdtempSync(join(tmp, "study-"));
  cpSync(EX, dir, { recursive: true });
  const y = join(dir, "study.yaml");
  const c = parse(readFileSync(y, "utf8"));
  withSyntheticRepeat(c);
  writeFileSync(y, stringify(c));
  edit(dir);
  return { dir, l: await loadStudy(y) };
}

/** two visitors: the originals scored [5, 3, 1] and [4, 3, 2] in study order, the repeat 5 and 1; stills 4 */
async function rows(l: Loaded): Promise<Row[]> {
  const alias = l.study.parts.clips.repeats!.items[0].alias;
  const own = originalClipCodes(l.study);
  const mk = async (n: number, scores: number[], rep: number): Promise<Row> => {
    const session = `00000000-0000-4000-8000-00000000000${n}`;
    const o = await participantOrder(l.study, session);
    const s = (c: string) => (c === alias ? rep : scores[own.indexOf(c)]);
    return {
      study: l.study.id, instrument: l.study.instrument, session,
      order: { baseline: o.blocks[0].baseline, clips: o.blocks[0].clips },
      answers: {
        baseline: Object.fromEntries(o.blocks[0].baseline.map((p) => [p, { drawing: 4 }])),
        clips: Object.fromEntries(o.clips.map((c) => [c, { look: s(c), same: s(c) }])),
      },
      delivery: { autoplay: true, keyboard: false, duration_s: 60, ui: "t" }, flags: [], received_day: "2026-11-08",
    };
  };
  return [await mk(1, [5, 3, 1], 5), await mk(2, [4, 3, 2], 1)];
}

describe("export and report with an attention repeat", () => {
  test("export writes the repeat's answers as a row of its own, keyed <ref>#repeat", async () => {
    const { dir, l } = await repeated();
    const rs = await rows(l);
    const out = join(dir, "export");
    expect(exportRows(l, rs, out)).toBe(2);
    const v = JSON.parse(readFileSync(join(out, "ratings-V0001.json"), "utf8"));
    expect(v.ratings.map((r: { clip: string }) => r.clip)).toEqual(rs[0].order.clips.map((c) => l.refs.clips[c]));
    expect(v.ratings[3]).toEqual({ clip: "c02#repeat", look: 5, same: 5 });
    const csv = readFileSync(join(out, "ratings.csv"), "utf8").split("\n");
    expect(csv).toContain("V0001,1,clips,4,c02#repeat,look,5,,Yes: a clean line drawing");
  });
  test("report's crowd α and 'over N clips' count the original clips only", async () => {
    const { l } = await repeated();
    const rs = await rows(l);
    const crowd = rs.map((r) => originalClipCodes(l.study).map((c) => r.answers.clips[c].look));
    expect(report(l, rs)).toContain(`Still a line drawing:\n  crowd α ${krippendorffOrdinal(crowd)!.toFixed(3)} over 3 clips`);
  });
});

describe("verify with an attention repeat", () => {
  test("a study with a repeat builds and verifies clean; the repeat adds no media file", async () => {
    const { dir, l } = await repeated();
    const out = buildSite(l, join(dir, "site"));
    const cs = await verify(l, { dist: out });
    expect(failed(cs)).toEqual([]);
    expect(cs.map((c) => c.name)).toContain(DRAWN);
    expect(readdirSync(join(out, "media"))).toHaveLength(5);
  });
  test("'every clip has reference ratings' counts original clips only", async () => {
    // c03 taken out of every reference rater's file: one original without ratings; the repeat is not counted
    const { l } = await repeated((dir) => {
      for (const r of ["S1", "S2", "S3"]) {
        const p = join(dir, "reference", `ratings-${r}.json`);
        const d = JSON.parse(readFileSync(p, "utf8"));
        d.ratings = d.ratings.filter((x: { clip: string }) => x.clip !== "c03");
        writeFileSync(p, JSON.stringify(d));
      }
    });
    expect((await verify(l)).find((c) => c.name === "every clip has reference ratings")).toEqual({
      name: "every clip has reference ratings", ok: false, detail: "1 clip(s) without any",
    });
  });
  test("'clip codes unique' still covers the repeat", async () => {
    const { l } = await repeated();
    const r = l.study.parts.clips.repeats!.items[0];
    // give the repeat its original's code, in its item and in the repeat itself
    l.study.parts.clips.items.find((i) => i.code === r.alias)!.code = r.of;
    r.alias = r.of;
    expect(failed(await verify(l))).toContain("clip codes unique");
  });
  test("an order that cannot be drawn is a failed check, not a crash", async () => {
    const { l } = await repeated();
    l.study.parts.clips.repeats!.min_gap = 4; // position 4 leaves no place 4 before it
    const cs = await verify(l);
    expect(cs.find((c) => c.name === DRAWN)).toEqual({ name: DRAWN, ok: false, detail: "no order puts every repeat at least 4 places after its original" });
    expect(failed(cs)).toEqual([DRAWN]);
  });
});
