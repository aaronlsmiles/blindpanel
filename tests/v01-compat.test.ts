import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";
import { compile } from "../src/core/compile.js";
import { StudyConfig } from "../src/core/schema.js";
import { loadExample } from "./helpers.js";

// These hashes were computed from v0.1.0's code (main at 3d69b26) before any 0.2 change.
// Studies locked with v0.1 wording (and the StillDrawn explorer, which vendors 0.1.0) must keep
// the same hash: a changed value here means every existing lock would fail `blindpanel verify`.
const PINNED = {
  mini: "d6b74a9cfe25b2c6800d78fb694c9b025e6f35d921e7268e8c0a973f7277dd80",
  synthetic: "cbde3ac28fb5c61614de9705754d01c748393274e8874eac3345ef60f6461fcf",
  stilldrawn: "570630dbde93b9373686cca7af3152bee03a6141ad4265bacf8b5950607acea0",
};

describe("v0.1 studies keep their instrument hash", () => {
  test("the unit-test fixture", async () => {
    const dir = join(import.meta.dirname, "fixtures/mini");
    const read = (p: string) => readFileSync(join(dir, p), "utf8");
    const out = await compile(StudyConfig.parse(parse(read("study.yaml"))), {
      readText: read,
      listDir: (p) => (p === "reference/" ? ["ratings-R1.json", "ratings-R2.json"] : []),
    });
    expect(out.lock).toEqual({ instrument: "1", text_sha256: PINNED.mini });
  });
  test.each(["synthetic", "stilldrawn"] as const)("examples/%s", async (name) => {
    const ex = await loadExample(name);
    expect(ex.lock.text_sha256).toBe(PINNED[name]);
    // and the committed lock file says the same
    const committed = JSON.parse(readFileSync(join(ex.dir, "study.lock.json"), "utf8"));
    expect(committed.text_sha256).toBe(PINNED[name]);
  });
});
