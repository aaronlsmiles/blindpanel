// A scripted StillDrawn session against real media on R2 (BP_STILLDRAWN=1; needs the network).
// The script: a fixed session id, every still rated 5, every clip answered with the six
// raters' rounded mean. It shows what "where you land" looks like for a consensus rater.
import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expectAccessible, expectWholeWords, shot, watchConsole } from "./helpers.js";

const BASE = "http://localhost:5311/";
const SESSION = "5d1e7a2c-3b4f-4a6d-8e9f-0c1b2a3d4e5f";

test("scripted session: where a consensus rater lands", async ({ page }, info) => {
  test.setTimeout(120_000);
  const c = watchConsole(page);
  const study = JSON.parse(readFileSync(".blindpanel/e2e/stilldrawn/study.json", "utf8"));
  const reveal = JSON.parse(readFileSync(".blindpanel/e2e/stilldrawn/reveal.json", "utf8")); // test side only
  const codes: string[] = study.parts.clips.items.map((i: { code: string }) => i.code);
  const mean = (q: string, code: string) => {
    const j = codes.indexOf(code);
    const v = reveal.reference.ratings[q].map((r: (number | null)[]) => r[j]).filter((x: number | null) => x !== null);
    return Math.round(v.reduce((a: number, b: number) => a + b, 0) / v.length);
  };
  const clipByVideo = new Map(study.parts.clips.items.map((i: { code: string; video: string }) => [i.video, i.code]));
  await page.addInitScript(([key, session]) => {
    if (!localStorage.getItem(key))
      localStorage.setItem(key, JSON.stringify({ session, step: 0, blocks: 1, answers: { baseline: {}, clips: {} }, seconds: 0, keyboardUsed: false, shortcuts: true, completed: false }));
  }, [`blindpanel:${study.id}:${study.instrument}`, SESSION]);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));

  await page.goto(BASE);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(study.title);
  await page.getByRole("button", { name: "Start" }).click();
  let shotClip = false;
  for (;;) {
    const h = (await page.getByRole("heading", { level: 2 }).textContent()) ?? "";
    if (h.startsWith("Done")) break;
    if (h.startsWith("Still")) {
      await expect(page.locator(".bp-still img")).toHaveJSProperty("complete", true);
      await page.getByRole("radio", { name: /^5,/ }).check();
    } else {
      const code = clipByVideo.get(await page.locator("video").getAttribute("src"))!;
      const sets = page.locator("fieldset");
      await sets.nth(0).getByRole("radio", { name: new RegExp(`^${mean("register", code as string)},`) }).check();
      await sets.nth(1).getByRole("radio", { name: new RegExp(`^${mean("sameness", code as string)},`) }).check();
      if (!shotClip) {
        await page.locator("video").evaluate((v: HTMLVideoElement) => (v.readyState >= 2 ? null : new Promise((r) => v.addEventListener("loadeddata", r, { once: true }))));
        await expectAccessible(page);
        await shot(page, info, "sd-clip");
        shotClip = true;
      }
    }
    await page.getByRole("button", { name: "Next" }).click();
  }
  // before the reveal: no model name anywhere in the page or in any request so far
  expect(await page.content()).not.toMatch(/Gen-4|Turbo|Wan 2|LTX|MiniMax|Runway|Lightricks|\bH3\b/);
  expect(requests.filter((u) => /reveal\.json|gen4|wan22|ltx23|h3-fal|_campush_|_idle_|_burst_/.test(u))).toEqual([]);
  // stills arrive as their WebP display copies; the PNGs the raters saw are never fetched
  const stills = requests.filter((u) => u.startsWith("https://media.studionephele.com/") && !u.endsWith(".mp4"));
  expect(stills.length).toBeGreaterThan(0);
  expect(stills.filter((u) => !/\/p[0-9a-z]{5}-w\d+\.webp$/.test(u))).toEqual([]);

  await page.getByRole("button", { name: "See where you land" }).click();
  await expect(page.getByRole("heading", { name: "Where you land" })).toBeVisible();
  await expectAccessible(page);
  // "Clip 1", the model names and "Open" never split mid-word, at 390 too
  await expectWholeWords(page, ".bp-reveal tbody th, .bp-reveal tbody td:nth-child(2), .bp-reveal tbody td:last-child");
  await shot(page, info, "sd-results");
  const out = {
    project: info.project.name,
    session: SESSION,
    headlines: await page.locator('[data-bp="headline"]').allTextContents(),
    facts: await page.locator(".bp-section[data-q] > p:not(.bp-legend):not(.bp-headline)").allTextContents(),
    raters: await page.locator(".bp-section[data-q] .bp-tables table:first-child tbody tr").allTextContents(),
    metrics: await page.locator(".bp-section[data-q] .bp-tables table:nth-child(2) tbody tr").allTextContents(),
    reveal: await page.locator(".bp-reveal tbody tr").allTextContents(),
  };
  mkdirSync("test-results/screens", { recursive: true });
  writeFileSync(`test-results/screens/${info.project.name}-sd-landing.json`, JSON.stringify(out, null, 1));
  // leave the author out and the panel shrinks to five
  await page.getByRole("checkbox", { name: /Leave out AARON/ }).check();
  await expect(page.locator('[data-bp="headline"]').first()).toContainText(/of its 5 raters|all 5|every one of its 5/);
  c.expectClean();
});
