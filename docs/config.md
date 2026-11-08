# study.yaml reference

The schema is `schema/study.schema.json` (generated from `src/core/schema.ts`; a test fails if it is stale). Start a file with

```yaml
# yaml-language-server: $schema=../../schema/study.schema.json
```

and an editor with the YAML language server will complete and check it. `examples/synthetic/study.yaml` is a complete small study; `blindpanel init <dir>` copies it.

## Top level

| Key | Required | Meaning |
|---|---|---|
| `blindpanel` | yes | always `1` |
| `id` | yes | lower-case letters, digits and `-`; names the study in URLs, the database and exports |
| `title` | yes | shown as the page heading |
| `instrument` | yes | the wording's version. Change it whenever any wording changes, then run `blindpanel lock` |
| `privacy` | no | the privacy note shown on the intro and beside the opt-in (a sensible default exists) |
| `media` | yes | `base`: an `https://` URL, or a folder next to `study.yaml` (copied into the build). `origins`: the origins media may load from |
| `blinding` | yes | `seed` (4–64 characters), `banned_terms_file` (one term per line; `/regex/flags` lines are regular expressions; never shipped) |
| `scales` | yes | named scales. `kind: ordinal` (the default): `labels`, exactly five strings. `kind: choice`: `labels`, 2–12 unordered options. See "Scales" below |
| `questions` | yes | see below |
| `parts` | yes | `baseline` (optional) and `clips` |
| `items` | yes | `panels` (reference stills) and `clips` |
| `reference` | no | the reference panel, for "where you land" |
| `modes.public` | no | `submit` and `tally` (both default true), `min_crowd_n` (default 5) |
| `endpoints` | no | `submit` (`/api/submit`), `tally` (`/api/tally`), `reveal` (`reveal.json`) |

## Wording

Every rater-facing string supports `**bold**` and nothing else. HTML fails validation, so wording can never inject markup. The instrument lock covers question text, `direction`, `notes`, `intro_notes`, the scales, the part intros and `watch_note`. A question's `short` name (used in results headings) is not part of the instrument.

## Questions

```yaml
- id: register            # the key in reference ratings files and exports
  short: Still looks hand-drawn
  part: clips             # or baseline (asked about each still, before its clips)
  text: Does this clip still look like a hand-drawn black-and-white ink picture, all the way through?
  direction: 5 = yes, completely · 1 = no, not at all
  notes: [shown with the question on every screen]
  intro_notes: [shown only in the introduction]
  scale: register
```

A question on a `choice` scale must not set `direction`.

## Scales

```yaml
scales:
  register:                  # ordinal (the default): five points, 1 = low … 5 = high
    labels: [No, Mostly not, Half and half, Mostly, Yes]
  reacts:
    kind: choice             # nominal: 2–12 options, answered 1…n in the order listed
    labels: [The light, A sound, Another shape, Nothing in particular]
```

| | `ordinal` | `choice` |
|---|---|---|
| Labels | exactly 5 | 2 to 12, no two the same |
| Answer | 1…5 | 1…n |
| `direction` on the question | allowed | refused (the options have no order) |
| Page | five radios in a row, keys 1–5 | n radios in a grid, keys 1–9 and 0 (the first ten) |
| Statistics | ρ, bias, ordinal α, "where you land" | nominal α in `report`; nothing in "where you land" |
| `straightline` flag | yes | no |
| Reference ratings | values outside 1…5 read as missing | values outside 1…n read as missing |

The JSON Schema allows 2–12 labels for either kind; `blindpanel validate` (and `build`) refuse an ordinal scale that does not have five. The instrument lock covers a choice scale's kind and options; an ordinal scale hashes exactly as it did in 0.1.

## Parts

```yaml
parts:
  baseline:
    intro: ["First, the **still drawings** on their own."]
  clips:
    intro: ["Each screen shows an original still (left) and a clip made from it (right)."]
    watch_note: Watch the whole five seconds before answering.
    clip_seconds: 5          # used to flag implausibly fast sessions
    session_size: 8          # clips per session
    extend: true             # offer the rest after the session
    video: { loop: true, autoplay: unless_reduced_motion }   # or never
```

Before each block of clips, the visitor rates the stills those clips were made from (if they have not rated them yet).

### Repeats (attention checks)

```yaml
parts:
  clips:
    session_size: 57         # the clips plus the repeats
    extend: false            # required with repeats
    repeats:
      min_gap: 5             # a repeat sits at least 5 places after its original
      items:
        - { of: clip-07, position: 30 }
        - { of: clip-31, position: 52 }
```

The visitor answers a repeat like any clip; its answer is stored under the repeat's own code. Nothing on the page says a clip is repeated, but `study.json` lists the repeats: each repeat's code, its original's code and its position. The browser needs them to derive the order, and a repeat's video address is its original's file, so anyone who reads `study.json` can tell which clips come twice. `blindpanel export` writes a repeat's answers as rows of their own, keyed `<ref>#repeat`. The results page, `blindpanel report` and `verify`'s reference-ratings check count the original clips only. The instrument lock does not cover repeats: they are design, not wording, so adding them keeps the wording hash.

## Items

```yaml
items:
  panels:
    - { id: cu-line-3, ref: p07, file: cu-line-3.png, sha256: … }
  clips:
    - id: cu-line-3_campush_h3     # never shown before the reveal
      ref: c01                     # its key in the reference ratings files
      reference: cu-line-3         # the panel shown beside it
      file: clip.mp4               # optional for remote media: defaults to <code>.mp4
      sha256: …                    # checked by verify (local files, or remote with --media)
      label: H3                    # revealed after the session
      meta: { by: "MiniMax, via fal", motion: camera push }
      link: https://…              # optional, revealed with the label
```

Every item gets a seeded opaque code (`c` or `p` plus five characters). The page, `study.json`, local media file names and remote media URLs (by default) use only the codes. For remote media, upload each file under `<code>.<ext>`. To find the codes, build the study: `study.json` lists every code with its URL.

### Display copies of stills

Large stills load slowly. A panel can list smaller copies for the page to show:

```yaml
    - id: cu-line-3
      sha256: …                    # the original: what the reference panel rated
      display:
        - { width: 640, sha256: … }    # remote default: <code>-w640.webp
        - { width: 1344, sha256: … }   # the still's own width, as WebP
```

The page offers them as a `srcset` (narrowest first) and lets the browser pick one for the screen. The original stays the `src`, so a browser that can't use the set still shows it. Local media need a `file` for each copy. `verify --media` fetches and hash-checks every copy, like any other media.

If the reference panel rated the originals, say on your page that visitors see copies. StillDrawn's example does: its copies are lossy WebP.

## Reference panel

```yaml
reference:
  ratings: reference/            # ratings-<RATER>.json files
  author_slot: AARON             # gets the "leave out the author" switch
  metrics: reference/metrics.json
  attribution: …
```

A ratings file has the shape StillDrawn used, which `blindpanel export` also writes:

```json
{"rater": "R2", "ratings": [{"clip": "c01", "register": 4, "sameness": 2}],
 "baseline": [{"panel": "p05", "hand_drawn": 1}]}
```

`metrics.json` holds `{alpha?, caveats?, metrics: [{id, label, worse, values: {<ref>: number|null}, published?: {<question>: {rho, ci95, n}}}]}`.
