// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { validateSubmission } from "../src/core/payload.js";
import type { Study } from "../src/core/types.js";
import { mountSession, type CompleteEvent } from "../src/ui/session.js";
import { loadExample, SESSION } from "./helpers.js";
import { cleanup, key, stubMedia, track } from "./ui-helpers.js";

afterEach(cleanup);
beforeEach(stubMedia);
let choice: Study; // examples/choice: reacts has 8 options, acts has 12; two stills' questions, two clip questions
let synthetic: Study;
beforeAll(async () => {
  ({ study: choice } = await loadExample("choice"));
  ({ study: synthetic } = await loadExample("synthetic"));
});

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const btn = (name: string) => $<HTMLButtonElement>(`[data-bp="${name}"]`);
const root = () => $(".bp");
const sets = () => $$("fieldset.bp-q");
const radios = (fs: HTMLElement) => [...fs.querySelectorAll<HTMLInputElement>("input[type=radio]")];
const checked = (fs: HTMLElement) => fs.querySelector<HTMLInputElement>("input:checked")?.value ?? null;
const pick = (fs: HTMLElement, v: number) => fs.querySelector<HTMLInputElement>(`input[value="${v}"]`)!.click();

async function mount(st: Study = choice) {
  const el = document.createElement("div");
  document.body.append(el);
  const c = track(mountSession(el, st, { session: SESSION, storage: null, reducedMotion: false }));
  await c.ready;
  return c;
}

describe("choice questions in the session", () => {
  test("a labelled radiogroup of n native radios, key hint then label", async () => {
    const c = await mount();
    btn("start").click();
    expect(c.getState().kind).toBe("panel");
    const [reacts, acts] = sets();
    expect(sets().map((f) => f.getAttribute("role"))).toEqual(["radiogroup", "radiogroup"]);
    expect(document.getElementById(reacts.getAttribute("aria-labelledby")!)!.textContent).toContain("what would it react to");
    expect(radios(reacts).map((r) => r.value)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(radios(acts)).toHaveLength(12);
    expect(new Set(radios(acts).map((r) => r.name)).size).toBe(1);
    expect(new Set([...radios(reacts), ...radios(acts)].map((r) => r.name)).size).toBe(2);
    // visible label = key hint + option; the tenth is key 0; the 11th and 12th have no key
    expect(radios(reacts)[0].closest("label")!.textContent).toBe("1, Nothing in particular");
    expect(radios(acts)[9].closest("label")!.textContent).toBe("0, Shook");
    expect(radios(acts)[9].getAttribute("aria-label")).toBe("0, Shook");
    expect(radios(acts)[10].closest("label")!.textContent).toBe("Changed shape");
    expect(radios(acts)[10].getAttribute("aria-label")).toBe("Changed shape");
    expect(radios(acts)[11].getAttribute("aria-label")).toBe("Something else");
  });

  test("no ordinal key, endpoints or direction text", async () => {
    await mount();
    expect($$(".bp-key")).toHaveLength(0); // the intro's ordered list of scale points
    expect(root().textContent).toContain("What did the shape react to?");
    btn("start").click();
    expect($$(".bp-dir")).toHaveLength(0);
    expect(root().textContent).not.toMatch(/\b[1-5] = |\([1-5]\)/);
  });

  test("an ordinal study still shows its key, its direction and an unroled fieldset", async () => {
    await mount(synthetic);
    expect($$(".bp-key").length).toBeGreaterThan(0);
    btn("start").click();
    expect($$(".bp-dir")).toHaveLength(1);
    expect(sets()[0].hasAttribute("role")).toBe(false);
    expect(radios(sets()[0]).map((r) => r.getAttribute("aria-label"))[0]).toBe("1, No: it does not look like a line drawing");
  });

  test("keys 1–9 and 0 select the first ten options; a key with no such option does nothing", async () => {
    const c = await mount();
    btn("start").click();
    key(root(), "3"); // the first unanswered question: option 3 of 8
    key(root(), "0"); // the next unanswered question: the tenth of 12
    expect(sets().map(checked)).toEqual(["3", "10"]);
    expect(btn("next").disabled).toBe(false);
    key(root(), "Enter");
    while (c.getState().kind === "panel") {
      pick(sets()[0], 1);
      pick(sets()[1], 1);
      btn("next").click();
    }
    expect(c.getState().kind).toBe("clip");
    key(root(), "9"); // the first unanswered question has 8 options: no option 9 there
    expect(sets().map(checked)).toEqual([null, null]);
    key(root(), "8");
    key(root(), "9");
    expect(sets().map(checked)).toEqual(["8", "9"]);
    expect(c.getState().keyboardUsed).toBe(true);
  });

  test("the 11th and 12th options are reached by clicking, and stored as 11 and 12", async () => {
    const c = await mount();
    btn("start").click();
    while (c.getState().kind === "panel") {
      pick(sets()[0], 1);
      pick(sets()[1], 1);
      btn("next").click();
    }
    pick(sets()[0], 8);
    pick(sets()[1], 11);
    const code = Object.keys(c.getState().answers.clips)[0];
    expect(c.getState().answers.clips[code]).toEqual({ trigger: 8, action: 11 });
    pick(sets()[1], 12);
    expect(c.getState().answers.clips[code]).toEqual({ trigger: 8, action: 12 });
  });

  test("a finished session's payload passes the shared validator", async () => {
    const c = await mount();
    const done = new Promise<CompleteEvent>((r) => c.on("complete", r));
    btn("start").click();
    while (c.getState().kind !== "end") {
      for (const fs of sets()) pick(fs, radios(fs).length); // the last option of each question: 8 and 12
      btn("next").click();
    }
    btn("finish").click();
    const { submission } = await done;
    expect(await validateSubmission(choice, JSON.parse(JSON.stringify(submission)))).toMatchObject({ ok: true });
    const clip = submission.order.clips[0];
    expect(submission.answers.clips[clip]).toEqual({ trigger: 8, action: 12 });
  });

  test("the shortcut line names the keys that exist", async () => {
    await mount();
    expect($('[data-bp="shortcuts"]').closest("label")!.textContent).toContain("1–9 and 0 answer");
  });
  test("in a mixed study the shortcut line follows the questions on the screen", async () => {
    const mixed = structuredClone(synthetic);
    mixed.scales.same = { kind: "choice", min: 1, max: 12, labels: Array.from({ length: 12 }, (_, i) => `Option ${i + 1}`) };
    mixed.questions.find((q) => q.id === "same")!.direction = undefined;
    const c = await mount(mixed);
    const line = () => $('[data-bp="shortcuts"]').closest("label")!.textContent!;
    expect(line()).toContain("1–9 and 0 answer"); // the intro covers every question
    btn("start").click();
    expect(c.getState().kind).toBe("panel"); // the still's question is ordinal
    expect(line()).toContain("Keyboard shortcuts: 1–5 answer");
    while (c.getState().kind === "panel") {
      pick(sets()[0], 1);
      btn("next").click();
    }
    expect(c.getState().kind).toBe("clip"); // a clip has an ordinal and a 12-option question
    expect(line()).toContain("1–9 and 0 answer");
  });
  test("a choice scale of up to nine options names exactly its keys", async () => {
    const eight = structuredClone(choice);
    eight.scales.acts = { ...eight.scales.acts, max: 8, labels: eight.scales.acts.labels.slice(0, 8) };
    await mount(eight);
    expect($('[data-bp="shortcuts"]').closest("label")!.textContent).toContain("Keyboard shortcuts: 1–8 answer");
  });
  test("an ordinal study's shortcut line is unchanged", async () => {
    await mount(synthetic);
    expect($('[data-bp="shortcuts"]').closest("label")!.textContent).toContain("Keyboard shortcuts: 1–5 answer, Enter next, Shift+Enter back, Space play or pause, R replay");
  });
});
