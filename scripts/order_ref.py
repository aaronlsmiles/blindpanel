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


def main():
    items = [f"x{i}" for i in range(10)]
    vectors = []
    for seed in ("demo", "20260813"):
        for part in ("clips", "baseline"):
            for participant in ("00000000-0000-4000-8000-000000000000", "a"):
                key = f"{seed}:{part}:{participant}"
                vectors.append({"key": key, "items": items, "order": shuffle(items, key)})
    rng = Xoshiro128ss("demo:clips:a")
    print(json.dumps({"next": {"key": "demo:clips:a", "values": [rng.next() for _ in range(10)]},
                      "vectors": vectors}, indent=1))


if __name__ == "__main__":
    main()
