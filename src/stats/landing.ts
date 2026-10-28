import type { Metric } from "../core/types.js";
import { finite, nanmean, spearmanPairs, type Maybe } from "./basic.js";
import { krippendorffOrdinal } from "./krippendorff.js";

export interface LandingInput {
  /** your score per item, in study order; null where you did not rate it */
  you: Maybe[];
  /** the reference panel: raters x items */
  panel: Maybe[][];
  raters: string[];
  metrics?: Metric[];
  /** leave this rater out of the panel (e.g. the study's author) */
  exclude?: string;
}

export type Caveat = "constant" | "small_n";

export interface Landing {
  /** items you rated */
  n: number;
  /** mean over panel raters k of rho(you, mean of the panel without k) */
  rho_you: number | null;
  /** each rater's rho against the mean of the other raters, on the same items */
  rater_rhos: { rater: string; rho: number | null }[];
  /** how many raters your rho exceeds, out of `of` */
  beats: number;
  of: number;
  /** mean absolute difference and mean signed difference (you minus panel mean) */
  mae: number | null;
  bias: number | null;
  alpha_panel: number | null;
  alpha_with_you: number | null;
  metrics: {
    id: string;
    label: string;
    n: number;
    rho_you: number | null;
    rho_raters: (number | null)[];
    published?: { rho: number; ci95?: [number, number]; n: number };
  }[];
  caveats: Caveat[];
}

export function landing(inp: LandingInput, question?: string): Landing {
  const keep = inp.raters.map((r, i) => [r, i] as const).filter(([r]) => r !== inp.exclude);
  const panel = keep.map(([, i]) => inp.panel[i]);
  const items = inp.you.map((v, j) => (finite(v) ? j : -1)).filter((j) => j >= 0);
  const you = items.map((j) => inp.you[j] as number);
  const col = (row: Maybe[]) => items.map((j) => row[j]);
  const meanWithout = (skip: number) => items.map((j) => nanmean(panel.filter((_, k) => k !== skip).map((r) => r[j])));
  const loo = panel.map((_, k) => meanWithout(k));

  const yours = loo.map((m) => spearmanPairs(you, m).rho).filter((r): r is number => r !== null);
  const rho_you = yours.length ? yours.reduce((a, b) => a + b, 0) / yours.length : null;
  const rater_rhos = keep.map(([rater], k) => ({ rater, rho: spearmanPairs(col(panel[k]), loo[k]).rho }));
  const beats = rho_you === null ? 0 : rater_rhos.filter((r) => r.rho !== null && rho_you > r.rho).length;

  const means = items.map((j) => nanmean(panel.map((r) => r[j])));
  const diffs = you.map((v, i) => (means[i] === null ? null : v - means[i]!)).filter(finite);
  const bias = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
  const mae = diffs.length ? diffs.reduce((a, b) => a + Math.abs(b), 0) / diffs.length : null;

  const sub = panel.map(col);
  const metrics = (inp.metrics ?? []).map((m) => {
    const mv = col(m.values);
    const { rho, n } = spearmanPairs(mv, you);
    return {
      id: m.id,
      label: m.label,
      n,
      rho_you: rho,
      rho_raters: sub.map((r) => spearmanPairs(mv, r).rho),
      ...(question && m.published?.[question] ? { published: m.published[question] } : {}),
    };
  });

  const caveats: Caveat[] = [];
  if (you.length >= 3 && new Set(you).size === 1) caveats.push("constant");
  if (you.length < 10) caveats.push("small_n");
  return {
    n: items.length,
    rho_you,
    rater_rhos,
    beats,
    of: keep.length,
    mae,
    bias,
    alpha_panel: krippendorffOrdinal(sub),
    alpha_with_you: krippendorffOrdinal([...sub, you]),
    metrics,
    caveats,
  };
}

/** Clip score minus your own score for the clip's still (null where either is missing). */
export function baselineAdjusted(clips: Maybe[], panelOf: number[], baseline: Maybe[]) {
  const diffs = clips.map((v, i) => {
    const b = baseline[panelOf[i]];
    return finite(v) && finite(b) ? v - b : null;
  });
  return { diffs, mean: nanmean(diffs) };
}
