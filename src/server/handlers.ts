import { validateSubmission } from "../core/payload.js";
import type { Study } from "../core/types.js";
import { flagsFor } from "./flags.js";
import type { Store } from "./stores/types.js";

const json = (status: number, body: unknown, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": cache } });
const fail = (status: number, error: string) => json(status, { ok: false, error });

export const today = () => new Date().toISOString().slice(0, 10);

export interface SubmitOptions {
  study: Study;
  store: Store;
  /** origins allowed to POST (e.g. https://example.org). Required: browsers always send Origin. */
  allowedOrigins: string[];
  maxBytes?: number;
  day?: () => string;
}

/** POST /api/submit. Web-standard Request -> Response, so it runs on Vercel, Node or anywhere with fetch. */
export function createSubmitHandler(o: SubmitOptions) {
  const max = o.maxBytes ?? 16 * 1024;
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return fail(405, "method not allowed");
    if (!o.study.modes.public.submit) return fail(403, "submissions are closed");
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json"))
      return fail(415, "send application/json");
    if (!o.allowedOrigins.includes(req.headers.get("origin") ?? "")) return fail(403, "origin not allowed");
    if (Number(req.headers.get("content-length") ?? 0) > max) return fail(413, "too large");
    const text = await req.text();
    if (new TextEncoder().encode(text).length > max) return fail(413, "too large");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return fail(400, "body is not JSON");
    }
    const v = await validateSubmission(o.study, body);
    if (!v.ok) return fail(v.status, v.error);
    const s = v.value;
    try {
      const r = await o.store.insert({
        study: s.study, instrument: s.instrument, session: s.session, order: s.order, answers: s.answers,
        delivery: s.delivery, flags: flagsFor(o.study, s), received_day: (o.day ?? today)(),
      });
      if (r === "duplicate") return fail(409, "this session was already submitted");
      if (r === "cap") return fail(429, "the study is not taking more submissions today");
      return json(200, { ok: true });
    } catch {
      return fail(503, "store unavailable");
    }
  };
}

/** GET /api/tally: the crowd's counts, cached at the edge for five minutes. */
export function createTallyHandler(o: { study: Study; store: Store; minN?: number }) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "GET" && req.method !== "HEAD") return fail(405, "method not allowed");
    if (!o.study.modes.public.tally) return fail(404, "no tally for this study");
    try {
      const t = await o.store.tally(o.study.id, o.minN ?? o.study.modes.public.min_crowd_n);
      return json(200, t, "public, s-maxage=300, stale-while-revalidate=3600");
    } catch {
      return fail(503, "unavailable");
    }
  };
}

/** GET /api/keepwarm, for a daily cron: one trivial query so a free database is not paused. */
export function createKeepwarmHandler(o: { store: Store; secret: string | undefined; study: string }) {
  return async (req: Request): Promise<Response> => {
    if (!o.secret) return fail(500, "keepwarm secret not configured");
    if (req.headers.get("authorization") !== `Bearer ${o.secret}`) return fail(401, "unauthorised");
    try {
      await o.store.tally(o.study, 1_000_000);
      return json(200, { ok: true });
    } catch {
      return fail(503, "unavailable");
    }
  };
}
