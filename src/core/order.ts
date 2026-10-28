import { shuffle } from "./rng.js";
import type { Study } from "./types.js";

export interface Block {
  /** baseline codes asked before this block's clips (panels not asked yet) */
  baseline: string[];
  clips: string[];
}

export interface ParticipantOrder {
  /** every clip code, in this participant's order */
  clips: string[];
  /** every baseline code, in this participant's order */
  baseline: string[];
  /** the session (session_size clips) and, when the study allows it, the extension */
  blocks: Block[];
}

export const orderKey = (seed: string, part: string, participant: string) =>
  `${seed}:${part}:${participant}`;

export async function participantOrder(study: Study, participant: string): Promise<ParticipantOrder> {
  const { clips: part, baseline: bpart } = study.parts;
  const clips = await shuffle(part.items.map((i) => i.code), orderKey(study.seed, "clips", participant));
  const baseline = bpart
    ? await shuffle(bpart.items.map((i) => i.code), orderKey(study.seed, "baseline", participant))
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
