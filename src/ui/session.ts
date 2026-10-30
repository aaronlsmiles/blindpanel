import { participantOrder, type ParticipantOrder } from "../core/order.js";
import { buildSubmission } from "../core/payload.js";
import { plainText } from "../core/text.js";
import type { Question, Study, Submission } from "../core/types.js";
import { h, put, rich } from "./dom.js";
import { clear, load, safeStorage, save } from "./storage.js";

export interface SessionOptions {
  /** a random UUID; made here when absent (and kept with the saved progress) */
  session?: string;
  /** where progress is kept; null turns saving off. Defaults to localStorage. */
  storage?: Storage | null;
  /** keyboard shortcuts on at the start (default true) */
  keyboard?: boolean;
  /** defaults to the prefers-reduced-motion media query */
  reducedMotion?: boolean;
  now?: () => number;
}

export interface CompleteEvent {
  submission: Submission;
  /** blocks finished: 1 for the session, 2 after extending */
  blocks: number;
}

type Events = { complete: CompleteEvent; step: { index: number; kind: Step["kind"] } };
type Listener<K extends keyof Events> = (e: Events[K]) => void;

type Step =
  | { kind: "intro" }
  | { kind: "panel"; code: string; n: number; of: number }
  | { kind: "clip"; code: string; n: number; of: number }
  | { kind: "end"; block: number };

interface Saved {
  session: string;
  step: number;
  blocks: number;
  answers: Submission["answers"];
  seconds: number;
  keyboardUsed: boolean;
  shortcuts: boolean;
  completed: boolean;
}

export interface SessionController {
  /** resolves once the participant's order is known and the first screen is drawn */
  ready: Promise<void>;
  on<K extends keyof Events>(event: K, cb: Listener<K>): () => void;
  getState(): Readonly<Saved> & { kind: Step["kind"] | "loading" };
  /** forget saved progress (for a fresh session, call it and mount again) */
  reset(): void;
  destroy(): void;
}

const prefersReduced = () => {
  try {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
};

export function mountSession(el: HTMLElement, study: Study, opts: SessionOptions = {}): SessionController {
  const store = safeStorage(opts.storage);
  const key = `blindpanel:${study.id}:${study.instrument}`;
  const now = opts.now ?? (() => Date.now());
  const reduced = opts.reducedMotion ?? prefersReduced();
  const autoplay = study.parts.clips.video.autoplay === "unless_reduced_motion" && !reduced;
  const saved = load<Saved>(store, key);
  const state: Saved = saved ?? {
    session: opts.session ?? globalThis.crypto.randomUUID(),
    step: 0,
    blocks: 1,
    answers: { baseline: {}, clips: {} },
    seconds: 0,
    keyboardUsed: false,
    shortcuts: opts.keyboard ?? true,
    completed: false,
  };
  let tick = now();
  let order: ParticipantOrder | null = null;
  let steps: Step[] = [];
  let video: HTMLVideoElement | null = null;
  let destroyed = false;
  const listeners: { [K in keyof Events]: Listener<K>[] } = { complete: [], step: [] };
  const emit = <K extends keyof Events>(k: K, e: Events[K]) => listeners[k].forEach((cb) => cb(e));

  const qs = (part: Question["part"]) => study.questions.filter((q) => q.part === part);
  const scaleOf = (q: Question) => study.scales[q.scale];
  const panelOf = new Map(study.panels.map((p) => [p.code, p]));
  /** a still, with its display copies as a srcset when the study lists any; srcset and sizes are set
   *  before src so the browser never starts on the original. `sizes` follows the layout in style.css */
  const still = (code: string, alt: string, sizes: string) => {
    const p = panelOf.get(code)!;
    const set = p.display?.map((d) => `${d.url} ${d.width}w`).join(", ");
    return h("img", { srcset: set, sizes: set ? sizes : null, src: p.image, alt, decoding: "async" });
  };
  const clipItem = new Map(study.parts.clips.items.map((c) => [c.code, c]));

  const root = h("div", { class: "bp", "data-bp": "session" });
  const screen = h("section", { class: "bp-screen" });
  const live = h("div", { class: "bp-sr", "aria-live": "polite", "aria-atomic": "true" });
  root.append(screen, live);
  el.append(root);
  put(screen, h("p", { class: "bp-loading" }, "Loading…"));

  const announce = (msg: string) => {
    live.textContent = "";
    // a fresh text node after a frame, so repeated messages are read again
    setTimeout(() => (live.textContent = msg), 30);
  };
  const persist = () => {
    const t = now();
    state.seconds += Math.max(0, (t - tick) / 1000);
    tick = t;
    save(store, key, state);
  };

  function buildSteps() {
    if (!order) return;
    const used = order.blocks.slice(0, state.blocks);
    const nPanels = used.reduce((a, b) => a + b.baseline.length, 0);
    const nClips = used.reduce((a, b) => a + b.clips.length, 0);
    let p = 0;
    let c = 0;
    steps = [{ kind: "intro" }];
    used.forEach((b, i) => {
      for (const code of b.baseline) steps.push({ kind: "panel", code, n: ++p, of: nPanels });
      for (const code of b.clips) steps.push({ kind: "clip", code, n: ++c, of: nClips });
      steps.push({ kind: "end", block: i });
    });
  }

  const answered = (part: "baseline" | "clips", code: string) => {
    const a = state.answers[part][code] ?? {};
    return qs(part).every((q) => Number.isInteger(a[q.id]));
  };
  const stepComplete = (s: Step) =>
    s.kind === "panel" ? answered("baseline", s.code) : s.kind === "clip" ? answered("clips", s.code) : true;
  const canGoBack = (i: number) => i > 0 && steps[i - 1].kind !== "intro" && steps[i - 1].kind !== "end";

  function question(q: Question, part: "baseline" | "clips", code: string, num: number | null, onChange: () => void) {
    const name = `bp-${code}-${q.id}`;
    const current = state.answers[part][code]?.[q.id];
    const fs = h(
      "fieldset",
      { class: "bp-q", "data-q": q.id },
      h("legend", { class: "bp-legend" }, num ? h("span", { class: "bp-qnum" }, `${num}. `) : null, "“", rich(q.text), "”"),
      q.direction ? h("p", { class: "bp-dir" }, rich(q.direction)) : null,
      ...q.notes.map((n) => h("p", { class: "bp-note" }, rich(n))),
    );
    const scale = h("div", { class: "bp-scale" });
    scaleOf(q).labels.forEach((label, i) => {
      const v = i + 1;
      const input = h("input", { type: "radio", name, value: v, class: "bp-radio", checked: current === v, "aria-label": `${v}, ${plainText(label)}` });
      input.addEventListener("change", () => {
        (state.answers[part][code] ??= {})[q.id] = v;
        onChange();
      });
      scale.append(
        h("label", { class: "bp-opt" }, input, h("span", { class: "bp-num" }, String(v), h("span", { class: "bp-sr" }, ", ")), h("span", { class: "bp-lab" }, rich(label))),
      );
    });
    fs.append(scale);
    return fs;
  }

  function nav(i: number, nextLabel = "Next") {
    const back = h("button", { type: "button", class: "bp-btn", disabled: !canGoBack(i), "data-bp": "back" }, "Back");
    const next = h("button", { type: "button", class: "bp-btn bp-primary", disabled: !stepComplete(steps[i]), "data-bp": "next" }, nextLabel);
    back.addEventListener("click", () => go(i - 1));
    next.addEventListener("click", () => go(i + 1));
    return { el: h("div", { class: "bp-nav" }, back, h("span", { class: "bp-progress" }, progressText(i)), next), next };
  }

  function progressText(i: number) {
    const s = steps[i];
    return s.kind === "panel" || s.kind === "clip" ? `${s.n} of ${s.of}` : "";
  }

  function shortcutsToggle() {
    const box = h("input", { type: "checkbox", checked: state.shortcuts, "data-bp": "shortcuts" });
    box.addEventListener("change", () => {
      state.shortcuts = box.checked;
      persist();
    });
    return h(
      "label",
      { class: "bp-toggle" },
      box,
      " Keyboard shortcuts: 1–5 answer, Enter next, Shift+Enter back, Space play or pause, R replay",
    );
  }

  function heading(text: string) {
    return h("h2", { class: "bp-h", tabindex: -1 }, text);
  }

  function renderIntro(i: number) {
    const clipQs = qs("clips");
    const start = h("button", { type: "button", class: "bp-btn bp-primary", "data-bp": "start" }, "Start");
    start.addEventListener("click", () => go(i + 1));
    const nClips = order!.blocks[0].clips.length;
    const nPanels = order!.blocks[0].baseline.length;
    put(screen, 
      heading(study.title),
      h(
        "p",
        { class: "bp-lede" },
        study.parts.baseline && nPanels
          ? `${nPanels} still ${nPanels === 1 ? "image" : "images"} first, then ${nClips} short clips. Model names stay hidden until you finish.`
          : `${nClips} short clips. Model names stay hidden until you finish.`,
      ),
      ...(study.parts.baseline?.intro ?? []).map((p) => h("p", {}, rich(p))),
      ...study.parts.clips.intro.map((p) => h("p", {}, rich(p))),
      ...clipQs.map((q, k) =>
        h(
          "div",
          { class: "bp-qintro" },
          h("p", { class: "bp-legend" }, h("span", { class: "bp-qnum" }, `${k + 1}. `), "“", rich(q.text), "”"),
          q.direction ? h("p", { class: "bp-dir" }, rich(q.direction)) : null,
          h("ol", { class: "bp-key" }, ...scaleOf(q).labels.map((l) => h("li", {}, rich(l)))),
          ...[...q.notes, ...q.intro_notes].map((n) => h("p", { class: "bp-note" }, rich(n))),
        ),
      ),
      h("p", { class: "bp-watch" }, h("strong", {}, rich(study.parts.clips.watch_note))),
      h("p", { class: "bp-privacy" }, rich(study.privacy)),
      shortcutsToggle(),
      h("div", { class: "bp-nav" }, h("span"), start),
    );
  }

  function renderItem(i: number, s: Extract<Step, { kind: "panel" | "clip" }>) {
    const part = s.kind === "panel" ? "baseline" : "clips";
    const { el: navEl, next } = nav(i);
    const onChange = () => {
      persist();
      const ok = stepComplete(s);
      if (ok && next.disabled) announce("All answered. Next is available.");
      next.disabled = !ok;
    };
    if (s.kind === "panel") {
      put(screen, 
        heading(`Still ${s.n} of ${s.of}`),
        h("figure", { class: "bp-still" }, still(s.code, "The still image to rate", "(min-width: 720px) 44rem, 100vw")),
      );
    } else {
      const item = clipItem.get(s.code)!;
      video = h("video", {
        src: item.video,
        muted: true,
        playsinline: true,
        loop: study.parts.clips.video.loop,
        controls: true,
        preload: "auto",
        autoplay,
        "aria-label": "Clip",
        class: "bp-video",
      });
      video.muted = true;
      put(screen, 
        heading(`Clip ${s.n} of ${s.of}`),
        h(
          "div",
          { class: "bp-media" },
          h("figure", {}, still(item.reference, "The original still image", "(min-width: 720px) 50vw, 100vw"), h("figcaption", {}, "Original image")),
          h("figure", {}, video, h("figcaption", {}, study.parts.clips.video.loop ? "Clip (loops)" : "Clip")),
        ),
        h("p", { class: "bp-watch" }, rich(study.parts.clips.watch_note)),
        autoplay ? null : h("p", { class: "bp-note" }, "Autoplay is off (your system asks for reduced motion). Press play to watch."),
      );
    }
    const questions = qs(part);
    questions.forEach((q, k) => put(screen, question(q, part, s.code, part === "clips" && questions.length > 1 ? k + 1 : null, onChange)));
    put(screen, navEl, shortcutsToggle());
  }

  function renderEnd(i: number, s: Extract<Step, { kind: "end" }>) {
    const rated = steps.slice(0, i).filter((x) => x.kind === "clip").length;
    const remaining = order!.blocks.slice(state.blocks).reduce((a, b) => a + b.clips.length, 0);
    const see = h("button", { type: "button", class: "bp-btn bp-primary", "data-bp": "finish" }, "See where you land");
    see.addEventListener("click", finish);
    const more =
      remaining && s.block === state.blocks - 1
        ? h("button", { type: "button", class: "bp-btn", "data-bp": "extend" }, remaining === 1 ? "Rate the last clip first" : `Rate the other ${remaining} clips first`)
        : null;
    more?.addEventListener("click", () => {
      state.blocks += 1;
      buildSteps();
      go(i + 1);
    });
    const back = h("button", { type: "button", class: "bp-btn", "data-bp": "back", disabled: !canGoBack(i) }, "Back");
    back.addEventListener("click", () => go(i - 1));
    put(screen, 
      heading(`Done: ${rated} ${rated === 1 ? "clip" : "clips"} rated`),
      h("p", {}, "Next you'll see which model made each clip and how your answers compare with the reference panel's."),
      remaining && more ? h("p", {}, `The panel's raters each did all ${rated + remaining}. You can do the rest first if you like.`) : null,
      h("div", { class: "bp-nav bp-nav-end" }, back, more, see),
    );
  }

  function finish() {
    persist();
    state.completed = true;
    save(store, key, state);
    const submission = buildSubmission(study, {
      session: state.session,
      order: order!,
      blocks: state.blocks,
      answers: answersForBlocks(),
      delivery: { autoplay, keyboard: state.keyboardUsed, seconds: state.seconds },
    });
    emit("complete", { submission, blocks: state.blocks });
  }

  /** Only the answers for the items in the finished blocks (an abandoned extension is dropped). */
  function answersForBlocks(): Submission["answers"] {
    const used = order!.blocks.slice(0, state.blocks);
    const pick = (part: "baseline" | "clips", codes: string[]) =>
      Object.fromEntries(codes.map((c) => [c, { ...state.answers[part][c] }]));
    return { baseline: pick("baseline", used.flatMap((b) => b.baseline)), clips: pick("clips", used.flatMap((b) => b.clips)) };
  }

  function render() {
    if (destroyed || !order) return;
    video?.pause();
    video = null;
    screen.replaceChildren();
    const i = state.step;
    const s = steps[i];
    if (s.kind === "intro") renderIntro(i);
    else if (s.kind === "end") renderEnd(i, s);
    else renderItem(i, s);
    emit("step", { index: i, kind: s.kind });
  }

  function go(i: number) {
    if (i < 0 || i >= steps.length) return;
    if (i > state.step && !stepComplete(steps[state.step])) return;
    state.step = i;
    persist();
    render();
    const s = steps[i];
    const hd = screen.querySelector<HTMLElement>(".bp-h");
    hd?.focus();
    if (s.kind === "clip") announce(`Clip ${s.n} of ${s.of}`);
    else if (s.kind === "panel") announce(`Still image ${s.n} of ${s.of}`);
  }

  function onKey(e: KeyboardEvent) {
    if (!state.shortcuts || e.metaKey || e.ctrlKey || e.altKey || !order) return;
    const s = steps[state.step];
    const t = e.target as HTMLElement;
    const tag = t?.tagName;
    const control = tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || tag === "VIDEO" || tag === "SELECT" || tag === "TEXTAREA" || (tag === "INPUT" && (t as HTMLInputElement).type !== "radio");
    if (/^[1-5]$/.test(e.key) && (s.kind === "panel" || s.kind === "clip")) {
      const sets = [...screen.querySelectorAll<HTMLFieldSetElement>("fieldset.bp-q")];
      const focused = (t?.closest?.("fieldset.bp-q") as HTMLFieldSetElement | null) ?? null;
      const target = focused ?? sets.find((f) => !f.querySelector("input:checked"));
      if (!target) return;
      const input = target.querySelector<HTMLInputElement>(`input[value="${e.key}"]`)!;
      e.preventDefault();
      state.keyboardUsed = true;
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const label = input.closest("label")?.querySelector(".bp-lab")?.textContent ?? "";
      const num = sets.indexOf(target) + 1;
      announce(`${sets.length > 1 ? `Question ${num}: ` : ""}${e.key}, ${label}`);
      return;
    }
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      if (canGoBack(state.step)) {
        state.keyboardUsed = true;
        go(state.step - 1);
      }
      return;
    }
    if (e.key === "Enter" && !control) {
      if (s.kind === "intro" || ((s.kind === "panel" || s.kind === "clip") && stepComplete(s))) {
        e.preventDefault();
        state.keyboardUsed = true;
        go(state.step + 1);
      }
      return;
    }
    if (e.key === " " && video && !control && tag !== "INPUT" && tag !== "LABEL") {
      e.preventDefault();
      state.keyboardUsed = true;
      if (video.paused) void video.play()?.catch(() => {});
      else video.pause();
      return;
    }
    if ((e.key === "r" || e.key === "R") && video && !control) {
      e.preventDefault();
      state.keyboardUsed = true;
      video.currentTime = 0;
      void video.play()?.catch(() => {});
    }
  }
  root.addEventListener("keydown", onKey);

  const ready = participantOrder(study, state.session).then((o) => {
    if (destroyed) return;
    order = o;
    state.blocks = Math.min(state.blocks, o.blocks.length);
    buildSteps();
    state.step = Math.min(state.step, steps.length - 1);
    save(store, key, state);
    render();
  });

  return {
    ready,
    on(event, cb) {
      (listeners[event] as Listener<typeof event>[]).push(cb);
      return () => {
        const l = listeners[event] as Listener<typeof event>[];
        l.splice(l.indexOf(cb), 1);
      };
    },
    getState: () => ({ ...state, kind: order ? steps[state.step].kind : "loading" }),
    reset: () => clear(store, key),
    destroy() {
      destroyed = true;
      video?.pause();
      root.removeEventListener("keydown", onKey);
      root.remove();
    },
  };
}
