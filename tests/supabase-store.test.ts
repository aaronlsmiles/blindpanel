import { expect, test } from "vitest";
import { supabaseStore } from "../src/server/stores/supabase.js";

function fakeFetch(respond: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const row = {
  study: "s", instrument: "1", session: "00000000-0000-4000-8000-000000000001",
  order: { baseline: [], clips: ["c1"] }, answers: { baseline: {}, clips: { c1: { q: 3 } } },
  delivery: { autoplay: true, keyboard: false, duration_s: 10, ui: "x" }, flags: [], received_day: "2026-10-28",
};

test("insert posts to the blindpanel schema with the key in apikey only", async () => {
  const { f, calls } = fakeFetch(() => new Response(null, { status: 201 }));
  const store = supabaseStore({ url: "https://x.supabase.co", key: "sb_secret_abc", fetch: f });
  expect(await store.insert(row)).toBe("ok");
  const { url, init } = calls[0];
  expect(url).toBe("https://x.supabase.co/rest/v1/submissions");
  const h = new Headers(init.headers);
  expect(h.get("apikey")).toBe("sb_secret_abc");
  expect(h.get("authorization")).toBeNull();
  expect(h.get("content-profile")).toBe("blindpanel");
  expect(h.get("prefer")).toBe("return=minimal");
  const body = JSON.parse(String(init.body));
  expect(body).toMatchObject({ study: "s", session: row.session, item_order: row.order, flags: [] });
  expect(body).not.toHaveProperty("received_day");
});

test("409 is a duplicate; PT429 is the cap; anything else throws", async () => {
  const dup = supabaseStore({ url: "https://x", key: "k", fetch: fakeFetch(() => new Response('{"code":"23505"}', { status: 409 })).f });
  expect(await dup.insert(row)).toBe("duplicate");
  const cap = supabaseStore({ url: "https://x", key: "k", fetch: fakeFetch(() => new Response('{"code":"PT429","message":"blindpanel daily cap"}', { status: 429 })).f });
  expect(await cap.insert(row)).toBe("cap");
  const err = supabaseStore({ url: "https://x", key: "k", fetch: fakeFetch(() => new Response("{}", { status: 404 })).f });
  await expect(err.insert(row)).rejects.toThrow(/404/);
});

test("tally calls the rpc in the blindpanel schema", async () => {
  const t = { study: "s", n_sessions: 0, items: {} };
  const { f, calls } = fakeFetch(() => Response.json(t));
  const store = supabaseStore({ url: "https://x", key: "k", fetch: f });
  expect(await store.tally("s", 5)).toEqual(t);
  expect(calls[0].url).toBe("https://x/rest/v1/rpc/tally");
  expect(new Headers(calls[0].init.headers).get("content-profile")).toBe("blindpanel");
  expect(JSON.parse(String(calls[0].init.body))).toEqual({ p_study: "s", p_min_n: 5 });
});

test("rows reads with Accept-Profile and maps item_order back", async () => {
  const { f, calls } = fakeFetch(() => Response.json([{ ...row, item_order: row.order, order: undefined }]));
  const store = supabaseStore({ url: "https://x", key: "k", fetch: f });
  const rows = await store.rows("s");
  expect(rows[0].order).toEqual(row.order);
  expect(calls[0].url).toMatch(/\/rest\/v1\/submissions\?study=eq\.s&select=/);
  expect(new Headers(calls[0].init.headers).get("accept-profile")).toBe("blindpanel");
});
