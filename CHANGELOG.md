# Changelog

## 0.1.0 (unreleased)

- Study config (`study.yaml`) with a generated JSON Schema, seeded opaque codes and a wording lock.
- Visitor order: SHA-256 → xoshiro128** → Fisher–Yates, with a Python reference implementation.
- Framework-free rating UI: native radios in fieldsets, a both-answered gate, keyboard shortcuts, live announcements, reduced motion, saved progress.
- "Where you land": leave-one-out agreement, bias, α with you added, metric correlations beside published values.
- Submit, tally and keep-warm handlers over memory, file and Supabase stores; `sql/schema.sql`.
- CLI: `init`, `validate`, `build`, `dev`, `verify`, `lock`, `export`, `report`.
- Examples: `synthetic` (CC0, offline) and `stilldrawn` (CC BY 4.0, reproduces the published α and ρ to 1e-12).
- Fix: the metric table's number cells wrapped nowhere, so in a host font wider than the default, or on a 320 px phone, the results were wider than the screen. They now wrap between the value, its n and the interval's ends.
- Fix (tests): the e2e overflow check compared against `innerWidth`, which grows to fit overflowing content under mobile emulation, so it could not fail in the 390 px projects. It now compares against the configured viewport.
- `loadTally({ fresh })`: the results call it with `fresh: true` once, after the visitor's own opt-in succeeds, so a host can read past the tally's edge cache; the standalone page adds a random `?fresh=` key. Before, a visitor who had just added their ratings could read "0 visitors" for up to 5 minutes.
- Tabular figures only where numbers line up or update (tables, the strip's scale, progress). On all text, some faces' `tnum` also widens `. , : %`, so sentences read "0 . 78".
- Fix: the reveal table let every cell break anywhere, so on a phone it split "Clip 1", model names and "Open" mid-word. The clip and the link never wrap, a model's name wraps only at spaces, and the details wrap at spaces and hyphens.
- Fix: each question's legend sat on its fieldset's top rule, with the rule running on after it; it now sits under the rule, as in the intro.
- Fix: the intro's scale keys relied on the browser's list numbers, so a host's list reset (even in a lower layer) dropped the 1–5 and, in Safari, the list semantics; `.bp-key` now sets `list-style: decimal` itself, and the results' caveats `list-style: disc`.
- The StillDrawn example's title is now "StillDrawn's human check" (it repeated the host page's own heading, "Rate it yourself"). Not part of the instrument lock.
- Docs: hosts must put global resets in a cascade layer declared before `blindpanel`; an unlayered `button { color: inherit }` made the kit's primary buttons unreadable in the first host (docs/deploy.md).
