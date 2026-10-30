# blindpanel — status

Card: P10, folded into P01's plan on 28 Oct · Started: 2026-10-28 · Public slug: `blindpanel` (cleared 2026-10-28)

## Criteria (frozen 2026-10-28)

- **Success:**
  1. From a clean clone, `npm run setup` gives a working local study with no accounts needed.
  2. CI is green on a fresh GitHub runner (the clean-clone workflow).
  3. The demo is live at `stilldrawn.studionephele.com/rate` with opt-in submission.
  4. A 45 s film is published. The card sets 45 s, under the case-study 60–180 s standard; this exception is recorded.
- **Kill rule:** if generality threatens day 9, ship config v0 limited to what the two examples use.
- **Budget:** 5 focused days, £0.
- **Hygiene:** a fresh repo. Logic is ported from the private rating app; none of its files, history or identifiers are copied. `scan-identifiers.sh` must pass before any push.

## Clearance

2026-10-28 name sweep for "blindpanel":
- GitHub: no repo with that name. PyPI 404, npm 404. Hugging Face models, datasets and spaces: none.
- arXiv: 0 results for "blindpanel", and none for "blind panel" in titles or abstracts.
- Web: only generic hardware use (rack blanking panels) and a feature name inside an unrelated screen-overlay app. No software product uses the name.
- Candidates offered: `blindpanel` (chosen), `rollout-rater`, `fairwitness`. Both alternates are clear on GitHub, PyPI, npm and Hugging Face; `fair-witness` with a hyphen has four small GitHub repos.

## Rounds

| # | Date | What was tried | Result | Kept? | £ |
|---|---|---|---|---|---|
| 0 | 2026-10-28 | Planning, as part of P01's master plan | Approved | yes | 0 |
| 1 | 2026-10-28 | Sub-plan C (`docs/superpowers/plans/2026-10-28-kit.md`): the design pass reconciled (radios, visitor order, opaque media paths, honest blinding, exact goldens; tarball consumption, React wrapper, invited mode and `db check` deferred) | Written | yes | 0 |
| 2 | 2026-10-28 | Core and stats, test first: order (Python vectors), codes, schema and compiler, lock, payload; Spearman, ordinal α, landing | α 0.2087697206147856 / 0.4776558778120862 and all 10 per-metric ρ to 1e-12 from the kit's own reference copy | yes | 0 |
| 3 | 2026-10-28 | Server and SQL: handlers over memory, file and Supabase stores; `sql/schema.sql` in PGlite | RLS forced, no policies; public roles denied everything incl. `tally()`; service role select/insert only; PT429 caps; SQL tally = JS tally | yes | 0 |
| 4 | 2026-10-28 | UI, CLI, verify, examples, setup, e2e | 140 unit tests; 24 Playwright runs (1440/390 × light/dark, axe WCAG 2.2 AA serious = 0, console clean); verify fails on each of 10 doctored builds | yes | 0 |
| 5 | 2026-10-28 | StillDrawn media at opaque R2 paths (`blindpanel/stilldrawn/<code>`), byte-exact, no custom metadata | 34 objects; `verify --media`: all reachable, sha256 = release, no model in headers; re-run uploads 0 | yes | 0 |
| 6 | 2026-10-29 | Phase 4, in the explorer's `/rate`: fixes found by the first host, each test first with a CHANGELOG line | Metric cells wrap (results fit 320 px and wide host fonts); the e2e overflow check uses the configured viewport (it could not fail under mobile emulation); docs: hosts layer their resets below `blindpanel`. 140 unit, 28 e2e with StillDrawn; a clean clone at `3695410` passes `npm run setup -- --ci`. Live: `sql/schema.sql` applied to the explorer's project, privileges checked as postgres, and `report --store supabase` read the live rows | yes | 0 |
| 7 | 2026-10-29 | Phase 5 (the explorer's design pass), each change test first with a CHANGELOG line. Aaron approved the two API/default changes | `loadTally({ fresh })` (fresh once after the visitor's own opt-in; the standalone page adds `?fresh=`); tabular figures only on tables, the strip's scale and progress; fixes: the reveal table split "Open", "Clip 1" and model names mid-word at 390, each legend sat on its fieldset's rule, the scale keys and the caveats lost their numbers and bullets under a host's list reset; the StillDrawn example's title no longer repeats the host's heading; crowd counts group thousands ("1,284"). 141 unit, 32 e2e, 4 StillDrawn e2e | yes | 0 |
| 8 | 2026-10-29 | `/review-animations` on the first host, test first with a CHANGELOG line | The option and button hovers were not gated to hovering pointers, so a tap left a fill on touch screens; the 160 ms background ease ran on every state change, so a choice made with the 1–5 keys faded in. Hovers now sit under `(hover: hover) and (pointer: fine)` and the ease lives on the hover state; a keyed or tapped choice changes at once. A stylesheet scan replaced a touch-emulation check that couldn't fail (Chromium's emulation never applies `:hover`). 142 unit, 36 e2e, 4 StillDrawn e2e | yes | 0 |
| 9 | 2026-10-29 | Phase 6: the P10 film (45 s, 16:9 and 9:16), made in the explorer repo (`film/`, `web/e2e/film.spec.ts`): a scripted visitor rates 8 clips on `/rate`, sees where they land, then a real `npm run setup` from a fresh clone at `97326a1` under Node 24.22.0 | Cuts 43.1 s (16:9) and 44.4 s (9:16), silent, captioned, every clip credited with its model while on screen. No kit change: the film found nothing broken in the kit. It did show npm 11's four `install-scripts` warnings for `fsevents@2.3.3` during `npm ci` (real output, kept in the film; a candidate below). Waiting for Aaron's review before the films go to R2 | yes | 0 |
| 10 | 2026-10-29 | Aaron's notes on the P10 film (made in the explorer repo): the first 20 s jarring, captions hard to see; narration to come (Hume, Aaron's choice) | The session now plays at real speed: the first clip held 4 s, one still and two clips answered, then Done, with a caption that says it was eight; no loading placeholders between screens. Ink caption band, Geist type, terminal in Geist Mono. Silent cut 46.1 s (16:9) and 43.0 s (9:16); with a placeholder voice about 45–47 s. No kit change | yes | 0 |
| 11 | 2026-10-30 | The P10 film narrated (the v1 studio narrator, Hume Octave) and uploaded with the P01 film | 44.6–46.8 s (16:9 and 9:16), −14.3 LUFS; on `media.studionephele.com/films/v1/blindpanel/` (both cuts, SRT and WebVTT, poster, loop), verified byte for byte. Phase 6 closed; no kit change | yes | 0 |
| 12 | 2026-10-30 | Phase 7: display copies of stills (test first: schema, compile, UI, an e2e that fails on the old study with 10 PNG fetches); the StillDrawn example's WebP copies on R2; README through plain-check, with Runway's robot-policy post cited in its own figures (Aaron kept it) | 148 unit, 36 synthetic e2e, 4 StillDrawn e2e; `verify --media` 91 checks; a clean clone at `29dac01` passes `npm run setup -- --ci` under Node 24.22.0. Clearance: tree and history clean, all commits noreply | yes | 0 |
| 13 | 2026-10-30 | G5 (Aaron's word for each step): repo public; CI and clean-clone green on GitHub's runners; v0.1.0 tagged and released by `release.yml` (tarball + SHA256SUMS); the explorer vendors the release tarball | Release tarball = local pack file for file (only the gzip bytes differ); live at `/rate` on production | yes | 0 |

## Spend: £0 of £0, inside budget (no paid service; CI runs on GitHub's free tier for public repos)

## Phase 3 result (2026-10-28)

- **Clean clone:** see round 6.
- **Scripted StillDrawn session** (fixed session, stills 5, each clip answered with the panel's rounded mean). The numbers are identical at 1440 and 390, light and dark:
  - Register: ρ 0.92 against the six raters' 0.18–0.83 (beats all 6). α on these 8 clips is 0.20, and 0.23 with the visitor added.
  - Sameness: ρ 0.95 against 0.56–0.94 (beats all 6). α 0.49, and 0.56 with the visitor added.
- **Left for Phase 4:** the `/rate` mount and StillDrawn reveal in the explorer, `api/` wrappers, applying `sql/schema.sql` to the live project, the vendored tarball, the React wrapper, `db check`.
- **Fixed after review:** tied raters now sit in rows under the scale line. A class collision that made the intro 594 px wide at 390 was fixed, and the e2e suite now fails on any horizontal overflow. A fresh clone at `ec1a0e1` passes `npm run setup -- --ci` again.

## Gate G0 (Runway terms)

Closed 30 Oct 2026 (Aaron), with a caveat; the evidence is in the explorer's STATUS.md. The kit itself ships no Runway output: its StillDrawn example serves the release's CC BY clips from the media host under blinded names.

## Decisions (Aaron, 29 Oct 2026)

- The explorer consumes a vendored tarball (with a lock file), not a git dependency.
- The React wrapper lives in the explorer for v0.1.
- The 34 StillDrawn objects on R2 stay.
- Phase 4 starts in a fresh session.

## Links: demo https://stilldrawn.studionephele.com/rate · film https://media.studionephele.com/films/v1/blindpanel/16x9.mp4 (9x16.mp4, .vtt) · repo https://github.com/aaronlsmiles/blindpanel · release https://github.com/aaronlsmiles/blindpanel/releases/tag/v0.1.0

## Next

- **Done 30 Oct: P10 shipped (folded into P01).** v0.1.0 released (https://github.com/aaronlsmiles/blindpanel/releases/tag/v0.1.0); CI and the clean-clone workflow green on GitHub's runners; live demo at https://stilldrawn.studionephele.com/rate; film on R2. Success criteria 1–4 met (criterion 4: the 45 s card length, an exception recorded above).
- **v0.1.1 candidates:** `blindpanel db check`; quiet npm 11's `fsevents` install-script warnings; the design critique's copy items (progress restarting at "Clip 1 of 8", "Done" leaving out the stills, a key for the author's hollow dots, notes repeating on every screen).
- **v0.2:** invited mode (per-rater passwords).
