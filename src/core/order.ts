import { shuffle } from "./rng.js";
import type { Repeats, Study } from "./types.js";

export interface Block {
  /** baseline codes asked before this block's clips (panels not asked yet) */
  baseline: string[];
  clips: string[];
}

export interface ParticipantOrder {
  /** every clip code, in this participant's order (repeats included, at their positions) */
  clips: string[];
  /** every baseline code, in this participant's order */
  baseline: string[];
  /** the session (session_size clips) and, when the study allows it, the extension */
  blocks: Block[];
}

export const orderKey = (seed: string, part: string, participant: string) =>
  `${seed}:${part}:${participant}`;

/** the most redraws a repeats order may take before the study is refused */
export const MAX_REPEAT_ATTEMPTS = 10_000;

/**
 * The lowest chance per draw the schema accepts for a repeats layout: below it, 10,000 draws could
 * all fail. At this chance, all 10,000 fail with probability (1 − 0.0028)^10000 ≈ 7e-13.
 */
export const MIN_REPEAT_CHANCE = 2.8e-3;

/**
 * The chance that one draw of the "Repeats" scheme puts every repeat at least `minGap` places after
 * its original. Sort the repeats by position; the k-th (from 0) has s_k usable places: the positions
 * at or before its own minus minGap that no other repeat takes. The k earlier repeats' originals
 * already sit in k of them, and its own original is equally likely to be any of the n − k left, so
 * P = Π (s_k − k) / (n − k). 0 means no order exists.
 */
export function repeatPlacementChance(originals: number, positions: readonly number[], minGap: number): number {
  const sorted = [...positions].sort((a, b) => a - b);
  let p = 1;
  for (let k = 0; k < sorted.length; k++) {
    const last = sorted[k] - minGap; // the latest 1-based position its original may hold
    const usable = Math.max(0, last) - sorted.filter((q) => q <= last).length;
    if (usable - k <= 0 || originals - k <= 0) return 0;
    p *= (usable - k) / (originals - k);
  }
  return p;
}

/** The study's own clip codes, in study order: every clip item except the repeats' aliases. */
export function originalClipCodes(study: Study): string[] {
  const aliases = new Set(study.parts.clips.repeats?.items.map((r) => r.alias) ?? []);
  return study.parts.clips.items.map((i) => i.code).filter((c) => !aliases.has(c));
}

/**
 * docs/order.md, "Repeats": the originals shuffled from `key`, each alias inserted at its 1-based
 * position (lowest first). If any alias then sits fewer than min_gap places after its original (or
 * before it), the shuffle is redrawn from `${key}:1`, `${key}:2`, … scripts/order_ref.py is the reference.
 */
export async function withRepeats(originals: readonly string[], key: string, rep: Repeats): Promise<string[]> {
  for (const r of rep.items) {
    if (!originals.includes(r.of)) throw new Error(`repeat ${r.alias}: its original ${r.of} is not among the clips`);
    if (originals.includes(r.alias)) throw new Error(`repeat ${r.alias} is also an original clip`);
  }
  const inserts = [...rep.items].sort((a, b) => a.position - b.position);
  for (let attempt = 0; attempt < MAX_REPEAT_ATTEMPTS; attempt++) {
    const out = await shuffle(originals, attempt ? `${key}:${attempt}` : key);
    for (const r of inserts) out.splice(r.position - 1, 0, r.alias);
    if (inserts.every((r) => out.indexOf(r.alias) - out.indexOf(r.of) >= rep.min_gap)) return out;
  }
  throw new Error(`no order puts every repeat at least ${rep.min_gap} places after its original`);
}

export async function participantOrder(study: Study, participant: string): Promise<ParticipantOrder> {
  const part = study.parts.clips;
  // without repeats this is every code, so a 0.1/0.2 study's order is unchanged
  const originals = originalClipCodes(study);
  const key = orderKey(study.seed, "clips", participant);
  const clips = part.repeats ? await withRepeats(originals, key, part.repeats) : await shuffle(originals, key);
  const baseline = study.parts.baseline
    ? await shuffle(study.panels.map((p) => p.code), orderKey(study.seed, "baseline", participant))
    : [];
  const ref = new Map(part.items.map((i) => [i.code, i.reference]));
  const n = Math.min(part.session_size, clips.length);
  const groups = [clips.slice(0, n)];
  if (part.extend && n < clips.length) groups.push(clips.slice(n));
  const asked = new Set<string>();
  const blocks = groups.map((g) => {
    const want = new Set(g.map((c) => ref.get(c)));
    const b = baseline.filter((p) => want.has(p) && !asked.has(p));
    b.forEach((p) => asked.add(p));
    return { baseline: b, clips: g };
  });
  return { clips, baseline, blocks };
}
