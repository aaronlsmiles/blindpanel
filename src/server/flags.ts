import type { Study, Submission } from "../core/types.js";

export type Flag = "straightline" | "too_fast";

/** Flags mark a row for the tally to leave out. They never reject it: every submission is stored. */
export function flagsFor(study: Study, s: Submission): Flag[] {
  const flags: Flag[] = [];
  const values = Object.values(s.answers.clips).flatMap((a) => Object.values(a));
  if (s.order.clips.length >= 2 && new Set(values).size === 1) flags.push("straightline");
  if (s.delivery.duration_s < 0.5 * s.order.clips.length * study.parts.clips.clip_seconds) flags.push("too_fast");
  return flags;
}
