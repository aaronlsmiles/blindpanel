# blindpanel: process log (public)

## 2026-10-28: v0.1 built in one session

**Criteria first.** STATUS.md froze success, a kill rule and a £0 budget before any code.

**Order of work.**
1. The visitor-order scheme, against vectors from a stdlib-only Python reference: 12 of 12 matched on the first run.
2. The study schema and the compiler.
3. The stats.
4. The StillDrawn example's reference data, copied unchanged from the public release.
5. The golden tests: ordinal α 0.2087697206147856 (register) and 0.4776558778120862 (sameness), and all ten per-metric ρ, each matched to 1e-12 on the first run. The α code is a line-for-line port of the release's frozen analysis, so its summation order matches.
6. Payload validation, the stores, and the SQL. The SQL was tested in PGlite (Postgres in WebAssembly) with Supabase's three API roles recreated.
7. The UI, the CLI and the end-to-end tests.

**Surprises worth keeping.**
- **A model named "H3".** The blinding scan's first real catch was the HTML element `<h3>`, because one of StillDrawn's models is called H3. Banned terms now keep their own regex flags: `/\bH3\b/` is case-sensitive, and the lowercase `h3-fal` and `_h3` forms are listed separately.
- **A test that couldn't fail.** "Reordered baseline" passed because block 1 held a single still. The test now adds a foreign still instead.
- **A strong rater.** A visitor who answers exactly the panel's mean does not beat every rater under leave-one-out: one rater tracked the mean more closely (ρ 0.955 against 0.948). The test now states the definition rather than the hoped-for outcome.
- **Accessible names.** Chromium named a radio "2 , Mostly not", with a space taken from a visually hidden span. Each radio now carries an explicit name, "2, Mostly not".
- **One bad row.** A hand-inserted malformed row could make the SQL `tally()` raise for everyone. The guard now sits inside the lateral call, and a test inserts such a row.

- **A class-name collision.** A new legend class reused the intro's `.bp-key` name, and its `nowrap` made the page 594 px wide on a 390 px phone. The e2e suite caught it as a tap landing on the wrong element. The class is renamed, and every screenshot now asserts there is no horizontal overflow.

**What blinding can't do.** The 20 StillDrawn clips are byte-identical to the release, so their C2PA credentials remain. The docs say so (docs/blinding.md). `reveal.json` is a static file, so a direct request reads it.

**Spend:** £0.

## 2026-10-29: the first host's design pass

StillDrawn Explorer's design pass looked at the kit inside a real page and found five things the synthetic example never showed.

- **Tabular figures on every word.** The kit set `tabular-nums` on all of its text. In the host's face (Schibsted Grotesk), `tnum` also gives `. , : % ×` a digit's width, so sentences read "0 . 78" and "first , then". The kit's default face (system-ui) doesn't do that, which is why it went unseen. Tabular figures now sit only where numbers line up: tables, the strip's scale and the progress count.
- **A reveal table that broke words.** `overflow-wrap: anywhere` on the whole table let a phone split "Open", "Clip 1" and "LTX-2.3". The 320 px wide-font test didn't catch it, because the synthetic example's labels are short; the check runs on the StillDrawn session too now, where it failed on all eight "Open" links first.
- **A legend on its rule.** Each question's `<legend>` sat on its fieldset's top border, with the rule running on after it. It is floated now, so it sits under the rule, as the intro's questions do.
- **Numbers that belonged to the browser.** The intro's scale keys used the browser's own list numbers. The host's list reset, in a layer below the kit's, still removed them: the kit never said `list-style` itself.
- **A stale build under test.** The e2e suite serves `dist/`, so a run straight after a source edit tests the old code. Every round now builds first.

After an opt-in, the results also ask for the tally once more with `fresh: true`, so the visitor who just added their ratings is counted (the endpoint is cached at the edge for five minutes).
