// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { mountSession, type CompleteEvent } from "../src/ui/session.js";
import type { Study } from "../src/core/types.js";
import { loadExample, SESSION } from "./helpers.js";
import { cleanup, stubMedia, track } from "./ui-helpers.js";

afterEach(cleanup);
let study: Study;
beforeAll(async () => ({ study } = await loadExample("synthetic")));
beforeEach(stubMedia);

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const btn = (name: string) => $<HTMLButtonElement>(`[data-bp="${name}"]`);

test("a host's end option replaces the reveal sentence and the button label; complete still fires", async () => {
  const el = document.createElement("div");
  document.body.append(el);
  const c = track(mountSession(el, study, {
    session: SESSION, storage: null, reducedMotion: false,
    end: { text: "That was the last clip of this part. Press Send to save your answers.", button: "Send my answers" },
  }));
  await c.ready;
  const done = new Promise<CompleteEvent>((r) => c.on("complete", r));
  btn("start").click();
  while (c.getState().kind !== "end") {
    for (const fs of document.querySelectorAll("fieldset.bp-q")) fs.querySelector<HTMLInputElement>('input[value="4"]')!.click();
    btn("next").click();
  }
  expect(document.body.textContent).toContain("Press Send to save your answers.");
  expect(document.body.textContent).not.toContain("which model made each clip");
  expect(btn("finish").textContent).toBe("Send my answers");
  // the host decides what comes next: no offer to rate the remaining clips (the synthetic study has one left)
  expect(document.querySelector('[data-bp="extend"]')).toBeNull();
  expect(document.body.textContent).not.toContain("You can do the rest first");
  btn("finish").click();
  expect((await done).submission.session).toBe(SESSION);
});
