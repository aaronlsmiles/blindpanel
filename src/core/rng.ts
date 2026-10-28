// The visitor-order scheme (docs/order.md): SHA-256 of the key seeds
// xoshiro128**, which drives a Fisher-Yates shuffle. scripts/order_ref.py is
// the reference implementation; tests check this file against its vectors.

export async function sha256(text: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(text);
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data));
}

export async function sha256Hex(text: string): Promise<string> {
  return Array.from(await sha256(text), (b) => b.toString(16).padStart(2, "0")).join("");
}

const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

export interface Rng {
  next(): number;
  below(n: number): number;
}

export function xoshiro128ss(state: Uint32Array): Rng {
  const s = Uint32Array.from(state);
  if (!s.some((v) => v !== 0)) s[0] = 1;
  const next = () => {
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  };
  // multiply-shift: floor(next * n / 2^32), exact in doubles for n < 2^21
  const below = (n: number) => Math.floor((next() * n) / 0x1_0000_0000);
  return { next, below };
}

export async function rngFor(key: string): Promise<Rng> {
  const d = await sha256(key);
  const view = new DataView(d.buffer, d.byteOffset, 16);
  const state = new Uint32Array(4);
  for (let i = 0; i < 4; i++) state[i] = view.getUint32(i * 4, true);
  return xoshiro128ss(state);
}

export async function shuffle<T>(items: readonly T[], key: string): Promise<T[]> {
  const rng = await rngFor(key);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.below(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
