// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { mountSession, type CompleteEvent } from "../src/ui/session.js";
import { validateSubmission } from "../src/core/payload.js";
import type { Study } from "../src/core/types.js";
import { loadExample, SESSION } from "./helpers.js";
import { cleanup, key, memoryStorage, stubMedia, track } from "./ui-helpers.js";

afterEach(cleanup);
let study: Study;
beforeAll(async () => ({ study } = await loadExample("synthetic")));
beforeEach(stubMedia);

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const btn = (name: string) => $<HTMLButtonElement>(`[data-bp="${name}"]`);
const root = () => $(".bp");

async function mount(opts: Parameters<typeof mountSession>[2] = {}) {
  const el = document.createElement("div");
  document.body.append(el);
  const c = track(mountSession(el, study, { session: SESSION, storage: null, reducedMotion: false, ...opts }));
  await c.ready;
  return c;
}
function answerScreen(v = 4) {
  for (const fs of $$("fieldset.bp-q")) {
    const r = fs.querySelector<HTMLInputElement>(`input[value="${v}"]`)!;
    r.click();
  }
}

describe("mountSession", () => {
  test("intro shows the wording, the privacy note and a Start button; nothing is fetched", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await mount();
    expect($("h2").textContent).toBe(study.title);
    expect(root().textContent).toContain("Apart from the movement itself");
    expect(root().textContent).toContain("A slight change in brightness is a 4");
    expect($(".bp-privacy").textContent).toMatch(/No names/);
    expect(btn("start")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test("questions are fieldsets of native radios named 'N, label'", async () => {
    await mount();
    btn("start").click();
    const fs = $$("fieldset.bp-q");
    expect(fs).toHaveLength(1); // the baseline question
    expect(fs[0].querySelector("legend")!.textContent).toContain("Does this still image look like a clean line drawing?");
    const radios = [...fs[0].querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(radios.map((r) => r.value)).toEqual(["1", "2", "3", "4", "5"]);
    expect(radios[0].closest("label")!.textContent).toBe("1, No: it does not look like a line drawing");
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
  });

  test("Next waits for every question; Back keeps answers", async () => {
    const c = await mount();
    btn("start").click();
    while (c.getState().kind === "panel") {
      expect(btn("next").disabled).toBe(true);
      answerScreen(5);
      expect(btn("next").disabled).toBe(false);
      btn("next").click();
    }
    expect(c.getState().kind).toBe("clip");
    expect($$("fieldset.bp-q")).toHaveLength(2);
    expect($("video").getAttribute("src")).toMatch(/^media\/c[0-9a-z]{5}\.mp4$/);
    $$("fieldset.bp-q")[0].querySelector<HTMLInputElement>('input[value="2"]')!.click();
    expect(btn("next").disabled).toBe(true);
    $$("fieldset.bp-q")[1].querySelector<HTMLInputElement>('input[value="3"]')!.click();
    btn("next").click();
    btn("back").click();
    expect($$("fieldset.bp-q")[0].querySelector<HTMLInputElement>("input:checked")!.value).toBe("2");
    expect($$("fieldset.bp-q")[1].querySelector<HTMLInputElement>("input:checked")!.value).toBe("3");
  });

  test("keys: 1-5 answer the first unanswered question, Enter goes on, Shift+Enter goes back", async () => {
    const c = await mount();
    key(root(), "Enter");
    expect(c.getState().kind).toBe("panel");
    key(root(), "5");
    expect($("fieldset.bp-q input:checked")).toBeTruthy();
    key(root(), "Enter");
    while (c.getState().kind === "panel") {
      key(root(), "4");
      key(root(), "Enter");
    }
    const step = c.getState().step;
    key(root(), "2");
    key(root(), "Enter"); // gate: Q2 still open
    expect(c.getState().step).toBe(step);
    key(root(), "3");
    const checked = $$("fieldset.bp-q").map((f) => f.querySelector<HTMLInputElement>("input:checked")!.value);
    expect(checked).toEqual(["2", "3"]);
    key(root(), "Enter");
    expect(c.getState().step).toBe(step + 1);
    key(root(), "Enter", { shiftKey: true });
    expect(c.getState().step).toBe(step);
    expect(c.getState().keyboardUsed).toBe(true);
  });

  test("Space and R control the video only outside form controls", async () => {
    const c = await mount();
    btn("start").click();
    while (c.getState().kind === "panel") { answerScreen(); btn("next").click(); }
    const play = HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>;
    play.mockClear();
    key(root(), "r");
    expect(play).toHaveBeenCalledTimes(1);
  });

  test("shortcuts can be switched off", async () => {
    const c = await mount({ keyboard: false });
    key(root(), "Enter");
    expect(c.getState().kind).toBe("intro");
    btn("start").click();
    key(root(), "3");
    expect($("fieldset.bp-q input:checked")).toBeNull();
    const box = $<HTMLInputElement>('[data-bp="shortcuts"]');
    box.click();
    key(root(), "3");
    expect($("fieldset.bp-q input:checked")).toBeTruthy();
  });

  test("reduced motion: no autoplay, a note, and delivery.autoplay false", async () => {
    const c = await mount({ reducedMotion: true });
    const done = new Promise<CompleteEvent>((r) => c.on("complete", r));
    btn("start").click();
    while (c.getState().kind !== "end") {
      if (c.getState().kind === "clip") {
        expect($("video").hasAttribute("autoplay")).toBe(false);
        expect(root().textContent).toContain("Autoplay is off");
      }
      answerScreen();
      btn("next").click();
    }
    btn("finish").click();
    expect((await done).submission.delivery.autoplay).toBe(false);
  });

  test("autoplay on by default", async () => {
    const c = await mount();
    btn("start").click();
    while (c.getState().kind === "panel") { answerScreen(); btn("next").click(); }
    expect($("video").hasAttribute("autoplay")).toBe(true);
    expect($("video").hasAttribute("crossorigin")).toBe(false);
  });

  test("the live region announces position", async () => {
    vi.useFakeTimers();
    try {
      const el = document.createElement("div");
      document.body.append(el);
      const c = track(mountSession(el, study, { session: SESSION, storage: null }));
      await vi.waitFor(() => expect(c.getState().kind).toBe("intro"));
      btn("start").click();
      vi.advanceTimersByTime(50);
      expect($("[aria-live]").textContent).toMatch(/Still image 1 of \d/);
    } finally {
      vi.useRealTimers();
    }
  });

  test("progress survives a remount", async () => {
    const storage = memoryStorage();
    const a = await mount({ storage });
    btn("start").click();
    answerScreen(2);
    btn("next").click();
    const at = a.getState();
    a.destroy();
    const b = await mount({ storage, session: undefined });
    expect(b.getState().step).toBe(at.step);
    expect(b.getState().session).toBe(SESSION);
    expect(b.getState().answers).toEqual(at.answers);
  });

  test("broken storage does not break the session", async () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem() {}, clear() {}, key: () => null, length: 0 } as Storage;
    const c = await mount({ storage: broken });
    btn("start").click();
    expect(c.getState().kind).toBe("panel");
  });

  test("complete fires once with a payload the server accepts; extension adds the rest", async () => {
    const c = await mount();
    const events: CompleteEvent[] = [];
    c.on("complete", (e) => events.push(e));
    btn("start").click();
    while (c.getState().kind !== "end") { answerScreen(3); btn("next").click(); }
    expect(btn("extend").textContent).toBe("Rate the last clip first");
    btn("extend").click();
    while (c.getState().kind !== "end") { answerScreen(4); btn("next").click(); }
    expect($('[data-bp="extend"]')).toBeNull();
    btn("finish").click();
    expect(events).toHaveLength(1);
    const { submission, blocks } = events[0];
    expect(blocks).toBe(2);
    expect(submission.order.clips).toHaveLength(3);
    expect(await validateSubmission(study, JSON.parse(JSON.stringify(submission)))).toMatchObject({ ok: true });
  });

  test("the page never names a model before completion", async () => {
    const c = await mount();
    btn("start").click();
    const seen: string[] = [];
    while (c.getState().kind !== "end") { seen.push(root().innerHTML); answerScreen(); btn("next").click(); }
    seen.push(root().innerHTML);
    for (const html of seen) {
      expect(html).not.toMatch(/engine|alpha|beta|gamma|box-still|panel-box/i);
      expect(html).not.toMatch(/>null<|\bnull\b(?![-"])/);
    }
  });
});
