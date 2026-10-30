# Attribution

This example's data come from the **StillDrawn** benchmark release, v1.0.0:

> StillDrawn dataset (Aaron Smiles, 2026). CC BY 4.0. doi:[10.5281/zenodo.23072784](https://doi.org/10.5281/zenodo.23072784)
> (all versions: [10.5281/zenodo.23072783](https://doi.org/10.5281/zenodo.23072783))

What is used, and what changed:

- `reference/ratings-*.json`: the six raters' files from `analysis/human_check/ratings/`, **unchanged**.
- `reference/metrics.json`: the per-clip headline metrics and the published agreement values (`analysis/human_check/human_check_results.json`), reorganised by the release's opaque clip codes. Values are unchanged.
- `study.yaml`: the A6 instrument wording, verbatim from `analysis/human_check/build_harness.py`. The `<b>` spans are written as `**…**`. The introduction paragraphs are adapted from the hosted instrument.
- Media: 20 clips and 14 source panels, **byte-identical** to the release, served from `media.studionephele.com` under opaque names so the page does not name the model. The clips are not re-encoded, so they keep their embedded C2PA credentials.
- Display copies (changed): each source panel is also served as lossy WebP at 640 and 960 px and at full width (cwebp, quality 92; 43–51 dB PSNR against the PNG at full width), made by `prepare.mjs`. The page shows these so stills load quickly. The six raters rated the PNGs, which stay at their own URLs.

The release asks that its clips are not used to train models (`NOTICE-PROVIDERS.md`). That notice applies here too.

The kit's code is MIT; these data stay CC BY 4.0.
