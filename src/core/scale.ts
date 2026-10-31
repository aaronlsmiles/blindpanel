import type { Scale } from "./types.js";

/** An ordinal scale always has exactly five points. */
export const ORDINAL_MAX = 5;

/** The highest answer for a scale of this kind: 5 for ordinal, the number of options for a choice scale. */
export const maxFor = (kind: Scale["kind"], labels: readonly unknown[]): number => (kind === "choice" ? labels.length : ORDINAL_MAX);

/** A `study.json` built before 0.2 has no `kind`: it is ordinal. */
export const isChoice = (s: Pick<Scale, "kind"> | undefined): boolean => s?.kind === "choice";

/** The highest answer a scale takes. A `study.json` built before 0.2 always had `max: 5`. */
export const scaleMax = (s: Pick<Scale, "max"> | undefined): number => s?.max ?? ORDINAL_MAX;

/** The number key → the option it selects: 1–9 are themselves, 0 is the tenth. */
export const keyValue = (key: string): number | null => (/^[0-9]$/.test(key) ? (key === "0" ? 10 : Number(key)) : null);

/** The key hint shown on option `v`: 1–9, then 0 for the tenth. The 11th and 12th have no key. */
export const valueKey = (v: number): string | null => (v >= 1 && v <= 9 ? String(v) : v === 10 ? "0" : null);
