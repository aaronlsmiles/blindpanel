import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoOverflow, shot, watchConsole } from "./helpers.js";

const BASE = "http://localhost:5312/";

test("choice questions: n radios, number keys, no ordinal text, answers stored as 1…n", async ({ page }, info) => {
  const c = watchConsole(page);
  await page.goto(BASE);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("A choice-question test study");
  await expect(page.locator(".bp-key")).toHaveCount(0);
  await expectAccessible(page);
  await page.getByRole("button", { name: "Start" }).click();

  // the stills: two choice questions each, 8 and 12 options; keys 3 and 0 (the tenth) answer them in turn
  await expect(page.getByRole("heading", { name: /^Still 1 of/ })).toBeFocused();
  let groups = page.getByRole("radiogroup");
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0).getByRole("radio")).toHaveCount(8);
  await expect(groups.nth(1).getByRole("radio")).toHaveCount(12);
  await expect(page.locator(".bp-dir")).toHaveCount(0);
  await expectAccessible(page);
  await shot(page, info, "choice-1-still");
  while (/^Still/.test((await page.getByRole("heading", { level: 2 }).textContent()) ?? "")) {
    await page.keyboard.press("3");
    await page.keyboard.press("0");
    await expect(groups.nth(0).getByRole("radio", { name: /^3, / })).toBeChecked();
    await expect(groups.nth(1).getByRole("radio", { name: "0, Shook" })).toBeChecked();
    await page.keyboard.press("Enter");
  }

  // clip 1 by keys: 8 of 8 and 9 of 12
  await expect(page.getByRole("heading", { name: "Clip 1 of 2" })).toBeVisible();
  groups = page.getByRole("radiogroup");
  await expectAccessible(page);
  await shot(page, info, "choice-2-clip");
  await page.keyboard.press("8");
  await page.keyboard.press("9");
  await page.keyboard.press("Enter");

  // clip 2 by clicking: the 11th and 12th options have no key
  await expect(page.getByRole("heading", { name: "Clip 2 of 2" })).toBeVisible();
  await groups.nth(0).getByRole("radio").nth(7).check();
  await groups.nth(1).getByRole("radio", { name: "Something else" }).check();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: /^Done: 2 clips rated/ })).toBeVisible();
  await page.getByRole("button", { name: "See where you land" }).click();
  await expect(page.getByRole("heading", { name: "Where you land" })).toBeFocused();
  await expect(page.getByRole("cell", { name: /^Engine / }).first()).toBeVisible();
  await expect(page.locator(".bp-strip")).toHaveCount(0); // no ordinal strip for choice questions

  const sent = page.waitForRequest((r) => r.url().endsWith("/api/submit"));
  await page.getByRole("button", { name: "Add my ratings to the public tally" }).click();
  await expect(page.getByText("Added. Thank you.")).toBeVisible();
  const body = JSON.parse((await sent).postData()!);
  const [first, second] = body.order.clips as string[];
  expect(body.answers.clips[first]).toEqual({ trigger: 8, action: 9 });
  expect(body.answers.clips[second]).toEqual({ trigger: 8, action: 12 });
  for (const answers of Object.values(body.answers.baseline) as Record<string, number>[]) {
    expect(answers).toEqual({ trigger_still: 3, action_still: 10 });
  }
  await expectAccessible(page);
  await shot(page, info, "choice-3-results");
  c.expectClean();
});

test("twelve options fit a 320 px phone", async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole("button", { name: "Start" }).click();
  while (/^Still/.test((await page.getByRole("heading", { level: 2 }).textContent()) ?? "")) {
    await page.keyboard.press("1");
    await page.keyboard.press("1");
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("heading", { name: "Clip 1 of 2" })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  await expectNoOverflow(page);
  await expect(page.getByRole("radiogroup").nth(1).getByRole("radio")).toHaveCount(12);
});
