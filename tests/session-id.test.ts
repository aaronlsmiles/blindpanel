import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { derivedSession } from "../src/core/session-id.js";
import { participantOrder } from "../src/core/order.js";
import { buildSubmission, validateSubmission } from "../src/core/payload.js";
import { loadExample, withSyntheticRepeat } from "./helpers.js";

// An independent rendering of the scheme: the first 16 bytes of SHA-256(key), version 4, variant 10.
function expected(key: string) {
  const b = createHash("sha256").update(key, "utf8").digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("derivedSession", () => {
  test.each(["20261104:a13-burst:session:R24", "20261104:a13-push:session:R24", "x"])("%s", async (key) => {
    const s = await derivedSession(key);
    expect(s).toMatch(UUID4);
    expect(s).toBe(expected(key));
    expect(await derivedSession(key)).toBe(s);
  });
  test("different keys, different sessions", async () => {
    expect(await derivedSession("a")).not.toBe(await derivedSession("b"));
  });
  test("a derived session runs through the order, the submission and the server's check", async () => {
    const { study } = await loadExample("synthetic", withSyntheticRepeat);
    const session = await derivedSession(`20261104:${study.id}:session:R24`);
    const order = await participantOrder(study, session);
    const q = (part: string) => study.questions.filter((x) => x.part === part).map((x) => x.id);
    const answers = {
      baseline: Object.fromEntries(order.blocks[0].baseline.map((p) => [p, Object.fromEntries(q("baseline").map((id) => [id, 3]))])),
      clips: Object.fromEntries(order.blocks[0].clips.map((c) => [c, Object.fromEntries(q("clips").map((id) => [id, 4]))])),
    };
    const s = buildSubmission(study, { session, order, blocks: 1, answers, delivery: { autoplay: true, keyboard: false, seconds: 90 } });
    expect(await validateSubmission(study, JSON.parse(JSON.stringify(s)))).toMatchObject({ ok: true, value: { session } });
  });
});
