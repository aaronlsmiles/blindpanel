import { participantOrder, type ParticipantOrder } from "./order.js";
import type { Study, Submission } from "./types.js";

export const FORMAT = "blindpanel/1";
export const UI_VERSION = "blindpanel@0.1.0";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface SessionState {
  session: string;
  order: ParticipantOrder;
  /** how many blocks the visitor finished (1, or 2 after extending) */
  blocks: number;
  answers: Submission["answers"];
  delivery: { autoplay: boolean; keyboard: boolean; seconds: number };
}

/** The opt-in payload. No timestamps, names or free text: a rounded duration only. */
export function buildSubmission(study: Study, s: SessionState): Submission {
  const used = s.order.blocks.slice(0, s.blocks);
  return {
    format: FORMAT,
    study: study.id,
    instrument: study.instrument,
    session: s.session,
    order: { baseline: used.flatMap((b) => b.baseline), clips: used.flatMap((b) => b.clips) },
    answers: s.answers,
    delivery: {
      autoplay: s.delivery.autoplay,
      keyboard: s.delivery.keyboard,
      duration_s: Math.round(s.delivery.seconds / 10) * 10,
      ui: UI_VERSION,
    },
  };
}

export type Validation = { ok: true; value: Submission } | { ok: false; status: number; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: string[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

function answersFor(raw: unknown, codes: string[], questions: string[], part: string): Record<string, Record<string, number>> | string {
  if (!isObj(raw)) return `answers.${part} must be an object`;
  const keys = Object.keys(raw);
  if (keys.length !== codes.length || !codes.every((c) => c in raw)) return `answers.${part} must cover exactly the ordered items`;
  const out: Record<string, Record<string, number>> = {};
  for (const c of codes) {
    const a = raw[c];
    if (!isObj(a) || Object.keys(a).length !== questions.length) return `answers.${part}.${c} must answer exactly ${questions.join(", ")}`;
    out[c] = {};
    for (const q of questions) {
      const v = a[q];
      if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 5) return `answers.${part}.${c}.${q} must be an integer from 1 to 5`;
      out[c][q] = v as number;
    }
  }
  return out;
}

/** Shared by the page and the server. Rebuilds the value, so unknown fields never reach a store. */
export async function validateSubmission(study: Study, body: unknown): Promise<Validation> {
  const bad = (error: string): Validation => ({ ok: false, status: 400, error });
  if (!isObj(body)) return bad("body must be a JSON object");
  if (body.format !== FORMAT) return bad(`format must be ${FORMAT}`);
  if (body.study !== study.id) return bad("unknown study");
  if (body.instrument !== study.instrument) return bad("instrument has changed; reload the page");
  if (typeof body.session !== "string" || !UUID.test(body.session)) return bad("session must be a random (v4) UUID");
  const order = isObj(body.order) ? body.order : null;
  if (!order) return bad("order must be an object");

  const derived = await participantOrder(study, body.session);
  let blocks = 0;
  for (let k = 1; k <= derived.blocks.length; k++) {
    if (same(order.clips, derived.blocks.slice(0, k).flatMap((b) => b.clips))) blocks = k;
  }
  if (!blocks) return bad("order.clips does not match the order derived from the session");
  const used = derived.blocks.slice(0, blocks);
  const clipCodes = used.flatMap((b) => b.clips);
  const baseCodes = used.flatMap((b) => b.baseline);
  if (!same(order.baseline, baseCodes)) return bad("order.baseline does not match the order derived from the session");

  const qs = (part: string) => study.questions.filter((q) => q.part === part).map((q) => q.id);
  const answers = isObj(body.answers) ? body.answers : null;
  if (!answers) return bad("answers must be an object");
  const clips = answersFor(answers.clips, clipCodes, qs("clips"), "clips");
  if (typeof clips === "string") return bad(clips);
  const baseline = answersFor(answers.baseline ?? {}, baseCodes, qs("baseline"), "baseline");
  if (typeof baseline === "string") return bad(baseline);

  const d = isObj(body.delivery) ? body.delivery : null;
  if (!d) return bad("delivery must be an object");
  if (typeof d.autoplay !== "boolean" || typeof d.keyboard !== "boolean") return bad("delivery.autoplay and delivery.keyboard must be booleans");
  if (!Number.isInteger(d.duration_s) || (d.duration_s as number) < 0 || (d.duration_s as number) > 86400) return bad("delivery.duration_s must be an integer from 0 to 86400");
  if (typeof d.ui !== "string" || !/^[A-Za-z0-9@._/-]{1,64}$/.test(d.ui)) return bad("delivery.ui must be a short version string");

  return {
    ok: true,
    value: {
      format: FORMAT,
      study: study.id,
      instrument: study.instrument,
      session: body.session,
      order: { baseline: baseCodes, clips: clipCodes },
      answers: { baseline, clips },
      delivery: { autoplay: d.autoplay, keyboard: d.keyboard, duration_s: d.duration_s as number, ui: d.ui },
    },
  };
}
