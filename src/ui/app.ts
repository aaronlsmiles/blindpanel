import type { Reveal, Study } from "../core/types.js";
import type { Tally } from "../server/stores/types.js";
import { h } from "./dom.js";
import { mountResults } from "./results.js";
import { mountSession } from "./session.js";

/**
 * The standalone page: loads study.json, runs the session, and only after the
 * visitor finishes fetches reveal.json and shows where they land.
 */
export async function bootStandalone(el: HTMLElement, base = "./") {
  const url = (p: string) => (/^(https?:)?\//.test(p) ? p : base + p);
  let study: Study;
  try {
    const r = await fetch(url("study.json"));
    if (!r.ok) throw new Error(String(r.status));
    study = (await r.json()) as Study;
  } catch {
    el.replaceChildren(h("p", { class: "bp" }, "The study could not be loaded. Reload the page to try again."));
    return;
  }
  const session = mountSession(el, study);
  session.on("complete", async ({ submission }) => {
    let reveal: Reveal;
    try {
      const r = await fetch(url(study.endpoints.reveal));
      if (!r.ok) throw new Error(String(r.status));
      reveal = (await r.json()) as Reveal;
    } catch {
      el.append(h("p", { class: "bp", role: "alert" }, "The results could not be loaded. Your answers are kept; reload to try again."));
      return;
    }
    session.destroy();
    mountResults(el, {
      study,
      reveal,
      submission,
      onSubmit: async () => {
        const r = await fetch(url(study.endpoints.submit), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(submission),
        });
        return { ok: r.ok, status: r.status };
      },
      // after an opt-in, a random key reaches the function past the edge cache
      loadTally: async ({ fresh }) => {
        const r = await fetch(url(study.endpoints.tally) + (fresh ? `?fresh=${crypto.randomUUID()}` : ""));
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as Tally;
      },
    });
    const again = h("button", { type: "button", class: "bp-btn", "data-bp": "again" }, "Start a new session");
    again.addEventListener("click", () => {
      session.reset();
      location.reload();
    });
    el.append(h("div", { class: "bp bp-again" }, again));
  });
}
