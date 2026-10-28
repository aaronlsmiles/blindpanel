export type Maybe = number | null | undefined;

export const finite = (v: Maybe): v is number => typeof v === "number" && Number.isFinite(v);

export function nanmean(xs: Maybe[]): number | null {
  let s = 0, n = 0;
  for (const x of xs) if (finite(x)) { s += x; n++; }
  return n ? s / n : null;
}

/** Ranks from 1, ties averaged (scipy.stats.rankdata, method "average"). */
export function rank(xs: number[]): number[] {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b] || a - b);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && xs[idx[j + 1]] === xs[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]] = avg;
    i = j + 1;
  }
  return r;
}

export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 2) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

/** Spearman's rho: Pearson on mid-ranks. Null when n < 3 or either side is constant. */
export function spearman(x: number[], y: number[]): number | null {
  if (x.length !== y.length) throw new Error("spearman: lengths differ");
  if (x.length < 3) return null;
  return pearson(rank(x), rank(y));
}

/** Spearman over the pairs where both values are present. */
export function spearmanPairs(x: Maybe[], y: Maybe[]): { rho: number | null; n: number } {
  const a: number[] = [], b: number[] = [];
  x.forEach((v, i) => {
    const w = y[i];
    if (finite(v) && finite(w)) { a.push(v); b.push(w); }
  });
  return { rho: spearman(a, b), n: a.length };
}

/** numpy.percentile with the default "linear" method. */
export function percentile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const h = (s.length - 1) * (q / 100);
  const lo = Math.floor(h);
  if (lo + 1 >= s.length) return s[lo];
  const t = h - lo, a = s[lo], b = s[lo + 1], d = b - a;
  return t >= 0.5 ? b - d * (1 - t) : a + d * t;
}
