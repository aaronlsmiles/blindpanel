import { isChoice } from "../core/scale.js";
import type { Study, Submission } from "../core/types.js";

export type Flag = "straightline" | "too_fast";

/** Flags mark a row for the tally to leave out. They never reject it: every submission is stored. */
export function flagsFor(study: Study, s: Submission): Flag[] {
  const flags: Flag[] = [];
  // Straightlining is one score repeated on a scale. Options of a choice question have no scale to
  // flatline on (a rater may truly pick the same option every time), so only ordinal questions count.
  const ordinal = new Set(study.questions.filter((q) => q.part === "clips" && !isChoice(study.scales[q.scale])).map((q) => q.id));
  const values = Object.values(s.answers.clips).flatMap((a) =>
    Object.entries(a).filter(([q]) => ordinal.has(q)).map(([, v]) => v),
  );
  if (s.order.clips.length >= 2 && new Set(values).size === 1) flags.push("straightline");
  if (s.delivery.duration_s < 0.5 * s.order.clips.length * study.parts.clips.clip_seconds) flags.push("too_fast");
  return flags;
}
