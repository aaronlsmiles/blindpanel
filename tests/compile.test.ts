import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { compile } from "../src/core/compile.js";
import { StudyConfig, studyJsonSchema } from "../src/core/schema.js";

const DIR = join(import.meta.dirname, "fixtures/mini");
const read = (p: string) => readFileSync(join(DIR, p), "utf8");
const raw = () => parse(read("study.yaml"));
const list = (p: string) => (p === "reference/" ? ["ratings-R1.json", "ratings-R2.json"] : []);

describe("schema", () => {
  test("the mini study is valid", () => {
    expect(StudyConfig.safeParse(raw()).success).toBe(true);
  });
  test.each([
    ["unknown key", (c: any) => (c.colour = "red")],
    ["HTML in wording", (c: any) => (c.questions[1].text = "Is it <b>drawn</b>?")],
    ["four labels", (c: any) => c.scales.same.labels.pop()],
    ["missing scale", (c: any) => (c.questions[2].scale = "nope")],
    ["reference to no panel", (c: any) => (c.items.clips[0].reference = "panel-z")],
    ["session bigger than the clips", (c: any) => (c.parts.clips.session_size = 9)],
    ["baseline question without baseline part", (c: any) => delete c.parts.baseline],
    ["duplicate clip id", (c: any) => (c.items.clips[1].id = c.items.clips[0].id)],
    ["bad study id", (c: any) => (c.id = "Mini Study")],
  ])("rejects %s", (_name, mutate) => {
    const c = raw();
    mutate(c);
    expect(StudyConfig.safeParse(c).success).toBe(false);
  });
  test("schema/study.schema.json is fresh", () => {
    const committed = JSON.parse(readFileSync(join(import.meta.dirname, "../schema/study.schema.json"), "utf8"));
    expect(committed).toEqual(studyJsonSchema());
  });
});

describe("compile", () => {
  test("study.json carries no names, ids, labels or reference keys", async () => {
    const out = await compile(StudyConfig.parse(raw()), { readText: read, listDir: list });
    const text = JSON.stringify(out.study);
    for (const leak of ["clip-a", "engine", "Engine", "panel-a", "c01", "p01", "idle", "example.org", "clip-a.mp4", "panel-a.png"]) {
      expect(text, leak).not.toContain(leak);
    }
    expect(out.study.parts.clips.items).toHaveLength(3);
    expect(out.study.parts.clips.items[0].video).toMatch(/^media\/c[0-9a-z]{5}\.mp4$/);
    const panels = new Set(out.study.panels.map((p) => p.code));
    for (const c of out.study.parts.clips.items) expect(panels.has(c.reference)).toBe(true);
    expect(out.media).toContainEqual({ from: "media/clip-a.mp4", to: out.study.parts.clips.items[0].video });
    expect(out.lock.text_sha256).toBe(out.study.text_sha256);
    expect(out.banned).toEqual(["engine-alpha", "engine alpha", "engine-beta", /\bbeta\b/i]);
  });

  test("reveal.json holds labels and the reference panel in study order", async () => {
    const { study, reveal } = await compile(StudyConfig.parse(raw()), { readText: read, listDir: list });
    const [a, b, c] = study.parts.clips.items.map((i) => i.code);
    expect(reveal.items[a]).toEqual({ label: "Engine Alpha", meta: { motion: "idle" } });
    expect(reveal.items[c].link).toBe("https://example.org/x");
    const ref = reveal.reference!;
    expect(ref.raters).toEqual(["R1", "R2"]);
    expect(ref.ratings.drawn).toEqual([[5, 2, 4], [4, 3, 4]]);
    expect(ref.ratings.same).toEqual([[4, 1, 4], [5, null, 3]]);
    expect(ref.ratings.still).toEqual([[5, 4], [null, 3]]);
    expect(ref.metrics[0].values).toEqual([0.5, 4.2, null]);
    expect(ref.published_alpha).toEqual({ drawn: 0.5 });
    expect(b).toBeTruthy();
  });

  test("remote media default to <code>.<ext> under the base", async () => {
    const c = raw();
    c.media = { base: "https://media.example.org/s/", origins: ["https://media.example.org"] };
    for (const i of [...c.items.panels, ...c.items.clips]) delete i.file;
    const { study, media } = await compile(StudyConfig.parse(c), { readText: read, listDir: list });
    const v = study.parts.clips.items[0];
    expect(v.video).toBe(`https://media.example.org/s/${v.code}.mp4`);
    expect(study.panels[0].image).toBe(`https://media.example.org/s/${study.panels[0].code}.png`);
    expect(media).toEqual([]);
  });

  test("local media need a file", () => {
    const c = raw();
    delete c.items.clips[0].file;
    expect(StudyConfig.safeParse(c).success).toBe(false);
  });

  test("display copies default to <code>-w<width>.webp, narrowest first, each checked with its hash", async () => {
    const c = raw();
    c.media = { base: "https://media.example.org/s/", origins: ["https://media.example.org"] };
    for (const i of [...c.items.panels, ...c.items.clips]) delete i.file;
    const h = (n: number) => String(n).repeat(64);
    c.items.panels[0].display = [{ width: 1344, sha256: h(1) }, { width: 640, sha256: h(2) }];
    const { study, checks } = await compile(StudyConfig.parse(c), { readText: read, listDir: list });
    const [a, b] = study.panels;
    const at = (w: number) => `https://media.example.org/s/${a.code}-w${w}.webp`;
    expect(a.display).toEqual([{ url: at(640), width: 640 }, { url: at(1344), width: 1344 }]);
    expect(a.image).toBe(`https://media.example.org/s/${a.code}.png`); // the original stays the fallback
    expect(b.display).toBeUndefined();
    expect(checks).toContainEqual({ url: at(640), sha256: h(2) });
    expect(checks).toContainEqual({ url: at(1344), sha256: h(1) });
  });

  test("local display copies are copied under the panel's code", async () => {
    const c = raw();
    c.items.panels[0].display = [{ width: 640, file: "panel-a-640.webp" }];
    const { study, media } = await compile(StudyConfig.parse(c), { readText: read, listDir: list });
    const code = study.panels[0].code;
    expect(study.panels[0].display).toEqual([{ url: `media/${code}-w640.webp`, width: 640 }]);
    expect(media).toContainEqual({ from: "media/panel-a-640.webp", to: `media/${code}-w640.webp` });
  });

  test.each([
    ["a local copy without a file", (c: any) => (c.items.panels[0].display = [{ width: 640 }])],
    ["two copies of one width", (c: any) => (c.items.panels[0].display = [{ width: 640, file: "a.webp" }, { width: 640, file: "b.webp" }])],
    ["a width that isn't a whole number of pixels", (c: any) => (c.items.panels[0].display = [{ width: 64.5, file: "a.webp" }])],
  ])("display copies: rejects %s", (_name, mutate) => {
    const c = raw();
    mutate(c);
    expect(StudyConfig.safeParse(c).success).toBe(false);
  });
});
