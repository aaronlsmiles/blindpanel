import { sha256 } from "./rng.js";

/**
 * A session id derived from a key, for a host that gives each invited participant a fixed order
 * (docs/hosted.md): the first 16 bytes of SHA-256(key) written as a version-4 UUID, so it passes the
 * payload's session check and the order scheme treats it like any other session.
 */
export async function derivedSession(key: string): Promise<string> {
  const b = (await sha256(key)).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
