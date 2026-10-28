import { z } from "zod";
import { hasMarkup } from "./text.js";

const Wording = z
  .string()
  .min(1)
  .max(4000)
  .refine((s) => !hasMarkup(s), "wording supports **bold** only, not HTML");
const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, "letters, digits, '.', '_' or '-'");
const Hex64 = z.string().regex(/^[0-9a-f]{64}$/, "64 lower-case hex characters");

const Panel = z.strictObject({
  id: Id,
  /** the key this panel has in the reference ratings files */
  ref: z.string().max(64).optional(),
  /** path under media.base; defaults to <code>.png for remote media */
  file: z.string().max(256).optional(),
  sha256: Hex64.optional(),
});

const Clip = z.strictObject({
  id: Id,
  ref: z.string().max(64).optional(),
  /** the id of the panel shown beside this clip */
  reference: Id,
  file: z.string().max(256).optional(),
  sha256: Hex64.optional(),
  /** shown only after the visitor finishes */
  label: z.string().min(1).max(120),
  meta: z.record(z.string(), z.union([z.string(), z.number()])).prefault({}),
  link: z.url().optional(),
});

const Question = z.strictObject({
  id: Id,
  /** a short name for results headings (not part of the instrument wording) */
  short: z.string().min(1).max(60).optional(),
  part: z.enum(["baseline", "clips"]),
  text: Wording,
  direction: Wording.optional(),
  notes: z.array(Wording).prefault([]),
  intro_notes: z.array(Wording).prefault([]),
  scale: Id,
});

export const StudyConfig = z
  .strictObject({
    $schema: z.string().optional(),
    blindpanel: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "lower-case letters, digits and '-'"),
    title: z.string().min(1).max(120),
    /** the instrument version; bump it whenever any wording changes */
    instrument: z.string().regex(/^[A-Za-z0-9._-]{1,32}$/),
    privacy: Wording.prefault(
      "No names, accounts, cookies, IP addresses or browser details are stored. Opting in sends a random session id, your answers, their order and a rounded duration.",
    ),
    media: z.strictObject({
      /** an https URL, or a folder next to study.yaml (copied into the build) */
      base: z.string().min(1),
      /** origins the page may load media from, besides its own */
      origins: z.array(z.url()).prefault([]),
    }),
    blinding: z.strictObject({
      seed: z.string().min(4).max(64),
      /** one term per line (or /regex/); build-time only, never shipped */
      banned_terms_file: z.string().optional(),
      /** byte-exact media may carry provenance (C2PA); the docs say so */
      embedded_provenance: z.literal("allow").prefault("allow"),
    }),
    scales: z.record(Id, z.strictObject({ labels: z.array(Wording).length(5) })),
    questions: z.array(Question).min(1),
    parts: z.strictObject({
      baseline: z.strictObject({ intro: z.array(Wording).prefault([]) }).optional(),
      clips: z.strictObject({
        intro: z.array(Wording).prefault([]),
        watch_note: Wording,
        clip_seconds: z.number().positive().max(600),
        session_size: z.int().min(1),
        extend: z.boolean().prefault(false),
        video: z
          .strictObject({
            loop: z.boolean().prefault(true),
            autoplay: z.enum(["unless_reduced_motion", "never"]).prefault("unless_reduced_motion"),
          })
          .prefault({}),
      }),
    }),
    items: z.strictObject({
      panels: z.array(Panel).min(1),
      clips: z.array(Clip).min(1),
    }),
    reference: z
      .strictObject({
        /** a folder of ratings-<RATER>.json files (the StillDrawn shape) */
        ratings: z.string(),
        author_slot: z.string().optional(),
        metrics: z.string().optional(),
        attribution: z.string().max(400).optional(),
      })
      .optional(),
    modes: z
      .strictObject({
        public: z
          .strictObject({
            submit: z.boolean().prefault(true),
            tally: z.boolean().prefault(true),
            min_crowd_n: z.int().min(1).prefault(5),
          })
          .prefault({}),
      })
      .prefault({}),
    endpoints: z
      .strictObject({
        submit: z.string().prefault("/api/submit"),
        tally: z.string().prefault("/api/tally"),
        reveal: z.string().prefault("reveal.json"),
      })
      .prefault({}),
  })
  .superRefine((c, ctx) => {
    const err = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    c.questions.forEach((q, i) => {
      if (!(q.scale in c.scales)) err(["questions", i, "scale"], `no scale named ${q.scale}`);
      if (q.part === "baseline" && !c.parts.baseline) err(["questions", i, "part"], "baseline question but no baseline part");
    });
    if (c.parts.baseline && !c.questions.some((q) => q.part === "baseline"))
      err(["parts", "baseline"], "baseline part without a baseline question");
    if (!c.questions.some((q) => q.part === "clips")) err(["questions"], "no clip question");
    const dup = (xs: string[]) => xs.find((x, i) => xs.indexOf(x) !== i);
    const qd = dup(c.questions.map((q) => q.id));
    if (qd) err(["questions"], `duplicate question id ${qd}`);
    const panels = c.items.panels.map((p) => p.id);
    const pd = dup(panels);
    if (pd) err(["items", "panels"], `duplicate panel id ${pd}`);
    const cd = dup(c.items.clips.map((x) => x.id));
    if (cd) err(["items", "clips"], `duplicate clip id ${cd}`);
    c.items.clips.forEach((x, i) => {
      if (!panels.includes(x.reference)) err(["items", "clips", i, "reference"], `no panel named ${x.reference}`);
    });
    if (c.parts.clips.session_size > c.items.clips.length)
      err(["parts", "clips", "session_size"], "session_size is larger than the number of clips");
    if (!isRemote(c.media.base)) {
      c.items.panels.forEach((p, i) => p.file || err(["items", "panels", i, "file"], "local media need a file"));
      c.items.clips.forEach((p, i) => p.file || err(["items", "clips", i, "file"], "local media need a file"));
    }
  });

export type StudyConfig = z.output<typeof StudyConfig>;

export const isRemote = (base: string) => /^https:\/\//.test(base);

export const studyJsonSchema = () => z.toJSONSchema(StudyConfig, { io: "input", unrepresentable: "any" });
