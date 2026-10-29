import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoOverflow, expectWholeWords, shot, state, watchConsole } from "./helpers.js";

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
  // tabular figures where numbers line up; prose keeps the face's own spacing
  const numeric = (sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).fontVariantNumeric);
  expect(await numeric(".bp-table td")).toBe("tabular-nums");
  expect(await numeric(".bp-axis")).toBe("tabular-nums");
  expect(await numeric('[data-bp="headline"]')).toBe("normal");
  expect(await numeric(".bp-section p")).toBe("normal");

  // opt in: 200, and the same body again is refused as a duplicate
  const freshTally = page.waitForRequest((r) => /\/api\/tally\?fresh=[0-9a-f-]{36}$/.test(r.url()));
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/submit"));
  await page.getByRole("button", { name: "Add my ratings to the public tally" }).click();
  await expect(page.getByText("Added. Thank you.")).toBeVisible();
  const body = (await sent).postData()!;
  expect(body).not.toMatch(/engine|userAgent|Mozilla/i);
  await freshTally; // the standalone page reads past the edge cache once this visitor has opted in
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

test("results fit a 320 px phone even in a wide host font", async ({ page }) => {
  const c = watchConsole(page);
  await page.setViewportSize({ width: 320, height: 700 });
  // a host theme may set any font; monospace is the widest generic one
  await page.addInitScript(() => addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    // and a host reset that strips list styles in a layer below the kit's
    s.textContent = "@layer reset, blindpanel; @layer reset { ul, ol { list-style: none; padding: 0; } } .bp { --bp-font: monospace; }";
    document.head.prepend(s);
  }));
  await page.goto(BASE);
  await page.getByRole("button", { name: "Start" }).click();
  for (;;) {
    const h = (await page.getByRole("heading", { level: 2 }).textContent()) ?? "";
    if (h.startsWith("Done")) break;
    for (const fs of await page.locator("fieldset").all()) await fs.getByRole("radio").nth(h.startsWith("Clip 2") ? 1 : 3).check();
    await page.getByRole("button", { name: "Next" }).click();
  }
  await expectNoOverflow(page);
  await page.getByRole("button", { name: "See where you land" }).click();
  await expect(page.getByRole("heading", { name: "Where you land" })).toBeVisible();
  await expectNoOverflow(page);
  for (const l of await page.locator("ul.bp-caveats").all()) expect(await l.evaluate((e) => getComputedStyle(e).listStyleType)).toBe("disc");
  // the reveal table squeezes its columns, but never breaks a clip's number, a model's name or "Open"
  await expectWholeWords(page, ".bp-reveal tbody th, .bp-reveal tbody td:nth-child(2), .bp-reveal tbody td:last-child");
  c.expectClean();
});

test("each question's legend sits under its rule, not on it", async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole("button", { name: "Start" }).click();
  while (/^Still/.test((await page.getByRole("heading", { level: 2 }).textContent()) ?? "")) {
    for (const fs of await page.locator("fieldset").all()) await fs.getByRole("radio").nth(3).check();
    await page.getByRole("button", { name: "Next" }).click();
  }
  const gaps = await page.locator("fieldset.bp-q").evaluateAll((fss) =>
    fss.map((fs) => fs.querySelector("legend")!.getBoundingClientRect().top - (fs.getBoundingClientRect().top + parseFloat(getComputedStyle(fs).borderTopWidth))),
  );
  expect(gaps.length).toBeGreaterThan(0);
  for (const g of gaps) expect(g).toBeGreaterThanOrEqual(8);
});

test("the scale keys keep their numbers when a host resets lists in its own lower layer", async ({ page }) => {
  // the explorer's reset (`ul, ol { list-style: none }` in @layer reset, declared before blindpanel) hid them
  await page.addInitScript(() => addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    s.textContent = "@layer reset, blindpanel; @layer reset { ul, ol { list-style: none; padding: 0; } }";
    document.head.prepend(s);
  }));
  await page.goto(BASE);
  const keys = page.locator("ol.bp-key");
  await expect(keys.first()).toBeVisible();
  for (const k of await keys.all()) expect(await k.evaluate((e) => getComputedStyle(e).listStyleType)).toBe("decimal");
});

test("a number key selects at once, and only a hovering pointer gets a hover fill", async ({ page }, info) => {
  await page.goto(BASE);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("heading", { name: /^Still 1 of/ })).toBeVisible();
  const first = page.locator(".bp-opt").first();
  const rest = await first.evaluate((o) => getComputedStyle(o).backgroundColor);
  // touch: a tap leaves the pointer "hovering", so every :hover rule must sit under (hover: hover)
  const ungated = await page.evaluate(() => {
    const out: string[] = [];
    const walk = (rules: CSSRuleList, gated: boolean) => {
      for (const r of rules) {
        if (r instanceof CSSMediaRule) { walk(r.cssRules, gated || /\(hover:\s*hover\)/.test(r.conditionText)); continue; }
        if (r instanceof CSSStyleRule && r.selectorText.includes(":hover") && !gated) out.push(r.selectorText);
        if ("cssRules" in r) walk((r as CSSGroupingRule).cssRules, gated);
      }
    };
    for (const s of document.styleSheets) walk(s.cssRules, false);
    return out;
  });
  expect(ungated).toEqual([]);
  if (info.project.name.startsWith("390")) return;
  await page.mouse.move(0, 0);
  // the most frequent action in a session, and a keyboard one: the selection must not fade in
  await page.keyboard.press("4");
  const picked = page.locator(".bp-opt:has(.bp-radio:checked)");
  await expect(picked).toHaveCount(1);
  expect(await picked.evaluate((o) => o.getAnimations().map((a) => (a as CSSTransition).transitionProperty))).toEqual([]);
  await page.keyboard.press("2");   // and the one it leaves snaps back too
  expect(await page.evaluate(() => [...document.querySelectorAll(".bp-opt")].flatMap((o) => o.getAnimations()).length)).toBe(0);
  // a mouse still gets its hover
  await first.hover();
  await expect.poll(() => first.evaluate((o) => getComputedStyle(o).backgroundColor)).not.toBe(rest);
});
