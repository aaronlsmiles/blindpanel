import type { Question, Reveal, Study, Submission } from "../core/types.js";
import type { Tally } from "../server/stores/types.js";
import { finite, nanmean, spearmanPairs } from "../stats/basic.js";
import { alphaFromCounts } from "../stats/krippendorff.js";
import { baselineAdjusted, landing, type Landing } from "../stats/landing.js";
import { h, put, rich } from "./dom.js";

export interface SubmitResult {
  ok: boolean;
  status: number;
}

export interface ResultsOptions {
  study: Study;
  /** reveal.json, fetched by the host only after the session completed */
  reveal: Reveal;
  submission: Submission;
  /** sends the submission (POST to study.endpoints.submit); omit to hide the opt-in */
  onSubmit?: () => Promise<SubmitResult>;
  /** reads the crowd tally; omit to hide it */
  loadTally?: () => Promise<Tally>;
  /** start with the study's author left out of the panel */
  excludeAuthor?: boolean;
}

export interface ResultsController {
  /** the numbers on screen, per clip question */
  getState(): { exclude: string | undefined; landings: Record<string, Landing> };
  destroy(): void;
}

const f2 = (v: number | null | undefined) => (finite(v) ? (v < 0 ? "−" : "") + Math.abs(v).toFixed(2) : "n/a");
const signed = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(1);

export function mountResults(el: HTMLElement, o: ResultsOptions): ResultsController {
  const { study, reveal, submission } = o;
  const ref = reveal.reference;
  const author = ref?.author_slot && ref.raters.includes(ref.author_slot) ? ref.author_slot : undefined;
  let exclude = o.excludeAuthor && author ? author : undefined;
  let landings: Record<string, Landing> = {};

  const root = h("div", { class: "bp bp-results", "data-bp": "results" });
  const body = h("div", { class: "bp-results-body" });
  el.append(root);

  const clipQs = study.questions.filter((q) => q.part === "clips");
  const baseQs = study.questions.filter((q) => q.part === "baseline");
  const codes = study.parts.clips.items.map((i) => i.code);
  const seen = submission.order.clips;
  const seenNo = new Map(seen.map((c, i) => [c, i + 1]));
  const qName = (q: Question, k: number) => q.short ?? `Question ${k + 1}`;

  function you(q: Question) {
    return codes.map((c) => submission.answers.clips[c]?.[q.id] ?? null);
  }

  function headline(l: Landing) {
    if (l.rho_you === null) {
      return l.caveats.includes("constant")
        ? "All your answers to this question were the same, so agreement can't be measured."
        : "Too few answers to measure agreement.";
    }
    const tail = `(your ρ ${f2(l.rho_you)}; the raters' range from ${f2(Math.min(...l.rater_rhos.map((r) => r.rho ?? 1)))} to ${f2(Math.max(...l.rater_rhos.map((r) => r.rho ?? -1)))})`;
    if (l.beats === l.of) return `You agree with the panel's average more closely than every one of its ${l.of} raters does ${tail}.`;
    if (l.beats === 0) return `You agree with the panel's average less closely than all ${l.of} of its raters do ${tail}.`;
    return `You agree with the panel's average more closely than ${l.beats} of its ${l.of} raters do ${tail}.`;
  }

  function strip(q: Question, panel: (number | null)[][], raters: string[], yours: (number | null)[]) {
    const rows = seen.map((code) => {
      const j = codes.indexOf(code);
      const vals = panel.map((r) => r[j]);
      const mean = nanmean(vals);
      const me = yours[j];
      const track = h("div", {
        class: "bp-track",
        role: "img",
        "aria-label": `You ${me ?? "no answer"}; panel mean ${mean === null ? "n/a" : mean.toFixed(1)}; raters ${vals.map((v) => v ?? "–").join(", ")}`,
      });
      for (let v = 1; v <= 5; v++) track.append(h("span", { class: "bp-tick", style: `left:${((v - 1) / 4) * 100}%` }));
      const stack = new Map<number, number>();
      vals.forEach((v, k) => {
        if (!finite(v)) return;
        const n = stack.get(v) ?? 0;
        stack.set(v, n + 1);
        track.append(
          h("span", {
            class: `bp-dot${raters[k] === author ? " bp-dot-author" : ""}`,
            style: `left:${((v - 1) / 4) * 100}%;--bp-stack:${n}`,
            title: raters[k],
          }),
        );
      });
      if (mean !== null) track.append(h("span", { class: "bp-mean", style: `left:${((mean - 1) / 4) * 100}%` }));
      if (finite(me)) track.append(h("span", { class: "bp-you", style: `left:${((me - 1) / 4) * 100}%` }));
      const r = reveal.items[code];
      return h(
        "div",
        { class: "bp-row" },
        h("div", { class: "bp-row-label" }, h("span", { class: "bp-row-n" }, `Clip ${seenNo.get(code)}`), h("span", { class: "bp-row-model" }, r?.label ?? "")),
        track,
      );
    });
    return h(
      "figure",
      { class: "bp-strip" },
      h("div", { class: "bp-axis", "aria-hidden": "true" }, h("span"), h("span", { class: "bp-axis-scale" }, ...[1, 2, 3, 4, 5].map((v) => h("span", {}, String(v))))),
      ...rows,
      h(
        "figcaption",
        { class: "bp-legend-row" },
        h("span", { class: "bp-key-you" }), " you  ",
        h("span", { class: "bp-key-dot" }), " a panel rater  ",
        h("span", { class: "bp-key-mean" }), " panel mean",
        ` · scale: ${study.scales[q.scale].labels[0].replace(/\*\*/g, "")} (1) to ${study.scales[q.scale].labels[4].replace(/\*\*/g, "")} (5)`,
      ),
    );
  }

  function raterTable(l: Landing) {
    const rows = [...l.rater_rhos.map((r) => ({ who: r.rater === author ? `${r.rater} (author)` : r.rater, rho: r.rho, you: false })), { who: "You", rho: l.rho_you, you: true }]
      .sort((a, b) => (b.rho ?? -2) - (a.rho ?? -2));
    return h(
      "table",
      { class: "bp-table" },
      h("caption", {}, "Agreement with the panel's average (Spearman ρ; each rater against the others)"),
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Rater"), h("th", { scope: "col", class: "bp-num-col" }, "ρ"))),
      h("tbody", {}, ...rows.map((r) => h("tr", { class: r.you ? "bp-you-row" : null }, h("th", { scope: "row" }, r.who), h("td", { class: "bp-num-col" }, f2(r.rho))))),
    );
  }

  function metricTable(l: Landing) {
    if (!l.metrics.length) return null;
    return h(
      "table",
      { class: "bp-table" },
      h("caption", {}, "Your scores against each automatic metric (Spearman ρ, over the clips you rated)"),
      h(
        "thead",
        {},
        h("tr", {}, h("th", { scope: "col" }, "Metric"), h("th", { scope: "col", class: "bp-num-col" }, "You"), h("th", { scope: "col", class: "bp-num-col" }, "Panel, published"), h("th", { scope: "col", class: "bp-num-col" }, "95% CI")),
      ),
      h(
        "tbody",
        {},
        ...l.metrics.map((m) =>
          h(
            "tr",
            {},
            h("th", { scope: "row" }, m.label),
            h("td", { class: "bp-num-col" }, `${f2(m.rho_you)} (n ${m.n})`),
            h("td", { class: "bp-num-col" }, m.published ? `${f2(m.published.rho)} (n ${m.published.n})` : "–"),
            h("td", { class: "bp-num-col" }, m.published?.ci95 ? `${f2(m.published.ci95[0])} to ${f2(m.published.ci95[1])}` : "–"),
          ),
        ),
      ),
    );
  }

  function caveatText(l: Landing, alpha: number | null) {
    const out: string[] = [];
    if (l.caveats.includes("small_n")) out.push(`You rated ${l.n} clips. With so few, one answer can move ρ by about 0.1: read these numbers as a rough guide, not a measurement.`);
    if (alpha !== null && alpha < 0.667) out.push(`The panel itself agrees only modestly on this question (Krippendorff's α ${f2(alpha)}), so there is no single right answer to land on.`);
    return out;
  }

  function section(q: Question, k: number) {
    const panel = ref!.ratings[q.id];
    const yours = you(q);
    const l = landing({ you: yours, panel, raters: ref!.raters, metrics: ref!.metrics, exclude }, q.id);
    landings[q.id] = l;
    const keep = ref!.raters.map((r, i) => [r, i] as const).filter(([r]) => r !== exclude);
    const sec = h("section", { class: "bp-section", "data-q": q.id });
    const items: (Node | null)[] = [
      h("h3", {}, qName(q, k)),
      h("p", { class: "bp-legend" }, "“", rich(q.text), "”"),
      h("p", { class: "bp-headline", "data-bp": "headline" }, headline(l)),
    ];
    const facts: string[] = [];
    if (l.bias !== null) {
      facts.push(
        Math.abs(l.bias) < 0.05
          ? "On average your scores sit right at the panel's."
          : `On average you scored ${signed(l.bias)} points ${l.bias > 0 ? "higher (more lenient)" : "lower (stricter)"} than the panel's mean, and ${l.mae!.toFixed(1)} points away from it per clip.`,
      );
    }
    if (l.alpha_panel !== null && l.alpha_with_you !== null)
      facts.push(`Panel agreement on these clips: α ${f2(l.alpha_panel)}; with you added as a ${ordinal(l.of + 1)} rater: α ${f2(l.alpha_with_you)}.`);
    if (k === 0 && baseQs.length === 1) {
      const pIdx = new Map(study.panels.map((p, i) => [p.code, i]));
      const panelOf = study.parts.clips.items.map((c) => pIdx.get(c.reference)!);
      const mine = study.panels.map((p) => submission.answers.baseline[p.code]?.[baseQs[0].id] ?? null);
      const adj = baselineAdjusted(yours, panelOf, mine);
      if (adj.mean !== null)
        facts.push(`Against your own scores for the stills, the clips moved you ${signed(adj.mean)} points on average.`);
    }
    items.push(...facts.map((t) => h("p", {}, t)));
    items.push(strip(q, keep.map(([, i]) => panel[i]), keep.map(([r]) => r), yours));
    items.push(h("div", { class: "bp-tables" }, raterTable(l), metricTable(l)));
    const cav = caveatText(l, l.alpha_panel);
    if (cav.length) items.push(h("ul", { class: "bp-caveats" }, ...cav.map((c) => h("li", {}, c))));
    put(sec, ...items);
    return sec;
  }

  function revealTable() {
    return h(
      "table",
      { class: "bp-table bp-reveal" },
      h("caption", {}, "Which model made each clip"),
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Clip"), h("th", { scope: "col" }, "Model"), h("th", { scope: "col" }, "Details"), h("th", { scope: "col" }, h("span", { class: "bp-sr" }, "Link")))),
      h(
        "tbody",
        {},
        ...seen.map((code) => {
          const r = reveal.items[code];
          return h(
            "tr",
            {},
            h("th", { scope: "row" }, `Clip ${seenNo.get(code)}`),
            h("td", {}, r?.label ?? "–"),
            h("td", {}, Object.values(r?.meta ?? {}).join(" · ")),
            h("td", {}, r?.link ? h("a", { href: r.link }, "Open") : ""),
          );
        }),
      ),
    );
  }

  function optIn() {
    if (!o.onSubmit || !study.modes.public.submit) return null;
    const btn = h("button", { type: "button", class: "bp-btn bp-primary", "data-bp": "submit" }, "Add my ratings to the public tally");
    const status = h("p", { class: "bp-status", role: "status" });
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      status.textContent = "Sending…";
      let r: SubmitResult;
      try {
        r = await o.onSubmit!();
      } catch {
        r = { ok: false, status: 0 };
      }
      if (r.ok) status.textContent = "Added. Thank you.";
      else if (r.status === 409) status.textContent = "These ratings were already added.";
      else if (r.status === 429) status.textContent = "The tally isn't taking more ratings today. Your results here are unaffected.";
      else {
        status.textContent = "Couldn't add them just now. Your results here are unaffected; try again later.";
        btn.disabled = false;
      }
    });
    return h(
      "section",
      { class: "bp-section bp-optin" },
      h("h3", {}, "Add your ratings"),
      h("p", { class: "bp-privacy" }, rich(study.privacy)),
      btn,
      status,
    );
  }

  function crowd() {
    if (!o.loadTally || !study.modes.public.tally) return null;
    const box = h("section", { class: "bp-section bp-crowd", "aria-live": "polite" }, h("h3", {}, "Other visitors"), h("p", {}, "Loading the tally…"));
    o.loadTally().then(
      (t) => {
        const lines: string[] = [];
        for (const [k, q] of clipQs.entries()) {
          const counts = codes.map((c) => t.items[c]?.[q.id]?.counts).filter((c): c is number[] => !!c);
          if (!counts.length) continue;
          const crowdMean = codes.map((c) => {
            const cell = t.items[c]?.[q.id];
            return cell ? cell.counts.reduce((a, n, i) => a + n * (i + 1), 0) / cell.n : null;
          });
          const panelMean = codes.map((_, j) => nanmean(ref?.ratings[q.id].map((r) => r[j]) ?? []));
          const { rho, n } = spearmanPairs(crowdMean, panelMean);
          lines.push(`${qName(q, k)}: the crowd's average agrees with the panel's at ρ ${f2(rho)} over ${n} clips; the crowd's own α is ${f2(alphaFromCounts(counts))}.`);
        }
        box.replaceChildren(
          h("h3", {}, "Other visitors"),
          h("p", {}, `${t.n_sessions} ${t.n_sessions === 1 ? "visitor has" : "visitors have"} added their ratings so far.`),
          ...(lines.length
            ? lines.map((l) => h("p", {}, l))
            : [h("p", {}, `Clips appear once ${study.modes.public.min_crowd_n} visitors have rated them.`)]),
          h("p", { class: "bp-note" }, "Visitors choose themselves, so this is a curiosity, not a study result."),
        );
      },
      () => box.replaceChildren(h("h3", {}, "Other visitors"), h("p", {}, "The crowd tally is unavailable right now.")),
    );
    return box;
  }

  function render() {
    landings = {};
    body.replaceChildren();
    if (!ref) {
      put(body, revealTable());
      return;
    }
    const toggle = author
      ? h("label", { class: "bp-toggle" }, h("input", { type: "checkbox", checked: !!exclude, "data-bp": "exclude-author" }), ` Leave out ${author}, the study's author`)
      : null;
    toggle?.querySelector("input")?.addEventListener("change", (e) => {
      exclude = (e.target as HTMLInputElement).checked ? author : undefined;
      render();
    });
    put(
      body,
      toggle,
      ...clipQs.map(section),
      revealTable(),
      ref.caveats?.length || ref.attribution
        ? h(
            "section",
            { class: "bp-section" },
            h("h3", {}, "About this panel"),
            ...(ref.caveats ?? []).map((c) => h("p", {}, rich(c))),
            h("p", {}, "You chose to take part, so where you land is a reading for you, not a study result."),
            ref.attribution ? h("p", { class: "bp-note" }, ref.attribution) : null,
          )
        : null,
    );
  }

  const intro = h("h2", { class: "bp-h", tabindex: -1 }, "Where you land");
  const optin = optIn();
  const crowdBox = crowd();
  put(root, intro, body, optin, crowdBox);
  render();
  intro.focus();

  return {
    getState: () => ({ exclude, landings }),
    destroy: () => root.remove(),
  };
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
