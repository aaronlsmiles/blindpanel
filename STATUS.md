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

## Spend: £0 of £0

## Phase 3 result (2026-10-28)

- **Clean clone:** see round 6.
- **Scripted StillDrawn session** (fixed session, stills 5, each clip answered with the panel's rounded mean). The numbers are identical at 1440 and 390, light and dark:
  - Register: ρ 0.92 against the six raters' 0.18–0.83 (beats all 6). α on these 8 clips is 0.20, and 0.23 with the visitor added.
  - Sameness: ρ 0.95 against 0.56–0.94 (beats all 6). α 0.49, and 0.56 with the visitor added.
- **Left for Phase 4:** the `/rate` mount and StillDrawn reveal in the explorer, `api/` wrappers, applying `sql/schema.sql` to the live project, the vendored tarball, the React wrapper, `db check`.
- **Fixed after review:** tied raters now sit in rows under the scale line. A class collision that made the intro 594 px wide at 390 was fixed, and the e2e suite now fails on any horizontal overflow. A fresh clone at `ec1a0e1` passes `npm run setup -- --ci` again.

## Decisions (Aaron, 29 Oct 2026)

- The explorer consumes a vendored tarball (with a lock file), not a git dependency.
- The React wrapper lives in the explorer for v0.1.
- The 34 StillDrawn objects on R2 stay.
- Phase 4 starts in a fresh session.

## Links: demo — · film — · repo — (local only)

## Next

- Phase 5 kit round done 29 Oct (round 7). Aaron's call: `tabular-nums` scoped and `loadTally({ fresh })` go into v0.1.0 (still untagged until G5). **v0.1.1** holds `blindpanel db check` (the explorer's `tools/supabase/check.sql` is the working version); no date set.
- Candidates found by the design critique, not changed (they touch the protocol's presentation or the kit's copy): progress restarts at "Clip 1 of 8" after "Still 8 of 8" (no overall position); "Done: 8 clips rated" leaves out the stills; the results legend has no key for the author's hollow dots; per-question notes repeat on every screen. Aaron kept the clip screen's layout (still left, clip right, as the intro says).
- G5: push and create the GitHub repo (then CI and clean-clone.yml run on fresh runners).
