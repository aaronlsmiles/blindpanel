import { sha256Hex } from "./rng.js";
import { isChoice } from "./scale.js";
import type { Study } from "./types.js";

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

type Wording = Pick<Study, "scales" | "questions"> & {
  parts: {
    baseline: { intro: string[] } | null;
    clips: { intro: string[]; watch_note: string };
  };
};

/** Everything a rater reads. A change to any of it is a new instrument. */
export function instrumentText(s: Wording) {
  return {
    scales: Object.fromEntries(
      Object.entries(s.scales).map(([id, x]) => [
        id,
        // An ordinal scale hashes exactly as it did before 0.2 (no `kind` key), so locks made then still verify.
        isChoice(x)
          ? { kind: x.kind, min: x.min, max: x.max, labels: x.labels }
          : { min: x.min, max: x.max, labels: x.labels },
      ]),
    ),
    questions: s.questions.map(({ id, part, text, direction, notes, intro_notes, scale }) => ({
      id, part, text, direction, notes, intro_notes, scale,
    })),
    intros: {
      baseline: s.parts.baseline?.intro ?? null,
      clips: s.parts.clips.intro,
      watch_note: s.parts.clips.watch_note,
    },
  };
}

export const textHash = (text: ReturnType<typeof instrumentText>) => sha256Hex(canonicalJson(text));
