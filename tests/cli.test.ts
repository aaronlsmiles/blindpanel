// The CLI against the built kit (dist/): run `npm run build` first; setup does.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStudy } from "../src/cli/load.js";
import { buildSite } from "../src/cli/site.js";
import { verify, type Check } from "../src/cli/verify.js";
import { exportRows, report } from "../src/cli/data.js";
import { main } from "../src/cli/main.js";
import { serve } from "../src/cli/dev.js";
import { participantOrder } from "../src/core/order.js";
import { buildSubmission } from "../src/core/payload.js";

const EX = join(import.meta.dirname, "../examples/synthetic");
const tmp = mkdtempSync(join(tmpdir(), "bp-cli-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const failed = (cs: Check[]) => cs.filter((c) => !c.ok).map((c) => c.name);

function freshCopy() {
  const dir = mkdtempSync(join(tmp, "study-"));
  cpSync(EX, dir, { recursive: true });
  return dir;
}
async function built() {
  const dir = freshCopy();
  const l = await loadStudy(join(dir, "study.yaml"));
  const out = buildSite(l, join(dir, "site"));
  return { dir, l, out };
}

describe("build", () => {
  test("ships only the browser modules (no zod, no schema, no server)", async () => {
    const { out } = await built();
    const files = readdirSync(join(out, "blindpanel"), { recursive: true }).map(String);
    expect(files).toContain("ui/app.js");
    expect(files.some((f) => /schema|compile|server|cli/.test(f))).toBe(false);
    const js = files.filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(out, "blindpanel", f), "utf8")).join("\n");
    expect(js).not.toMatch(/from ["']zod["']|from ["']yaml["']/);
    expect(readdirSync(join(out, "media"))).toHaveLength(5);
    expect(readdirSync(join(out, "media")).every((f) => /^[cp][0-9a-z]{5}\.(mp4|png)$/.test(f))).toBe(true);
  });
});

describe("verify catches each problem", () => {
  test("a clean build passes", async () => {
    const { l, out } = await built();
    expect(failed(await verify(l, { dist: out }))).toEqual([]);
  });
  test.each([
    ["a model name in shipped code", (out: string) => appendFileSync(join(out, "blindpanel/ui/app.js"), "\n// Engine Alpha\n"), "no banned term in the built site (reveal.json exempt)"],
    ["a model name in a file name", (out: string) => renameSync(join(out, "index.html"), join(out, "engine-alpha.html")), "no banned term in the built site (reveal.json exempt)"],
    ["a model name in study.json", (out: string) => appendFileSync(join(out, "study.json"), '{"x":"engine-beta"}'), "no banned term in the built site (reveal.json exempt)"],
    ["a secret-like file", (out: string) => writeFileSync(join(out, ".env"), "X=1"), "no secrets or secret-like files in the built site"],
    ["a secret key in code", (out: string) => appendFileSync(join(out, "blindpanel/ui/app.js"), "\nconst k = 'sb_secret_abcdef';\n"), "no secrets or secret-like files in the built site"],
    ["an external script", (out: string) => appendFileSync(join(out, "index.html"), '<script src="https://cdn.example.com/x.js"></script>'), "no URLs outside media.origins in the built site"],
  ])("%s", async (_n, doctor, check) => {
    const { l, out } = await built();
    doctor(out);
    expect(failed(await verify(l, { dist: out }))).toContain(check);
  });
  test("reveal.json is the declared exemption", async () => {
    const { l, out } = await built();
    expect(readFileSync(join(out, "reveal.json"), "utf8")).toContain("Engine Alpha");
    expect(failed(await verify(l, { dist: out }))).toEqual([]);
  });
  test("a wording change without an instrument bump", async () => {
    const dir = freshCopy();
    const y = join(dir, "study.yaml");
    writeFileSync(y, readFileSync(y, "utf8").replace("Watch the whole clip before answering.", "Watch the clip."));
    const cs = await verify(await loadStudy(y));
    expect(cs.find((c) => c.name === "wording matches study.lock.json")).toMatchObject({ ok: false, detail: expect.stringMatching(/bump/) });
    expect(await main(["lock", y]).catch((e) => e.message)).toMatch(/Bump instrument/);
    writeFileSync(y, readFileSync(y, "utf8").replace('instrument: "1"', 'instrument: "2"'));
    expect(await main(["lock", y])).toBe(0);
    expect(failed(await verify(await loadStudy(y)))).toEqual([]);
  });
  test("a changed media file", async () => {
    const dir = freshCopy();
    appendFileSync(join(dir, "media/box-drift.mp4"), "x");
    expect(failed(await verify(await loadStudy(join(dir, "study.yaml"))))).toContain("media sha256: media/box-drift.mp4");
  });
  test("a model name in a media URL", async () => {
    const dir = freshCopy();
    const y = join(dir, "study.yaml");
    writeFileSync(y, readFileSync(y, "utf8").replace("base: ./media/", "base: https://media.example.org/engine-alpha/").replace("origins: []", "origins: [https://media.example.org]"));
    expect(failed(await verify(await loadStudy(y)))).toContain("no banned term in media URLs");
  });
  test("--media: status, sha256 and response headers", async () => {
    const dir = freshCopy();
    const y = join(dir, "study.yaml");
    writeFileSync(y, readFileSync(y, "utf8").replace("base: ./media/", "base: https://media.example.org/s/").replace("origins: []", "origins: [https://media.example.org]"));
    const l = await loadStudy(y);
    const bytes = Object.fromEntries(readdirSync(join(EX, "media")).map((f) => [f, readFileSync(join(EX, "media", f))]));
    const byCode = new Map(l.config.items.clips.map((c) => [c.file!, c.id]));
    const files = [...l.config.items.clips, ...l.config.items.panels].map((x) => x.file!); // compile order
    // serve each URL with the bytes of the file at the same position
    const body = new Map(l.checks.map((c, i) => [c.url, bytes[files[i]]]));
    const ok: typeof fetch = (async (u: string) => new Response(body.get(u)!, { headers: { "content-type": "video/mp4" } })) as never;
    expect(failed(await verify(l, { media: true, fetch: ok }))).toEqual([]);
    const leaky: typeof fetch = (async (u: string) => new Response(body.get(u)!, { headers: { "x-amz-meta-source": "engine-alpha" } })) as never;
    expect(failed(await verify(l, { media: true, fetch: leaky })).length).toBeGreaterThan(0);
    const wrong: typeof fetch = (async () => new Response("nope")) as never;
    expect(failed(await verify(l, { media: true, fetch: wrong })).some((n) => n.startsWith("all "))).toBe(true);
    expect(byCode.size).toBe(3);
  });
});

describe("dev server, export, report", () => {
  let stop: () => void;
  const PORT = 5391;
  let url = "";
  let dataDir = "";
  beforeAll(async () => {
    const { l, out, dir } = await built();
    dataDir = join(dir, "data");
    const s = await serve(l, out, { port: PORT, host: "127.0.0.1", store: "file", dataDir });
    url = s.url;
    stop = () => s.server.close();
  });
  afterAll(() => stop());

  test("serves the page, ranges, submit (200 then 409) and the tally; then export and report", async () => {
    expect((await fetch(url)).status).toBe(200);
    const study = await (await fetch(url + "study.json")).json();
    const clip = study.parts.clips.items[0].video;
    const r = await fetch(url + clip, { headers: { range: "bytes=0-9" } });
    expect(r.status).toBe(206);
    expect((await r.arrayBuffer()).byteLength).toBe(10);

    const session = "4d6f3a52-9a1b-4c2d-8e3f-0a1b2c3d4e5f";
    const order = await participantOrder(study, session);
    const b = order.blocks[0];
    const sub = buildSubmission(study, {
      session, order, blocks: 1,
      answers: {
        baseline: Object.fromEntries(b.baseline.map((p) => [p, { drawing: 5 }])),
        clips: Object.fromEntries(b.clips.map((c, i) => [c, { look: 4 - i, same: 3 + i }])),
      },
      delivery: { autoplay: true, keyboard: true, seconds: 20 },
    });
    const post = () => fetch(url + "api/submit", { method: "POST", headers: { "content-type": "application/json", origin: url.replace(/\/$/, "") }, body: JSON.stringify(sub) });
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(409);
    const t = await (await fetch(url + "api/tally")).json();
    expect(t.n_sessions).toBe(1);

    const l = await loadStudy(join(EX, "study.yaml"));
    const out = join(tmp, "export");
    const rows = await (await import("../src/server/stores/file.js")).fileStore({ dir: dataDir }).rows("synthetic");
    expect(exportRows(l, rows, out)).toBe(1);
    const v = JSON.parse(readFileSync(join(out, "ratings-V0001.json"), "utf8"));
    expect(v.rater).toBe("V0001");
    expect(v.ratings.map((r: { clip: string }) => r.clip).every((c: string) => /^c0[1-3]$/.test(c))).toBe(true);
    expect(JSON.stringify(v)).not.toContain(session);
    expect(readFileSync(join(out, "ratings.csv"), "utf8").split("\n")[0]).toBe("visitor,instrument,part,position,item,question,score,flags");
    expect(report(l, rows)).toMatch(/1 submissions; 1 unflagged/);
    expect(existsSync(join(out, "ratings.csv"))).toBe(true);
  });
});
