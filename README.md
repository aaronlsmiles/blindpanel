# blindpanel

Blinded human rating of generated video, packaged as a kit. It has five parts:
- a study config
- a rating page that hides which model made each clip
- a submit endpoint
- an export
- the agreement maths that shows where a rater lands against a reference panel and against automatic metrics

Status: in progress, v0.1.0 planned. MIT licence.

Live demo: `stilldrawn.studionephele.com/rate` (in progress). It rates clips from the [StillDrawn](https://doi.org/10.5281/zenodo.23072784) benchmark and compares you with its six raters.

## What it explores

The kit open-sources the blinded rating app behind StillDrawn's human check as something anyone can run for their own generated rollouts. A public rate-yourself demo comes with it.

## Why it matters

Human judgement is how generated video gets validated, and the tooling for it is unglamorous and decisive. Blinding, randomised order, verbatim wording and honest agreement statistics are easy to get wrong in a one-off script.

## What it suggests

Human judges at scale need well-made tools.

## Quick start

The one-command setup from a clean clone lands in Phase 3:

```bash
git clone <repo> && cd blindpanel && npm run setup
```
