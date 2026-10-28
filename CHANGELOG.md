# Changelog

## 0.1.0 (unreleased)

- Study config (`study.yaml`) with a generated JSON Schema, seeded opaque codes and a wording lock.
- Visitor order: SHA-256 → xoshiro128** → Fisher–Yates, with a Python reference implementation.
- Framework-free rating UI: native radios in fieldsets, a both-answered gate, keyboard shortcuts, live announcements, reduced motion, saved progress.
- "Where you land": leave-one-out agreement, bias, α with you added, metric correlations beside published values.
- Submit, tally and keep-warm handlers over memory, file and Supabase stores; `sql/schema.sql`.
- CLI: `init`, `validate`, `build`, `dev`, `verify`, `lock`, `export`, `report`.
- Examples: `synthetic` (CC0, offline) and `stilldrawn` (CC BY 4.0, reproduces the published α and ρ to 1e-12).
