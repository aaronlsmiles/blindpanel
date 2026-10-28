import { expect, test } from "@playwright/test";
import { expectAccessible, shot, state, watchConsole } from "./helpers.js";

const BASE = "http://localhost:5310/";

test("keyboard only: Tab to Start, then number keys and Enter to the end", async ({ page }, info) => {
  const c = watchConsole(page);
  await page.goto(BASE);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("A three-clip test study");
  await expectAccessible(page);
  await shot(page, info, "1-intro");
  const start = page.getByRole("button", { name: "Start" });
  for (let i = 0; i < 10 && !(await start.evaluate((b) => b === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(start).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /^Still 1 of/ })).toBeFocused();
  // stills: one question each
  while (/^Still/.test((await page.getByRole("heading", { level: 2 }).textContent()) ?? "")) {
    await page.keyboard.press("4");
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("heading", { name: "Clip 1 of 2" })).toBeVisible();
  await expect(page.locator("video")).toHaveAttribute("autoplay", "");
  await expectAccessible(page);
  await shot(page, info, "2-clip");
  await page.keyboard.press("2");
  await page.keyboard.press("Enter"); // gate: question 2 unanswered
  await expect(page.getByRole("heading", { name: "Clip 1 of 2" })).toBeVisible();
  await page.keyboard.press("5");
  await expect(page.getByRole("radio", { name: "2, Mostly not" }).first()).toBeChecked();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Clip 2 of 2" })).toBeVisible();
  await page.keyboard.press("Shift+Enter");
  await expect(page.getByRole("heading", { name: "Clip 1 of 2" })).toBeVisible();
  await expect(page.locator("fieldset").nth(1).getByRole("radio", { name: /^5,/ })).toBeChecked();
  await page.keyboard.press("Enter");
  await page.keyboard.press("3");
  await page.keyboard.press("3");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /^Done: 2 clips rated/ })).toBeVisible();
  expect((await state(page)).keyboardUsed).toBe(true);
  c.expectClean();
});

test("results only after finishing: reveal.json is not requested before", async ({ page }, info) => {
  const c = watchConsole(page);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await page.goto(BASE);
  await page.getByRole("button", { name: "Start" }).click();
  const answerAll = async (v: number) => {
    for (const fs of await page.locator("fieldset").all()) await fs.getByRole("radio").nth(v - 1).check();
  };
  for (;;) {
    const h = (await page.getByRole("heading", { level: 2 }).textContent()) ?? "";
    if (h.startsWith("Done")) break;
    await answerAll(h.startsWith("Clip 2") ? 2 : 4);
    await page.getByRole("button", { name: "Next" }).click();
  }
  await page.getByRole("button", { name: "Rate the last clip first" }).click();
  for (;;) {
    const h = (await page.getByRole("heading", { level: 2 }).textContent()) ?? "";
    if (h.startsWith("Done")) break;
    await answerAll(1);
    await page.getByRole("button", { name: "Next" }).click();
  }
  await expect(page.getByRole("heading", { name: "Done: 3 clips rated" })).toBeVisible();
  expect(requests).not.toContain("/reveal.json");
  expect(await page.content()).not.toMatch(/engine/i);
  await page.getByRole("button", { name: "See where you land" }).click();
  await expect(page.getByRole("heading", { name: "Where you land" })).toBeFocused();
  expect(requests).toContain("/reveal.json");
  await expect(page.getByRole("cell", { name: "Engine Alpha" })).toBeVisible();
  await expect(page.locator('[data-bp="headline"]').first()).toContainText(/You agree with the panel's average|answers to this question were the same/);
  await expect(page.getByRole("heading", { name: "Other visitors" })).toBeVisible();

  // opt in: 200, and the same body again is refused as a duplicate
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/submit"));
  await page.getByRole("button", { name: "Add my ratings to the public tally" }).click();
  await expect(page.getByText("Added. Thank you.")).toBeVisible();
  const body = (await sent).postData()!;
  expect(body).not.toMatch(/engine|userAgent|Mozilla/i);
  const again = await page.request.post(BASE + "api/submit", { data: body, headers: { "content-type": "application/json", origin: BASE.slice(0, -1) } });
  expect(again.status()).toBe(409);
  await expect(page.getByRole("button", { name: "Add my ratings to the public tally" })).toBeDisabled();
  await expectAccessible(page);
  await shot(page, info, "3-results");
  c.expectClean();
});

test("reduced motion: no autoplay, a note, and the video stays paused", async ({ page }) => {
  const c = watchConsole(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(BASE);
  await page.getByRole("button", { name: "Start" }).click();
  while (/^Still/.test((await page.getByRole("heading", { level: 2 }).textContent()) ?? "")) {
    await page.getByRole("radio").nth(4).check();
    await page.getByRole("button", { name: "Next" }).click();
  }
  const video = page.locator("video");
  await expect(video).not.toHaveAttribute("autoplay", /.*/);
  await expect(page.getByText(/Autoplay is off/)).toBeVisible();
  await page.waitForTimeout(400);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  c.expectClean();
});

test("progress survives a reload, and the gate holds after it", async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("radio").nth(2).check();
  await page.getByRole("button", { name: "Next" }).click();
  const before = await state(page);
  await page.reload();
  await expect(page.getByRole("heading", { level: 2 })).not.toHaveText("A three-clip test study");
  expect((await state(page)).step).toBe(before.step);
  expect((await state(page)).session).toBe(before.session);
  if (await page.locator("fieldset").count()) await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
});

test("the tally endpoint is cacheable and hides nothing it shouldn't", async ({ request }) => {
  const r = await request.get(BASE + "api/tally");
  expect(r.status()).toBe(200);
  expect(r.headers()["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=3600");
  expect(await r.text()).not.toMatch(/engine/i);
});
