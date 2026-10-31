import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { exportRows, report } from "../src/cli/data.js";
import { loadStudy } from "../src/cli/load.js";
import type { Row } from "../src/server/stores/types.js";

const EX = join(import.meta.dirname, "../examples/choice/study.yaml");

/** three visitors, two clips: `trigger` answers [1,2] [1,2] [1,3]; `action` answers [3,5] [3,6] [3,7] */
function rows(clips: string[], panel: string): Row[] {
  const mk = (n: number, trigger: number[], action: number[]): Row => ({
    study: "choice-demo", instrument: "1", session: `00000000-0000-4000-8000-00000000000${n}`,
    order: { baseline: [panel], clips },
    answers: {
      baseline: { [panel]: { trigger_still: 1, action_still: 12 } },
      clips: Object.fromEntries(clips.map((c, i) => [c, { trigger: trigger[i], action: action[i] }])),
    },
    delivery: { autoplay: true, keyboard: false, duration_s: 60, ui: "t" }, flags: [], received_day: "2026-10-30",
  });
  return [mk(1, [1, 2], [3, 5]), mk(2, [1, 2], [3, 6]), mk(3, [1, 3], [3, 7])];
}

async function setup() {
  const l = await loadStudy(EX);
  const clips = l.study.parts.clips.items.slice(0, 2).map((i) => i.code);
  return { l, clips, panel: l.study.panels[0].code };
}

describe("export and report with choice scales", () => {
  test("the CSV appends the option label last, and quotes a label that holds a comma", async () => {
    const { l, clips, panel } = await setup();
    const out = mkdtempSync(join(tmpdir(), "bp-choice-"));
    expect(exportRows(l, rows(clips, panel), out)).toBe(3);
    const lines = readFileSync(join(out, "ratings.csv"), "utf8").trimEnd().split("\n");
    expect(lines[0]).toBe("visitor,instrument,part,position,item,question,score,flags,option");
    const c1 = l.refs.clips[clips[0]];
    expect(lines).toContain(`V0001,1,clips,1,${c1},trigger,1,,Nothing in particular`);
    expect(lines).toContain(`V0001,1,clips,1,${c1},action,3,,"Leaned in, slowly"`);
    expect(lines).toContain(`V0001,1,baseline,1,${l.refs.panels[panel]},action_still,12,,Something else`);
    // every line has the same number of fields once quotes are honoured: nothing shifted
    for (const line of lines) expect(line.replace(/"[^"]*"/g, "x").split(",")).toHaveLength(9);
  });

  test("the per-visitor JSON files are unchanged: numbers, no labels", async () => {
    const { l, clips, panel } = await setup();
    const out = mkdtempSync(join(tmpdir(), "bp-choice-"));
    exportRows(l, rows(clips, panel), out);
    const v = JSON.parse(readFileSync(join(out, "ratings-V0001.json"), "utf8"));
    expect(v.ratings[0]).toEqual({ clip: l.refs.clips[clips[0]], trigger: 1, action: 3 });
  });

  test("report prints nominal α for choice questions (hand-checked: 6/11 and 3/8)", async () => {
    const { l, clips, panel } = await setup();
    const text = report(l, rows(clips, panel));
    // trigger: item 1 (1,1,1), item 2 (2,2,3). n = 6, totals 3/2/1, 2 disagreements, so α = 1 − 5·2/22 = 6/11
    expect(text).toContain("What it reacted to:\n  crowd α (nominal) 0.545 over 2 clips");
    // action: item 1 (3,3,3), item 2 (5,6,7). n = 6, 3 disagreements, Σ n_c n_k = 24, so α = 1 − 5·3/24 = 3/8
    expect(text).toContain("What it did:\n  crowd α (nominal) 0.375 over 2 clips");
    expect(text).not.toContain("crowd mean vs panel mean");
  });
});
