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
 * docs/order.md, "Repeats": the originals shuffled from `key`, each alias inserted at its 1-based
 * position (lowest first). If any alias then sits fewer than min_gap places after its original (or
 * before it), the shuffle is redrawn from `${key}:1`, `${key}:2`, … scripts/order_ref.py is the reference.
 */
export async function withRepeats(originals: readonly string[], key: string, rep: Repeats): Promise<string[]> {
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
  const aliases = new Set(part.repeats?.items.map((r) => r.alias) ?? []);
  // without repeats this is every code, so a 0.1/0.2 study's order is unchanged
  const originals = part.items.map((i) => i.code).filter((c) => !aliases.has(c));
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
