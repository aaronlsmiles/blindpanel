import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadExample } from "./helpers.js";

describe("examples/choice", () => {
  test("choice scales of 8 and 12 options, four choice questions, no reference panel", async () => {
    const { study, reveal } = await loadExample("choice");
    expect(study.scales.reacts).toMatchObject({ kind: "choice", min: 1, max: 8 });
    expect(study.scales.acts).toMatchObject({ kind: "choice", min: 1, max: 12 });
    expect(study.scales.acts.labels[9]).toBe("Shook"); // the tenth option, reached with the 0 key
    expect(study.questions.map((q) => [q.id, q.part, q.scale, q.direction])).toEqual([
      ["trigger_still", "baseline", "reacts", undefined],
      ["action_still", "baseline", "acts", undefined],
      ["trigger", "clips", "reacts", undefined],
      ["action", "clips", "acts", undefined],
    ]);
    expect(reveal.reference).toBeNull();
  });
  test("study.lock.json matches the compiled wording", async () => {
    const { dir, lock } = await loadExample("choice");
    expect(JSON.parse(readFileSync(join(dir, "study.lock.json"), "utf8"))).toEqual(lock);
  });
});
