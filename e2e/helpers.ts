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

/**
 * The page must never be wider than the viewport (a mobile browser would zoom out).
 * Compares with the configured viewport: under isMobile, innerWidth grows to fit
 * overflowing content, so it can't be the yardstick.
 */
export async function expectNoOverflow(page: Page) {
  const view = page.viewportSize()!.width;
  const doc = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(doc, `page is ${doc}px wide in a ${view}px viewport`).toBeLessThanOrEqual(view);
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

/** No word in these elements is split across two lines (whitespace is the only place a line may break). */
export async function expectWholeWords(page: Page, selector: string) {
  const broken = await page.locator(selector).evaluateAll((els) =>
    els.flatMap((el) => {
      const out: string[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        for (const m of (n.textContent ?? "").matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(n, m.index!);
          r.setEnd(n, m.index! + m[0].length);
          const tops = new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top)));
          if (tops.size > 1) out.push(m[0]);
        }
      }
      return out;
    }),
  );
  expect(broken, "words broken across lines").toEqual([]);
}
