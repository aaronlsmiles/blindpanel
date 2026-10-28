import { rngFor } from "../core/rng.js";
import { percentile, spearman } from "./basic.js";

/**
 * Percentile bootstrap CI for Spearman's rho, resampling pairs. Seeded with the
 * kit's own generator, so it cannot reproduce numpy's default_rng draws: CIs
 * published with a study are shown as published, not recomputed.
 */
export async function bootstrapRho(x: number[], y: number[], opts: { n: number; seed: string }) {
  const rng = await rngFor(`${opts.seed}:bootstrap`);
  const boots: number[] = [];
  for (let b = 0; b < opts.n; b++) {
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < x.length; i++) {
      const k = rng.below(x.length);
      xs.push(x[k]); ys.push(y[k]);
    }
    const r = spearman(xs, ys);
    if (r !== null) boots.push(r);
  }
  return { ci95: [percentile(boots, 2.5), percentile(boots, 97.5)] as [number, number], n: boots.length };
}
