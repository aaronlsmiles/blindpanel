import { sha256 } from "./rng.js";

// Crockford base32, lower case (no i, l, o, u)
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export type CodeKind = "clip" | "panel";

/** A seeded opaque code: "c" or "p" plus 5 base32 characters (25 bits of SHA-256). */
export async function opaqueCode(seed: string, kind: CodeKind, id: string): Promise<string> {
  const d = await sha256(`${seed}:code:${kind}:${id}`);
  let bits = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0;
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += ALPHABET[(bits >>> 27) & 31];
    bits = (bits << 5) >>> 0;
  }
  return (kind === "clip" ? "c" : "p") + out;
}

export async function assignCodes(seed: string, kind: CodeKind, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const seen = new Map<string, string>();
  for (const id of ids) {
    if (id in out) throw new Error(`duplicate ${kind} id: ${id}`);
    const code = await opaqueCode(seed, kind, id);
    const other = seen.get(code);
    if (other) throw new Error(`code collision between ${other} and ${id}; change blinding.seed`);
    seen.set(code, id);
    out[id] = code;
  }
  return out;
}
