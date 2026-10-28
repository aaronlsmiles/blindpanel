import type { InsertResult, Row, Store, Tally } from "./types.js";

export interface SupabaseOptions {
  /** the project URL, https://<ref>.supabase.co */
  url: string;
  /** a secret key (sb_secret_…). Server-side only: it bypasses row-level security. */
  key: string;
  schema?: string;
  fetch?: typeof fetch;
}

/**
 * Talks to PostgREST with plain fetch. The secret key goes in the apikey header
 * only: secret keys are not JWTs, and Supabase rejects them in Authorization.
 * The schema must be listed under the project's exposed schemas (docs/deploy.md).
 */
export function supabaseStore(o: SupabaseOptions): Store {
  const f = o.fetch ?? fetch;
  const schema = o.schema ?? "blindpanel";
  const base = o.url.replace(/\/+$/, "");
  const headers = (extra: Record<string, string>) => ({ apikey: o.key, "content-type": "application/json", ...extra });
  const fail = async (what: string, r: Response) => {
    throw new Error(`supabase ${what} failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  };
  const tally = async (study: string, minN: number): Promise<Tally> => {
    const r = await f(`${base}/rest/v1/rpc/tally`, {
      method: "POST",
      headers: headers({ "content-profile": schema }),
      body: JSON.stringify({ p_study: study, p_min_n: minN }),
    });
    if (!r.ok) await fail("tally", r);
    return (await r.json()) as Tally;
  };
  return {
    async insert(row): Promise<InsertResult> {
      const { order, received_day: _day, ...rest } = row;
      const r = await f(`${base}/rest/v1/submissions`, {
        method: "POST",
        headers: headers({ "content-profile": schema, prefer: "return=minimal" }),
        body: JSON.stringify({ ...rest, item_order: order }),
      });
      if (r.ok) return "ok";
      const text = await r.text();
      if (r.status === 409 || text.includes('"23505"')) return "duplicate";
      if (r.status === 429 || text.includes('"PT429"')) return "cap";
      throw new Error(`supabase insert failed: ${r.status} ${text.slice(0, 200)}`);
    },
    tally,
    async rows(study) {
      const select = "study,instrument,session,item_order,answers,delivery,flags,received_day";
      const r = await f(`${base}/rest/v1/submissions?study=eq.${encodeURIComponent(study)}&select=${select}&order=id`, {
        headers: headers({ "accept-profile": schema }),
      });
      if (!r.ok) await fail("select", r);
      const rows = (await r.json()) as (Omit<Row, "order"> & { item_order: Row["order"] })[];
      return rows.map(({ item_order, ...x }) => ({ ...x, order: item_order }));
    },
    async ping() {
      await tally("keepwarm", 1);
    },
  };
}
