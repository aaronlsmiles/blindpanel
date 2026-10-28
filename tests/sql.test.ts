// sql/schema.sql in a real Postgres (PGlite), with Supabase's three API roles recreated.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { tallyRows } from "../src/server/stores/tally.js";
import type { Row } from "../src/server/stores/types.js";

const SCHEMA = readFileSync(join(import.meta.dirname, "../sql/schema.sql"), "utf8");
let db: PGlite;
let n = 0;

const row = (answers: Row["answers"], flags: string[] = [], study = "demo"): Row => ({
  study, instrument: "1", session: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  order: { baseline: Object.keys(answers.baseline), clips: Object.keys(answers.clips) },
  answers, delivery: { autoplay: true, keyboard: false, duration_s: 30, ui: "t" }, flags, received_day: "",
});
const insertSql = `insert into blindpanel.submissions (study, instrument, session, item_order, answers, delivery, flags)
  values ($1, $2, $3, $4, $5, $6, $7)`;
const params = (r: Row) => [r.study, r.instrument, r.session, r.order, r.answers, r.delivery, r.flags];

async function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
const sqlstate = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  await db.exec(SCHEMA);
});
afterAll(() => db.close());

describe("sql/schema.sql", () => {
  test("applies twice", async () => {
    await db.exec(SCHEMA);
  });

  test("service_role inserts, cannot duplicate a session, cannot update or delete", async () => {
    const r = row({ baseline: { p1: { d: 4 } }, clips: { c1: { q: 3 } } });
    await as("service_role", () => db.query(insertSql, params(r)));
    expect(await as("service_role", () => sqlstate(db.query(insertSql, params(r))))).toBe("23505");
    expect(await as("service_role", () => sqlstate(db.query("update blindpanel.submissions set flags = '{}'")))).toBe("42501");
    expect(await as("service_role", () => sqlstate(db.query("delete from blindpanel.submissions")))).toBe("42501");
    expect(await as("service_role", () => sqlstate(db.query("select * from blindpanel.settings")))).toBe("42501");
    const t = await as("service_role", () => db.query<{ t: unknown }>("select blindpanel.tally('demo', 1) as t"));
    expect(t.rows[0].t).toMatchObject({ study: "demo", n_sessions: 1 });
  });

  test("the day is the server's, never the client's", async () => {
    const r = row({ baseline: {}, clips: { c9: { q: 1 } } });
    await as("service_role", () =>
      db.query(insertSql.replace("flags)", "flags, received_day)").replace("$7)", "$7, '1999-01-01')"), params(r)));
    const d = await db.query<{ ok: boolean }>("select received_day = current_date as ok from blindpanel.submissions where session = $1", [r.session]);
    expect(d.rows[0].ok).toBe(true);
  });

  test.each(["anon", "authenticated"])("%s can do nothing", async (role) => {
    const r = row({ baseline: {}, clips: { c1: { q: 3 } } });
    expect(await as(role, () => sqlstate(db.query("select * from blindpanel.submissions")))).toBe("42501");
    expect(await as(role, () => sqlstate(db.query(insertSql, params(r))))).toBe("42501");
    expect(await as(role, () => sqlstate(db.query("select blindpanel.tally('demo', 1)")))).toBe("42501");
    expect(await as(role, () => sqlstate(db.query("select * from blindpanel.settings")))).toBe("42501");
  });

  test("checks reject a bad study id and an oversized answer", async () => {
    const bad = row({ baseline: {}, clips: { c1: { q: 3 } } }, [], "Bad Study");
    expect(await as("service_role", () => sqlstate(db.query(insertSql, params(bad))))).toBe("23514");
    const big = row({ baseline: {}, clips: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`c${i}xxxxxxxx`, { question: 3 }])) });
    expect(await as("service_role", () => sqlstate(db.query(insertSql, params(big))))).toBe("23514");
    const flag = row({ baseline: {}, clips: { c1: { q: 3 } } }, ["made_up"]);
    expect(await as("service_role", () => sqlstate(db.query(insertSql, params(flag))))).toBe("23514");
  });

  test("the daily cap raises PT429", async () => {
    await db.exec("truncate blindpanel.submissions; update blindpanel.settings set value = 2 where key = 'daily_cap'");
    for (let i = 0; i < 2; i++) await as("service_role", () => db.query(insertSql, params(row({ baseline: {}, clips: { c1: { q: 3 } } }))));
    expect(await as("service_role", () => sqlstate(db.query(insertSql, params(row({ baseline: {}, clips: { c1: { q: 3 } } })))))).toBe("PT429");
    await db.exec("truncate blindpanel.submissions; update blindpanel.settings set value = 500 where key = 'daily_cap'");
  });

  test("tally() agrees with the JS tally", async () => {
    await db.exec("truncate blindpanel.submissions");
    const rows: Row[] = [];
    let s = 7;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31), (s % 5) + 1);
    for (let i = 0; i < 30; i++) {
      const clips = Object.fromEntries(["ca", "cb", "cc", "cd"].slice(0, 2 + (i % 3)).map((c) => [c, { look: rnd(), same: rnd() }]));
      rows.push(row({ baseline: { pa: { drawing: rnd() }, pb: { drawing: rnd() } }, clips }, i % 7 === 0 ? ["too_fast"] : []));
    }
    rows.push(row({ baseline: {}, clips: { ca: { look: 1, same: 1 } } }, [], "other"));
    for (const r of rows) await as("service_role", () => db.query(insertSql, params(r)));
    // a row inserted by hand, bypassing the validator, must not break the tally
    const bad = row({ baseline: { pa: 7 as never }, clips: { ca: { look: "x" as never, same: 9 } } });
    await db.query(insertSql, params(bad));
    for (const minN of [1, 5, 9]) {
      const got = await as("service_role", () => db.query<{ t: unknown }>("select blindpanel.tally('demo', $1) as t", [minN]));
      const js = tallyRows("demo", rows, minN);
      // the hand-made row counts as a session, but none of its values do
      expect(got.rows[0].t).toEqual({ ...js, n_sessions: js.n_sessions + 1 });
    }
  });
});
