// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { mountSession } from "../src/ui/session.js";
import type { Study } from "../src/core/types.js";
import { loadExample, SESSION } from "./helpers.js";
import { cleanup, stubMedia, track } from "./ui-helpers.js";

afterEach(cleanup);
let withStills: Study, clipsOnly: Study;
beforeAll(async () => {
  ({ study: withStills } = await loadExample("synthetic"));
  ({ study: clipsOnly } = await loadExample("synthetic", (c) => {
    delete c.parts.baseline;
    c.questions = c.questions.filter((q: { part: string }) => q.part !== "baseline");
  }));
});
beforeEach(stubMedia);

async function lede(study: Study, intro?: string | false) {
  const el = document.createElement("div");
  document.body.append(el);
  const c = track(mountSession(el, study, { session: SESSION, storage: null, reducedMotion: false, ...(intro === undefined ? {} : { intro }) }));
  await c.ready;
  return document.querySelector(".bp-lede")!.textContent;
}

describe("the intro's lede sentence", () => {
  test("without the option it is unchanged from 0.3.0", async () => {
    expect(await lede(withStills)).toBe("1 still image first, then 2 short clips. Model names stay hidden until you finish.");
    cleanup();
    expect(await lede(clipsOnly)).toBe("2 short clips. Model names stay hidden until you finish.");
  });
  test("a host's sentence replaces the second part", async () => {
    const intro = "Answer each clip on its own.";
    expect(await lede(withStills, intro)).toBe("1 still image first, then 2 short clips. Answer each clip on its own.");
    expect(document.body.textContent).not.toContain("Model names");
    cleanup();
    expect(await lede(clipsOnly, intro)).toBe("2 short clips. Answer each clip on its own.");
  });
  test("false shows only the count", async () => {
    expect(await lede(withStills, false)).toBe("1 still image first, then 2 short clips.");
    expect(document.body.textContent).not.toContain("Model names");
    cleanup();
    expect(await lede(clipsOnly, false)).toBe("2 short clips.");
  });
});
