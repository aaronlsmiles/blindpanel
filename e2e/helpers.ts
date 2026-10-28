import { expect, type ConsoleMessage, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Collects console errors and warnings and page errors; assert with expectClean(). */
export function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return { expectClean: () => expect(problems).toEqual([]) };
}

export async function expectAccessible(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** The page must never be wider than the viewport (a mobile browser would zoom out). */
export async function expectNoOverflow(page: Page) {
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: window.innerWidth }));
  expect(w.doc, `page is ${w.doc}px wide in a ${w.view}px viewport`).toBeLessThanOrEqual(w.view);
}

export async function shot(page: Page, info: TestInfo, name: string) {
  await expectNoOverflow(page);
  await page.screenshot({ path: `test-results/screens/${info.project.name}-${name}.png`, fullPage: true });
}

export const state = (page: Page) =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("blindpanel:"));
    return k ? JSON.parse(localStorage.getItem(k)!) : null;
  });
