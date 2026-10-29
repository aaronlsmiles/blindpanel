#!/usr/bin/env node
// Builds this example from StillDrawn's public release and the explorer's study bundle.
//
//   node examples/stilldrawn/prepare.mjs --bundle <study/stilldrawn.json> --release <stilldrawn checkout>
//
// The bundle carries the frozen A6 wording, read verbatim from the release's
// analysis/human_check/build_harness.py. The six raters' files are copied from
// the release unchanged. Everything written here is CC BY 4.0 data (see ATTRIBUTION.md).
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { stringify } from "yaml";

const HERE = dirname(new URL(import.meta.url).pathname);
const { values: a } = parseArgs({ options: { bundle: { type: "string" }, release: { type: "string" } } });
if (!a.bundle || !a.release) {
  console.error("usage: prepare.mjs --bundle <study/stilldrawn.json> --release <stilldrawn checkout>");
  process.exit(2);
}
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const bold = (s) => s.replace(/<\/?b>/g, "**");

const bundle = json(a.bundle);
const hc = join(a.release, "analysis/human_check");
const mapping = json(join(hc, "mapping.json")).opaque_to_cell;
const bmap = json(join(hc, "baseline_mapping.json")).panel_opaque_to_name;
const results = json(join(hc, "human_check_results.json"));
const hashes = Object.fromEntries(
  readFileSync(join(a.release, "runs/CLIP-HASHES.csv"), "utf8").trim().split("\n").slice(1)
    .map((l) => l.split(","))
    .map(([file, h]) => [file, h]),
);
const T = bundle.text;

const ENGINES = {
  "gen4.5": { name: "Gen-4.5", provider: "Runway", dir: "gen4.5" },
  gen4_turbo: { name: "Gen-4 Turbo", provider: "Runway", dir: "gen4_turbo" },
  "h3-fal": { name: "H3", provider: "MiniMax, via fal", dir: "h3-fal" },
  wan22: { name: "Wan 2.2", provider: "Wan (open weights)", dir: "wan22" },
  ltx23: { name: "LTX-2.3", provider: "Lightricks (open weights)", dir: "ltx23" },
};
const MOTION = { IDLE: "idle", BURST: "burst", CAMPUSH: "camera push" };
const METRICS = [
  ["line", "line_chamfer_mean_px", "Line drift (px)"],
  ["tone", "tone_variance", "Screentone drift"],
  ["edge", "edge_abs_slope", "Edge decay"],
  ["style", "style_terminal", "Style drift"],
  ["closure", "closure_abs_terminal", "Line closure"],
];
const SEED = "stilldrawn-a6-blindpanel-1";
const BASE = "https://media.studionephele.com/blindpanel/stilldrawn/";
const EXPLORER = "https://stilldrawn.studionephele.com/explore";

const cellToCode = Object.fromEntries(Object.entries(mapping).map(([c, cell]) => [cell, c]));
const nameToPanel = Object.fromEntries(Object.entries(bmap).map(([p, name]) => [name, p]));

const panels = Object.entries(bmap)
  .sort()
  .map(([ref, id]) => ({ id, ref, sha256: sha(join(a.release, "dataset/panels", `${id}.png`)) }));
const clips = bundle.items.map((it) => {
  const e = ENGINES[it.engine];
  const file = `runs/${e.dir}/${it.cell}.mp4`;
  if (!hashes[file]) throw new Error(`no hash for ${file}`);
  const row = it.cell.replace(/_[^_]+$/, "");
  return {
    id: it.cell,
    ref: cellToCode[it.cell],
    reference: it.panel,
    sha256: hashes[file],
    label: e.name,
    meta: { by: e.provider, motion: MOTION[it.motion_class], still: it.panel },
    link: `${EXPLORER}?cell=${encodeURIComponent(row)}&e=${encodeURIComponent(it.engine)}`,
  };
});
for (const c of clips) if (!nameToPanel[c.reference]) throw new Error(`clip ${c.id} has no baseline panel`);

const DIR_Q = "5 = yes, completely · 1 = no, not at all";
const study = {
  blindpanel: 1,
  id: "stilldrawn",
  title: "StillDrawn's human check",
  instrument: "A6",
  media: { base: BASE, origins: ["https://media.studionephele.com"] },
  blinding: { seed: SEED, banned_terms_file: "banned-terms.txt", embedded_provenance: "allow" },
  scales: { hand_drawn: { labels: T.Q3_LABELS }, register: { labels: T.Q1_LABELS }, sameness: { labels: T.Q2_LABELS } },
  questions: [
    { id: "hand_drawn", short: "Still looks hand-drawn", part: "baseline", text: T.Q3, direction: DIR_Q, notes: [bold(T.Q1_MECH)], scale: "hand_drawn" },
    { id: "register", short: "Still looks hand-drawn", part: "clips", text: T.Q1, direction: DIR_Q, notes: [bold(T.Q1_MECH)], intro_notes: [bold(T.Q1_TONE)], scale: "register" },
    {
      id: "sameness", short: "Same image throughout", part: "clips", text: T.Q2,
      direction: "5 = yes, unchanged at every point · 1 = no, it became a different picture",
      notes: [bold(T.Q2_NOTE), bold(T.Q2_CONT)], scale: "sameness",
    },
  ],
  parts: {
    baseline: {
      intro: [
        "First, the **still drawings** on their own. One question about each. This part takes about a minute.",
      ],
    },
    clips: {
      intro: [
        "Each screen shows an **original still image** (left) and a **5-second animated clip** made from it (right, plays on loop). You answer **two questions** about each clip.",
        "The two are different questions and often have different answers. A clip can still look perfectly hand-drawn (a high answer to 1) while having turned into a completely different picture (a low answer to 2). How **much** a clip moves is not being asked about: a clip that barely moves but keeps everything intact is still a 5 on question 2.",
        "Go with your eye. There are no right answers, and other people's answers will differ. You can change an answer with Back before finishing.",
      ],
      watch_note: T.WATCH_NOTE,
      clip_seconds: 5,
      session_size: 8,
      extend: true,
      video: { loop: true, autoplay: "unless_reduced_motion" },
    },
  },
  items: { panels, clips },
  reference: {
    ratings: "reference/",
    author_slot: "AARON",
    metrics: "reference/metrics.json",
    attribution:
      "StillDrawn dataset (Aaron Smiles, 2026), CC BY 4.0, doi:10.5281/zenodo.23072784. Clips are byte-identical to the release, served under opaque names for blinding.",
  },
  modes: { public: { submit: true, tally: true, min_crowd_n: 5 } },
};

mkdirSync(join(HERE, "reference"), { recursive: true });
writeFileSync(
  join(HERE, "study.yaml"),
  "# yaml-language-server: $schema=../../schema/study.schema.json\n# Generated by prepare.mjs from StillDrawn's public release. CC BY 4.0: see ATTRIBUTION.md.\n" +
    stringify(study, { lineWidth: 0 }),
);
for (const f of readdirSync(join(hc, "ratings")).filter((f) => /^ratings-.+\.json$/.test(f)))
  copyFileSync(join(hc, "ratings", f), join(HERE, "reference", f));

const byCode = Object.fromEntries(bundle.items.map((it) => [cellToCode[it.cell], it]));
const metrics = {
  source: "analysis/human_check/human_check_results.json and the headline table, StillDrawn v1.0.0",
  alpha: Object.fromEntries(Object.entries(results.per_axis).map(([q, v]) => [q, v.krippendorff_alpha_ordinal])),
  caveats: [
    "Rater AARON is the study's author, who rated first: the register question's bottom label and its guidance note were revised after that pass (A6 addendum 4 and A8), before the other five raters saw the wording shown here. Use the switch to leave the author out.",
    "The published confidence intervals come from 10,000 bootstrap resamples in the paper's analysis. They are shown as published, not recomputed here.",
  ],
  metrics: METRICS.map(([key, id, label]) => ({
    id,
    label,
    worse: "higher",
    values: Object.fromEntries(Object.entries(byCode).sort().map(([c, it]) => [c, it.h[key] ?? null])),
    published: Object.fromEntries(
      Object.entries(results.per_axis).map(([q, v]) => {
        const m = v.per_metric[id];
        return [q, { rho: m.spearman_rho, ci95: m.ci95, n: m.n_cells }];
      }),
    ),
  })),
};
writeFileSync(join(HERE, "reference/metrics.json"), JSON.stringify(metrics, null, 1) + "\n");

// Inputs for the upload tool (kept outside this repo): source file -> opaque object name.
writeFileSync(
  join(HERE, "media-sources.json"),
  JSON.stringify(
    {
      note: "Source files in the StillDrawn release for each item id; build the study to get each item's opaque object name.",
      panels: Object.fromEntries(panels.map((p) => [p.id, `dataset/panels/${p.id}.png`])),
      clips: Object.fromEntries(clips.map((c) => [c.id, `runs/${ENGINES[bundle.items.find((i) => i.cell === c.id).engine].dir}/${c.id}.mp4`])),
    },
    null,
    1,
  ) + "\n",
);
console.log(`wrote study.yaml (${panels.length} panels, ${clips.length} clips), reference/ and media-sources.json`);
