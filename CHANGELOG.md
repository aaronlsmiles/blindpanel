# Changelog

## 0.3.0 (2026-11-08)

- Attention repeats: `parts.clips.repeats` (`min_gap`, `items: [{of, position}]`). Each repeat has its own seeded code (the id `<clip id>#repeat`), shows its original's clip and still, and is placed by a published extension of the order scheme (docs/order.md, "Repeats"; `scripts/order_ref.py` is the reference). Repeats are not wording: the instrument hash is unchanged. A study without repeats compiles and orders exactly as in 0.2.
- The schema refuses a repeats layout that the order search cannot place: one that no draw satisfies, or one whose chance per draw is below 0.0028, so that all 10,000 draws could fail (docs/order.md, "Repeats"; `repeatPlacementChance`). `withRepeats` refuses a repeat whose original is not among the clips, or whose code is also an original's.
- Repeats count once. The results page leaves them out of its statistics (n, ρ, α with you added, the strip, the baseline-adjusted mean), and `blindpanel report` leaves them out of the crowd α and its clip count. `verify` checks reference ratings for the original clips only and reports an order that cannot be drawn as a failed check. `blindpanel export` writes a repeat's answers as rows of their own, keyed `<ref>#repeat`. `originalClipCodes(study)` lists a study's own clips.
- `mountSession(..., { end: { text, button } })`: a host that sends the answers itself replaces the end screen's sentence and button. The offer to rate the remaining clips is left out.
- `mountSession` resumes saved progress only when the host gave no `session` or the saved progress is for the same one. A reload still resumes; a second participant in the same browser starts fresh on their own session, where before their Send carried the first participant's session.
- `derivedSession(key)`: a fixed v4 session id from a key, for hosts that give each invited participant a fixed order.
- docs/hosted.md: hosting a study for invited raters.
- `delivery.ui` reads `blindpanel@0.3.0`.

### Fixed

- `verify`'s "every clip has reference ratings" check read a baseline question's columns (one per still) as if they were clip columns. In a study with a baseline question, a clip past the number of stills was never flagged, and a clip within that number could pass on a still's ratings. The check now reads the clip questions only.

## 0.2.0 (2026-11-08)

- **Upgrade step (required for choice scales): re-run `sql/schema.sql` on any live database.** It is safe to repeat and keeps the same function signature. Until it is re-run, `tally()` drops options 6–12 from the crowd counts; the raw submissions are still stored, so nothing is lost, and nothing changes for studies that only use ordinal scales.
- Choice scales: `scales.<id>.kind` is `ordinal` (the default; exactly 5 labels, unchanged) or `choice` (2–12 unordered options, answered 1…n). Every 0.1 `study.yaml` still validates and compiles to the same instrument hash (`tests/v01-compat.test.ts` pins three of them).
- The compiled `Scale` gains `kind` and `max`. `study.json` now carries `kind: "ordinal"` on ordinal scales; the instrument hash does not (an ordinal scale hashes exactly as in 0.1).
- The payload check accepts 1…max per question. A choice question may not set `direction`; two options may not read the same.
- The page renders n radios for a choice question, in a labelled `radiogroup`. Keys 1–9 select the first nine options and 0 the tenth; the 11th and 12th are clicked. No ordinal key, endpoints or direction text appear, and the shortcut line names the keys that exist.
- Results skip choice questions: no ρ, bias, strip or crowd mean for answers with no order.
- The `straightline` flag looks at ordinal questions only.
- `krippendorffNominal` (blindpanel/stats) beside the ordinal α; `blindpanel report` prints it for choice questions. Checked by hand on four small examples (8/15, 0, 9/37, 8/13).
- `blindpanel export`: `ratings.csv` keeps its columns in order and appends `option`, the label the visitor saw (also for ordinal answers). Cells holding a comma, quote or line break are quoted. The per-visitor JSON files are unchanged.
- Tally: `counts` has five entries, or as many as the highest option chosen. `sql/schema.sql`'s `tally()` (same signature; re-run the file, it is safe to repeat) counts options 1–12, where it counted 1–5 and dropped the rest.
- `delivery.ui` reads `blindpanel@0.2.0`.
- New example `examples/choice` (CC0; choice questions on stills and clips, no reference panel), verified by `npm run setup` and exercised in e2e on port 5312.
- Regenerated `schema/study.schema.json`.
- Fix: `verify`'s "every clip has reference ratings" check read a baseline question's columns (one per still) as if they were clip columns. In a study with a baseline question, a clip past the number of stills was never flagged, and a clip within that number could pass on a still's ratings. The check now reads the clip questions only.

## 0.1.0 (2026-10-30)

- Study config (`study.yaml`) with a generated JSON Schema, seeded opaque codes and a wording lock.
- Visitor order: SHA-256 → xoshiro128** → Fisher–Yates, with a Python reference implementation.
- Framework-free rating UI: native radios in fieldsets, a both-answered gate, keyboard shortcuts, live announcements, reduced motion, saved progress.
- "Where you land": leave-one-out agreement, bias, α with you added, metric correlations beside published values.
- Submit, tally and keep-warm handlers over memory, file and Supabase stores; `sql/schema.sql`.
- CLI: `init`, `validate`, `build`, `dev`, `verify`, `lock`, `export`, `report`.
- Examples: `synthetic` (CC0, offline) and `stilldrawn` (CC BY 4.0, reproduces the published α and ρ to 1e-12).
- Fix: hover fills and their 160 ms ease were not gated to hovering pointers, so a tap on a phone left an option or button filled, and choosing with a number key faded the selection in. Hovers now sit under `(hover: hover) and (pointer: fine)`, and the ease applies only while the pointer hovers; a choice made by key or tap changes at once.
- Fix: the metric table's number cells wrapped nowhere, so in a host font wider than the default, or on a 320 px phone, the results were wider than the screen. They now wrap between the value, its n and the interval's ends.
- Fix (tests): the e2e overflow check compared against `innerWidth`, which grows to fit overflowing content under mobile emulation, so it could not fail in the 390 px projects. It now compares against the configured viewport.
- `loadTally({ fresh })`: the results call it with `fresh: true` once, after the visitor's own opt-in succeeds, so a host can read past the tally's edge cache; the standalone page adds a random `?fresh=` key. Before, a visitor who had just added their ratings could read "0 visitors" for up to 5 minutes.
- Tabular figures only where numbers line up or update (tables, the strip's scale, progress). On all text, some faces' `tnum` also widens `. , : %`, so sentences read "0 . 78".
- Fix: the reveal table let every cell break anywhere, so on a phone it split "Clip 1", model names and "Open" mid-word. The clip and the link never wrap, a model's name wraps only at spaces, and the details wrap at spaces and hyphens.
- Fix: each question's legend sat on its fieldset's top rule, with the rule running on after it; it now sits under the rule, as in the intro.
- Fix: the intro's scale keys relied on the browser's list numbers, so a host's list reset (even in a lower layer) dropped the 1–5 and, in Safari, the list semantics; `.bp-key` now sets `list-style: decimal` itself, and the results' caveats `list-style: disc`.
- The StillDrawn example's title is now "StillDrawn's human check" (it repeated the host page's own heading, "Rate it yourself"). Not part of the instrument lock.
- Fix: the crowd count printed "1284 visitors"; counts now group thousands ("1,284").
- Display copies of stills: a panel can list `display` copies (`width`, optional `file` and `sha256`; remote files default to `<code>-w<width>.webp`). The page offers them as a `srcset` with `sizes` that match the kit's layout, and keeps the original as `src`; `verify --media` checks each copy. The StillDrawn example now lists WebP copies at 640 and 960 px and full width (quality 92; 21.3 MB of PNG stills become 3.4 MB at full width), made by `prepare.mjs`. The six raters saw the PNGs.
- Docs: hosts must put global resets in a cascade layer declared before `blindpanel`; an unlayered `button { color: inherit }` made the kit's primary buttons unreadable in the first host (docs/deploy.md).
