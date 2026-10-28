import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { participantOrder } from "../src/core/order.js";
import { buildSubmission } from "../src/core/payload.js";
import type { Study, Submission } from "../src/core/types.js";
import {
  createKeepwarmHandler, createSubmitHandler, createTallyHandler, fileStore, memoryStore, type Store,
} from "../src/server/index.js";
import { loadExample } from "./helpers.js";

let study: Study;
const tmp = mkdtempSync(join(tmpdir(), "bp-"));
beforeAll(async () => ({ study } = await loadExample("synthetic")));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const ORIGIN = "http://localhost:5173";
let n = 0;
async function submission(score = 4): Promise<Submission> {
  const session = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const order = await participantOrder(study, session);
  const b = order.blocks[0];
  return buildSubmission(study, {
    session, order, blocks: 1,
    answers: {
      baseline: Object.fromEntries(b.baseline.map((p) => [p, { drawing: 5 }])),
      clips: Object.fromEntries(b.clips.map((c, i) => [c, { look: score, same: ((score + i) % 5) + 1 }])),
    },
    delivery: { autoplay: true, keyboard: true, seconds: 40 },
  });
}
const post = (body: unknown, init: RequestInit = {}) =>
  new Request(`${ORIGIN}/api/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(init.headers as Record<string, string>) },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...Object.fromEntries(Object.entries(init).filter(([k]) => k !== "headers")),
  });

describe.each([
  ["memoryStore", () => memoryStore({ dailyCap: 3 })],
  ["fileStore", () => fileStore({ dir: mkdtempSync(join(tmp, "f-")), dailyCap: 3 })],
])("%s", (_name, mk) => {
  let store: Store;
  let submit: (r: Request) => Promise<Response>;
  beforeAll(() => {
    store = mk();
    submit = createSubmitHandler({ study, store, allowedOrigins: [ORIGIN] });
  });

  test("200, then 409 for the same session", async () => {
    const s = await submission();
    const r = await submit(post(s));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await submit(post(s))).status).toBe(409);
  });
  test("405, 415, 403, 413, 400", async () => {
    expect((await submit(new Request(`${ORIGIN}/api/submit`))).status).toBe(405);
    expect((await submit(post(await submission(), { headers: { "content-type": "text/plain" } }))).status).toBe(415);
    expect((await submit(post(await submission(), { headers: { origin: "https://evil.example" } }))).status).toBe(403);
    expect((await submit(post("x".repeat(17 * 1024)))).status).toBe(413);
    expect((await submit(post("{not json"))).status).toBe(400);
    expect((await submit(post({ format: "blindpanel/1" }))).status).toBe(400);
  });
  test("daily cap gives 429", async () => {
    expect((await submit(post(await submission(3)))).status).toBe(200);
    expect((await submit(post(await submission(2)))).status).toBe(200);
    expect((await submit(post(await submission(1)))).status).toBe(429);
  });
  test("tally: flagged rows excluded, small cells hidden, cache headers", async () => {
    const tally = createTallyHandler({ study, store, minN: 2 });
    const r = await tally(new Request(`${ORIGIN}/api/tally`));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=3600");
    const t = await r.json();
    expect(t.study).toBe("synthetic");
    expect(t.n_sessions).toBe(3);
    for (const item of Object.values(t.items) as Record<string, { n: number; counts: number[] }>[]) {
      for (const q of Object.values(item)) {
        expect(q.n).toBeGreaterThanOrEqual(2);
        expect(q.counts.reduce((a, b) => a + b, 0)).toBe(q.n);
      }
    }
  });
});

test("too_fast rows are stored but left out of the tally", async () => {
  const store = memoryStore();
  const submit = createSubmitHandler({ study, store, allowedOrigins: [ORIGIN] });
  const s = await submission();
  s.delivery.duration_s = 0;
  expect((await submit(post(s))).status).toBe(200);
  expect((await store.rows("synthetic"))[0].flags).toEqual(["too_fast"]);
  expect((await store.tally("synthetic", 1)).n_sessions).toBe(0);
});

test("a failing store gives 503, and the tally reads unavailable", async () => {
  const broken: Store = {
    insert: async () => { throw new Error("down"); },
    tally: async () => { throw new Error("down"); },
    rows: async () => [],
    ping: async () => { throw new Error("down"); },
  };
  expect((await createSubmitHandler({ study, store: broken, allowedOrigins: [ORIGIN] })(post(await submission()))).status).toBe(503);
  const r = await createTallyHandler({ study, store: broken })(new Request(`${ORIGIN}/api/tally`));
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ ok: false, error: "unavailable" });
});

test("keepwarm needs the bearer secret", async () => {
  const kw = createKeepwarmHandler({ store: memoryStore(), secret: "s3cret", study: "synthetic" });
  expect((await kw(new Request(`${ORIGIN}/api/keepwarm`))).status).toBe(401);
  expect((await kw(new Request(`${ORIGIN}/api/keepwarm`, { headers: { authorization: "Bearer nope" } }))).status).toBe(401);
  expect((await kw(new Request(`${ORIGIN}/api/keepwarm`, { headers: { authorization: "Bearer s3cret" } }))).status).toBe(200);
  const unset = createKeepwarmHandler({ store: memoryStore(), secret: undefined, study: "synthetic" });
  expect((await unset(new Request(`${ORIGIN}/api/keepwarm`, { headers: { authorization: "Bearer " } }))).status).toBe(500);
});

test("the file store survives a restart and refuses duplicates across it", async () => {
  const dir = mkdtempSync(join(tmp, "restart-"));
  const s = await submission();
  const a = createSubmitHandler({ study, store: fileStore({ dir }), allowedOrigins: [ORIGIN] });
  expect((await a(post(s))).status).toBe(200);
  const b = createSubmitHandler({ study, store: fileStore({ dir }), allowedOrigins: [ORIGIN] });
  expect((await b(post(s))).status).toBe(409);
  expect(await fileStore({ dir }).rows("synthetic")).toHaveLength(1);
});
