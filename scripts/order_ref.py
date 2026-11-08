#!/usr/bin/env python3
"""Reference implementation of blindpanel's visitor-order scheme (docs/order.md).

Standard library only. Prints the test vectors that tests/order.test.ts checks
the TypeScript implementation against:

    python3 scripts/order_ref.py > tests/fixtures/order-vectors.json
"""
import hashlib
import json
import struct

M32 = 0xFFFFFFFF


def rotl(x, k):
    return ((x << k) | (x >> (32 - k))) & M32


class Xoshiro128ss:
    def __init__(self, key: str):
        digest = hashlib.sha256(key.encode("utf-8")).digest()
        self.s = list(struct.unpack("<4I", digest[:16]))
        if not any(self.s):
            self.s = [1, 0, 0, 0]

    def next(self) -> int:
        s = self.s
        result = (rotl((s[1] * 5) & M32, 7) * 9) & M32
        t = (s[1] << 9) & M32
        s[2] ^= s[0]
        s[3] ^= s[1]
        s[1] ^= s[2]
        s[0] ^= s[3]
        s[2] ^= t
        s[3] = rotl(s[3], 11)
        return result

    def below(self, n: int) -> int:
        return (self.next() * n) >> 32


def shuffle(items, key):
    rng = Xoshiro128ss(key)
    out = list(items)
    for i in range(len(out) - 1, 0, -1):
        j = rng.below(i + 1)
        out[i], out[j] = out[j], out[i]
    return out


def order_with_repeats(originals, key, repeats, min_gap, max_attempts=10_000):
    """docs/order.md, "Repeats": shuffle the originals from `key`; insert each repeat's alias at its
    1-based position, lowest position first; if any alias then sits fewer than `min_gap` places after
    its original (or before it), redraw from f"{key}:{attempt}" for attempt = 1, 2, ..."""
    inserts = sorted(repeats, key=lambda r: r["position"])
    for attempt in range(max_attempts):
        out = shuffle(originals, key if attempt == 0 else f"{key}:{attempt}")
        for r in inserts:
            out.insert(r["position"] - 1, r["alias"])
        if all(out.index(r["alias"]) - out.index(r["of"]) >= min_gap for r in inserts):
            return out
    raise RuntimeError(f"no order puts every repeat at least {min_gap} places after its original")


def main():
    items = [f"x{i}" for i in range(10)]
    vectors = []
    for seed in ("demo", "20260813"):
        for part in ("clips", "baseline"):
            for participant in ("00000000-0000-4000-8000-000000000000", "a"):
                key = f"{seed}:{part}:{participant}"
                vectors.append({"key": key, "items": items, "order": shuffle(items, key)})
    rng = Xoshiro128ss("demo:clips:a")
    originals = [f"x{i}" for i in range(12)]
    reps = [{"alias": "r0", "of": "x3", "position": 7}, {"alias": "r1", "of": "x8", "position": 13}]
    repeat_vectors = [{"key": f"demo:clips:{p}", "originals": originals, "repeats": reps, "min_gap": 3,
                       "order": order_with_repeats(originals, f"demo:clips:{p}", reps, 3)}
                      for p in ("a", "b", "c", "d")]
    print(json.dumps({"next": {"key": "demo:clips:a", "values": [rng.next() for _ in range(10)]},
                      "vectors": vectors, "repeats": repeat_vectors}, indent=1))


if __name__ == "__main__":
    main()
