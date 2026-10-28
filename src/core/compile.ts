import { assignCodes } from "./codes.js";
import { instrumentText, textHash } from "./lock.js";
import { isRemote, type StudyConfig } from "./schema.js";
import type { Metric, Question, Reveal, Study } from "./types.js";

export interface CompileIO {
  /** read a text file, path relative to the study.yaml folder */
  readText(path: string): string;
  /** list file names in a folder relative to the study.yaml folder */
  listDir(path: string): string[];
}

export interface Compiled {
  study: Study;
  reveal: Reveal;
  lock: { instrument: string; text_sha256: string };
  /** local media to copy into the build: from (relative to study.yaml) -> to (relative to the page) */
  media: { from: string; to: string }[];
  /** media to check: URL or local path, with the declared sha256 */
  checks: { url: string; local?: string; sha256?: string }[];
  banned: (string | RegExp)[];
  /** code -> the key the item has in reference and exported ratings files */
  refs: { clips: Record<string, string>; panels: Record<string, string> };
}

const join = (base: string, file: string) =>
  ((base.endsWith("/") ? base : base + "/") + file.replace(/^\.?\//, "")).replace(/^\.\//, "");
const ext = (file: string | undefined, fallback: string) => (file?.match(/\.[A-Za-z0-9]+$/)?.[0] ?? fallback).toLowerCase();

export function parseBanned(text: string): (string | RegExp)[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      // "/pattern/flags": a regular expression with its own flags (no "i" means case-sensitive)
      const m = /^\/(.+)\/([a-z]*)$/.exec(l);
      return m ? new RegExp(m[1], m[2].replace(/[gy]/g, "")) : l;
    });
}

interface RatingsFile {
  rater: string;
  ratings?: ({ clip: string } & Record<string, unknown>)[];
  baseline?: ({ panel: string } & Record<string, unknown>)[];
}

const score = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? (v as number) : null);

export async function compile(c: StudyConfig, io: CompileIO): Promise<Compiled> {
  const clipCode = await assignCodes(c.blinding.seed, "clip", c.items.clips.map((x) => x.id));
  const panelCode = await assignCodes(c.blinding.seed, "panel", c.items.panels.map((x) => x.id));
  const remote = isRemote(c.media.base);
  const media: Compiled["media"] = [];
  const checks: Compiled["checks"] = [];
  const place = (code: string, file: string | undefined, fallback: string, sha256?: string) => {
    if (remote) {
      const url = join(c.media.base, file ?? `${code}${fallback}`);
      checks.push({ url, sha256 });
      return url;
    }
    const to = `media/${code}${ext(file, fallback)}`;
    const from = join(c.media.base, file!);
    media.push({ from, to });
    checks.push({ url: to, local: from, sha256 });
    return to;
  };

  const questions: Question[] = c.questions.map((q) => ({
    id: q.id, ...(q.short ? { short: q.short } : {}), part: q.part, text: q.text, direction: q.direction, notes: q.notes, intro_notes: q.intro_notes, scale: q.scale,
  }));
  const scales = Object.fromEntries(
    Object.entries(c.scales).map(([k, s]) => [k, { min: 1 as const, max: 5 as const, labels: s.labels }]),
  );
  const parts: Study["parts"] = {
    baseline: c.parts.baseline ? { intro: c.parts.baseline.intro } : null,
    clips: {
      intro: c.parts.clips.intro,
      watch_note: c.parts.clips.watch_note,
      clip_seconds: c.parts.clips.clip_seconds,
      session_size: c.parts.clips.session_size,
      extend: c.parts.clips.extend,
      video: { loop: c.parts.clips.video.loop, muted: true, autoplay: c.parts.clips.video.autoplay },
      items: c.items.clips.map((x) => ({
        code: clipCode[x.id],
        video: place(clipCode[x.id], x.file, ".mp4", x.sha256),
        reference: panelCode[x.reference],
      })),
    },
  };
  const panels = c.items.panels.map((p) => ({ code: panelCode[p.id], image: place(panelCode[p.id], p.file, ".png", p.sha256) }));
  const text_sha256 = await textHash(instrumentText({ scales, questions, parts }));

  const study: Study = {
    blindpanel: 1,
    id: c.id,
    instrument: c.instrument,
    text_sha256,
    seed: c.blinding.seed,
    title: c.title,
    scales,
    questions,
    panels,
    parts,
    modes: { public: { ...c.modes.public } },
    endpoints: { ...c.endpoints },
    privacy: c.privacy,
  };

  const reveal: Reveal = {
    study: c.id,
    items: Object.fromEntries(
      c.items.clips.map((x) => [
        clipCode[x.id],
        { label: x.label, meta: x.meta, ...(x.link ? { link: x.link } : {}) },
      ]),
    ),
    reference: c.reference ? loadReference(c, io) : null,
  };

  const banned = c.blinding.banned_terms_file ? parseBanned(io.readText(c.blinding.banned_terms_file)) : [];
  const refs = {
    clips: Object.fromEntries(c.items.clips.map((x) => [clipCode[x.id], x.ref ?? x.id])),
    panels: Object.fromEntries(c.items.panels.map((x) => [panelCode[x.id], x.ref ?? x.id])),
  };
  return { study, reveal, lock: { instrument: c.instrument, text_sha256 }, media, checks, banned, refs };
}

function loadReference(c: StudyConfig, io: CompileIO): NonNullable<Reveal["reference"]> {
  const ref = c.reference!;
  const files = io
    .listDir(ref.ratings)
    .filter((f) => /^ratings-.+\.json$/.test(f))
    .sort();
  if (!files.length) throw new Error(`no ratings-*.json files in ${ref.ratings}`);
  const data: RatingsFile[] = files.map((f) => JSON.parse(io.readText(join(ref.ratings, f))));
  const clipRefs = c.items.clips.map((x) => x.ref ?? x.id);
  const panelRefs = c.items.panels.map((x) => x.ref ?? x.id);
  const ratings: Record<string, (number | null)[][]> = {};
  for (const q of c.questions) {
    ratings[q.id] = data.map((d) => {
      if (q.part === "clips") {
        const got = new Map((d.ratings ?? []).map((r) => [r.clip, score(r[q.id])]));
        return clipRefs.map((r) => got.get(r) ?? null);
      }
      const got = new Map((d.baseline ?? []).map((r) => [r.panel, score(r[q.id])]));
      return panelRefs.map((r) => got.get(r) ?? null);
    });
  }
  let metrics: Metric[] = [];
  let published_alpha: Record<string, number> | undefined;
  let caveats: string[] | undefined;
  if (ref.metrics) {
    const m = JSON.parse(io.readText(ref.metrics)) as {
      alpha?: Record<string, number>;
      caveats?: string[];
      metrics: (Omit<Metric, "values"> & { values: Record<string, number | null> })[];
    };
    published_alpha = m.alpha;
    caveats = m.caveats;
    metrics = m.metrics.map((x) => ({ ...x, values: clipRefs.map((r) => x.values[r] ?? null) }));
  }
  return {
    raters: data.map((d) => d.rater),
    ...(ref.author_slot ? { author_slot: ref.author_slot } : {}),
    ratings,
    metrics,
    ...(published_alpha ? { published_alpha } : {}),
    ...(caveats?.length ? { caveats } : {}),
    ...(ref.attribution ? { attribution: ref.attribution } : {}),
  };
}
