/** The compiled study: everything the page may know before the visitor finishes. */
export interface Study {
  blindpanel: 1;
  id: string;
  instrument: string;
  text_sha256: string;
  seed: string;
  title: string;
  scales: Record<string, Scale>;
  questions: Question[];
  /** reference stills: shown beside clips, and rated in the baseline part when there is one */
  panels: { code: string; image: string; display?: DisplayCopy[] }[];
  parts: { baseline: BaselinePart | null; clips: ClipsPart };
  modes: { public: { submit: boolean; tally: boolean; min_crowd_n: number } };
  endpoints: { submit: string; tally: string; reveal: string };
  privacy: string;
}

/** a smaller copy of a still, narrowest first; the page offers them as a srcset */
export interface DisplayCopy {
  url: string;
  width: number;
}

export interface Scale {
  min: 1;
  max: 5;
  labels: string[];
}

export type PartName = "baseline" | "clips";

export interface Question {
  id: string;
  short?: string;
  part: PartName;
  text: string;
  direction?: string;
  /** shown with the question on every screen */
  notes: string[];
  /** shown only in the part's introduction */
  intro_notes: string[];
  scale: string;
}

export interface BaselinePart {
  intro: string[];
}

export interface ClipsPart {
  intro: string[];
  watch_note: string;
  clip_seconds: number;
  session_size: number;
  extend: boolean;
  video: { loop: boolean; muted: true; autoplay: "unless_reduced_motion" | "never" };
  items: { code: string; video: string; reference: string }[];
}

/** Fetched only after the visitor finishes: the declared blinding exemption. */
export interface Reveal {
  study: string;
  items: Record<string, { label: string; meta: Record<string, string | number>; link?: string }>;
  reference: Reference | null;
}

export interface Reference {
  raters: string[];
  author_slot?: string;
  /** question id -> raters x items (study order: clip codes, or baseline codes for baseline questions) */
  ratings: Record<string, (number | null)[][]>;
  metrics: Metric[];
  published_alpha?: Record<string, number>;
  /** study-specific caveats shown with the results */
  caveats?: string[];
  attribution?: string;
}

export interface Metric {
  id: string;
  label: string;
  /** one value per clip code, in study order; null where undefined */
  values: (number | null)[];
  /** the direction a worse clip moves the metric: "higher" means a bigger value is worse */
  worse: "higher" | "lower";
  published?: Record<string, { rho: number; ci95?: [number, number]; n: number }>;
}

export interface Submission {
  format: "blindpanel/1";
  study: string;
  instrument: string;
  session: string;
  order: { baseline: string[]; clips: string[] };
  answers: {
    baseline: Record<string, Record<string, number>>;
    clips: Record<string, Record<string, number>>;
  };
  delivery: { autoplay: boolean; keyboard: boolean; duration_s: number; ui: string };
}
