# blindpanel

Blinded human rating of generated video, as a kit. You write one `study.yaml`, and blindpanel turns it into:
- a rating page that hides which model made each clip
- a small submit endpoint that stores nothing personal
- an export that analysis scripts can read
- the agreement maths that shows a rater where they land against a reference panel and against automatic metrics

MIT licence. Version 0.1.0. Live demo: [stilldrawn.studionephele.com/rate](https://stilldrawn.studionephele.com/rate). [Film](https://media.studionephele.com/films/v1/blindpanel/16x9.mp4). There you rate clips from the [StillDrawn](https://doi.org/10.5281/zenodo.23072784) benchmark and see how your answers compare with its six raters'.

```bash
git clone <this repo> blindpanel && cd blindpanel
npm run setup            # install, build, verify both examples, then serve one at http://localhost:5173
```

## What it explores

Can a blinded rating study be something you clone, not something you rebuild?

StillDrawn's human check was a one-off. Six raters scored 20 generated clips on two questions, register and sameness. The clips came from five video models, and the raters never learned which model made which. The page that ran it was hand-made, with:
- a seeded order for each rater
- the frozen wording, checked byte for byte before every deploy
- a search for model names over everything that shipped
- a store that refused edits

All of it mattered, and none of it was reusable.

blindpanel turns those pieces into parts a study declares:
- the questions and their five labelled points
- the reference stills shown beside each clip
- a seed
- a list of names the page must never show

The kit then:
- builds the page
- derives each visitor's order from the seed and a random session id
- checks that no model is named in the build, its file names, its media URLs or the media servers' response headers
- fails the build if the wording changes without a new instrument version

## Why it matters

Human judgement is still how generated video gets checked. Runway, for example, collected over 16,000 human ratings of 1,450 simulated robot rollouts, and those ratings ranked eight robot policies much as real-world trials did (Pearson 0.95; [Runway Research, February 2026](https://runway.com/research/accelerating-robot-policy-evaluation)).

The tooling is where such studies go wrong quietly:
- **A leak.** A model's name in a URL unblinds every rater.
- **Drifting wording.** Wording edited after the pilot makes raters incomparable.
- **Agreement read as accuracy.** On StillDrawn, the panel's ordinal Krippendorff's α was 0.21 for register and 0.48 for sameness. With agreement that low, a single rater's scores say little, and so do a metric's correlations with them.

The kit makes each of these a test that fails. The StillDrawn example is checked against the published values: α to 1e-12, and each metric's Spearman ρ against the panel mean to 1e-12.

## What it suggests

Rating should be cheap enough to do often, and honest enough to share. "Where you land" is the part a visitor sees. After rating 8 clips (or all 20), you get:
- your agreement with the panel's average, beside each rater's agreement with the other five
- how lenient or strict you were
- the panel's α with and without you
- your correlation with each automatic metric, beside the published one

If public visitors can see how much six careful raters disagree, they may read a leaderboard built on human scores more carefully.

## How a study works

1. **Configure.** Write `study.yaml`: scales, questions, parts (an optional baseline of stills, then the clips), items, and the reference panel's ratings and metrics. [docs/config.md](docs/config.md) is the reference; `schema/study.schema.json` gives editors autocomplete.
2. **Lock.** `blindpanel lock study.yaml` records the wording's hash. From then on, `verify` fails if the wording changes without a new `instrument`.
3. **Build and verify.** `blindpanel build` writes a static page with no bundler and no third-party scripts. `blindpanel verify --dist <dir>` checks for:
   - leaks: model names anywhere except `reveal.json`, plus secrets and outside URLs
   - drift: the wording lock, orders, and media hashes. With `--media` it fetches every remote file.
4. **Run.** `blindpanel dev` serves the page and the API locally. For production, mount the page with `blindpanel/ui` and run `blindpanel/server`'s handlers on any platform with `Request`/`Response`. [docs/deploy.md](docs/deploy.md) covers Vercel and Supabase.
5. **Analyse.** `blindpanel export` writes one `ratings-V0001.json` per visitor in the reference panel's own shape, plus a tidy CSV. `blindpanel report` prints the crowd's agreement with the panel and the metrics.

The visitor's order is a published scheme (SHA-256 seeding xoshiro128**, then Fisher–Yates), so anyone can recompute it from the session id. The server rejects a submission whose order differs: [docs/order.md](docs/order.md).

## Privacy

Opting in sends:
- a random session id
- your answers and the order you saw them in
- whether autoplay and keyboard shortcuts were used
- the time taken, rounded to 10 seconds

Nothing else is stored: no names, accounts, cookies, IP addresses or user agents. The database keeps the day a submission arrived, never the time. Your results are computed in your browser whether or not you opt in.

## Limitations

- **Blinding covers the page, not the files.** It keeps model names out of the page, its URLs and its requests until you finish. `reveal.json` is a static file, so anyone who requests it directly can read it. It also cannot remove provenance embedded in byte-exact media: StillDrawn's clips carry C2PA credentials, which a determined visitor can read. Anyone can also match a clip against a public release. [docs/blinding.md](docs/blinding.md) explains this.
- **Small numbers.** With 8 clips, one answer moves ρ by about 0.1, and the page says so. The published 95% intervals are about ±0.4 wide, and the page shows them beside each value.
- **Recomputed numbers.** Bootstrap intervals use the kit's own generator, so they cannot reproduce numpy's draws. Published intervals are shown as published.
- **Visitors see copies of the stills.** In the StillDrawn example, the six raters rated the original PNG stills (0.4–2.9 MB each). Visitors see high-quality WebP copies instead, about a sixth of the size. The copies are lossy but close: 43–51 dB PSNR against the PNG. The clips are the original files.
- **The author's earlier wording.** In the StillDrawn panel, the author rated first, before two wording revisions. A switch leaves the author out.
- **Self-selected visitors.** People choose to rate, so the crowd tally is a curiosity, not a study result.
- **Version 0.1 is public mode only.** Invited panels (passwords per rater) come in v0.2.

## Layout

| Path | What |
|---|---|
| `src/core` | schema, compiler, codes, order, payload validation (browser and server) |
| `src/stats` | rank, Spearman, ordinal Krippendorff's α, where you land, bootstrap |
| `src/ui` | `mountSession`, `mountResults`, the standalone page; no framework |
| `src/server` | submit, tally and keep-warm handlers; memory, file and Supabase stores |
| `sql/schema.sql` | the Supabase schema: row-level security forced with no policies, daily and total caps |
| `examples/synthetic` | three one-second CC0 clips; runs offline, used by CI |
| `examples/stilldrawn` | the StillDrawn human check (CC BY 4.0; see its ATTRIBUTION.md) |

## Licence

Code: MIT ([LICENSE](LICENSE)). `examples/synthetic` is CC0. `examples/stilldrawn` holds CC BY 4.0 data from the StillDrawn release (Aaron Smiles, 2026, doi:10.5281/zenodo.23072784); its media are served from the release's host, byte-identical.
