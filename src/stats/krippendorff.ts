import { finite, type Maybe } from "./basic.js";

// Ordinal Krippendorff's alpha, coincidence-matrix form. A line-for-line port
// of the frozen analysis in StillDrawn's analysis/human_check/collect.py, so
// the summation order (and the last bits of the result) match it.

/** matrix: raters x items, values 1..5 or null. Null when nothing is pairable. */
export function krippendorffOrdinal(matrix: Maybe[][]): number | null {
  const present = new Set<number>();
  for (const row of matrix) for (const v of row) if (finite(v)) present.add(Math.trunc(v));
  const values = [...present].sort((a, b) => a - b);
  const vi = new Map(values.map((v, k) => [v, k]));
  const V = values.length;
  const coin = Array.from({ length: V }, () => new Array<number>(V).fill(0));
  const nItems = Math.max(0, ...matrix.map((r) => r.length));
  for (let j = 0; j < nItems; j++) {
    const vals = matrix.map((r) => r[j]).filter(finite);
    const mu = vals.length;
    if (mu < 2) continue;
    const idx = vals.map((v) => vi.get(Math.trunc(v))!);
    for (let i = 0; i < idx.length; i++)
      for (let k = 0; k < idx.length; k++) if (i !== k) coin[idx[i]][idx[k]] += 1.0 / (mu - 1);
  }
  return alphaFromCoincidence(coin);
}

/** Alpha from per-item counts of each scale point (items x 5); used for crowd tallies. */
export function alphaFromCounts(counts: number[][]): number | null {
  const V = Math.max(0, ...counts.map((c) => c.length));
  const coin = Array.from({ length: V }, () => new Array<number>(V).fill(0));
  for (const c of counts) {
    const mu = c.reduce((a, b) => a + b, 0);
    if (mu < 2) continue;
    for (let a = 0; a < V; a++)
      for (let b = 0; b < V; b++) coin[a][b] += (a === b ? c[a] * (c[a] - 1) : c[a] * c[b]) / (mu - 1);
  }
  return alphaFromCoincidence(coin);
}

function alphaFromCoincidence(coin: number[][]): number | null {
  const V = coin.length;
  const nc = coin.map((row) => row.reduce((a, b) => a + b, 0));
  const nTotal = nc.reduce((a, b) => a + b, 0);
  if (nTotal === 0) return null;
  const delta = (c: number, k: number) => {
    const lo = Math.min(c, k), hi = Math.max(c, k);
    let s = 0;
    for (let g = lo; g <= hi; g++) s += nc[g];
    s -= (nc[lo] + nc[hi]) / 2.0;
    return s * s;
  };
  let Do = 0, De = 0;
  for (let c = 0; c < V; c++) for (let k = 0; k < V; k++) if (c !== k) Do += coin[c][k] * delta(c, k);
  for (let c = 0; c < V; c++) for (let k = 0; k < V; k++) if (c !== k) De += nc[c] * nc[k] * delta(c, k);
  De /= nTotal - 1;
  return De === 0 ? null : 1.0 - Do / De;
}
