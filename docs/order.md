# Visitor order

Every participant sees the clips, and the baseline panels, in an order derived from three strings: the study's `blinding.seed`, the part (`clips` or `baseline`) and the participant's session id (a random UUID made in the browser).

1. `key = "<seed>:<part>:<participant>"`, encoded as UTF-8.
2. `digest = SHA-256(key)`. The first 16 bytes, read as four little-endian unsigned 32-bit integers, are the state of a [xoshiro128**](https://prng.di.unimi.it/) generator. An all-zero state becomes `[1, 0, 0, 0]`.
3. `below(n) = floor(next() × n / 2³²)` (multiply-shift; the bias is at most n / 2³², negligible for studies of this size).
4. Fisher–Yates from the top: for `i` from `n − 1` down to `1`, `j = below(i + 1)`, swap `i` and `j`.

`scripts/order_ref.py` implements the same scheme with the Python standard library and prints the vectors that `tests/order.test.ts` checks against. Anyone can recompute a participant's order from the session id stored with their submission. The server does exactly that: it rejects a submission whose order differs from the derived one.

## Sessions and blocks

`parts.clips.session_size` clips make a session. When `extend: true`, a visitor who finishes can carry on to the remaining clips in a second block. Before each block, the visitor rates the reference panels of that block's clips that they have not rated yet, in the participant's seeded baseline order. So the baseline always comes before the clips it anchors.

## Recorded orders are data

A reference panel's own orders (for StillDrawn, the six raters' orders from August 2026) were made by an earlier scheme. They are recorded data, not something this scheme reproduces.
