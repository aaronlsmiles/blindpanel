import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { participantOrder } from "../core/order.js";
import { plainText } from "../core/text.js";
import type { Loaded } from "./load.js";
import { readLock } from "./load.js";

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface VerifyOptions {
  /** a built site to scan (default: none; build first) */
  dist?: string;
  /** fetch every remote media URL and check status, headers and sha256 */
  media?: boolean;
  /** a checkout of the study's source release, to compare the wording with its instrument page */
  instrumentHtml?: string;
  fetch?: typeof fetch;
}

const TEXT = /\.(html|js|mjs|css|json|txt|md|map|svg)$/i;
// written split so this file does not trip a secrets scan of its own
const SECRETS = [new RegExp("op" + ":\\/\\/"), /sb_secret_[A-Za-z0-9_-]+/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /eyJhbGciOi[A-Za-z0-9_-]{20,}/];
const SECRET_FILES = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|credentials[^/]*\.json)$/i;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function findBanned(text: string, banned: (string | RegExp)[]): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const b of banned) {
    if (typeof b === "string") {
      if (lower.includes(b.toLowerCase())) hits.push(b);
    } else {
      const m = text.match(b);
      if (m) hits.push(`${b} -> ${m[0]}`);
    }
  }
  return hits;
}

const sha256 = (buf: Buffer | Uint8Array) => createHash("sha256").update(buf).digest("hex");
const norm = (s: string) => s.replace(/\s+/g, " ").replace(/[“”]/g, '"').trim();

export async function verify(l: Loaded, o: VerifyOptions = {}): Promise<Check[]> {
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, ...(ok || !detail ? {} : { detail }) });
  const s = l.study;

  // 1. the wording lock
  const lock = readLock(l);
  check("study.lock.json exists", !!lock, "run `blindpanel lock`");
  if (lock) {
    check(
      "wording matches study.lock.json",
      lock.text_sha256 === l.lock.text_sha256,
      lock.instrument === l.lock.instrument
        ? "the wording changed but `instrument` did not: bump it, then run `blindpanel lock`"
        : "the instrument was bumped: run `blindpanel lock`",
    );
    check("instrument matches study.lock.json", lock.instrument === l.lock.instrument, `lock says ${lock.instrument}`);
  }

  // 2. items and references
  const clipCodes = s.parts.clips.items.map((i) => i.code);
  const panelCodes = s.panels.map((p) => p.code);
  check("clip codes unique", new Set(clipCodes).size === clipCodes.length);
  check("panel codes unique", new Set(panelCodes).size === panelCodes.length);
  const missingRef = s.parts.clips.items.filter((i) => !panelCodes.includes(i.reference));
  check("every clip's reference panel exists", !missingRef.length, missingRef.map((i) => i.code).join(", "));
  if (l.reveal.reference) {
    const r = l.reveal.reference;
    const empty = Object.entries(r.ratings).filter(([, m]) => m.every((row) => row.every((v) => v === null)));
    check("reference ratings cover every question", !empty.length, `no ratings for ${empty.map(([q]) => q).join(", ")} (check each item's ref)`);
    const unrated = clipCodes.filter((_, j) => Object.values(r.ratings).every((m) => m.every((row) => row[j] === null)));
    check("every clip has reference ratings", !unrated.length, `${unrated.length} clip(s) without any`);
  }

  // 3. orders: deterministic, and each block's stills come before its clips
  const sessions = ["00000000-0000-4000-8000-000000000001", "11111111-2222-4333-8444-555555555555", "abcdefab-cdef-4abc-9def-abcdefabcdef"];
  let deterministic = true;
  let baselineFirst = true;
  const firsts = new Set<string>();
  for (const sid of sessions) {
    const a = await participantOrder(s, sid);
    const b = await participantOrder(s, sid);
    if (JSON.stringify(a) !== JSON.stringify(b)) deterministic = false;
    firsts.add(a.clips.join());
    if (s.parts.baseline) {
      const asked = new Set<string>();
      for (const blk of a.blocks) {
        blk.baseline.forEach((p) => asked.add(p));
        for (const c of blk.clips) if (!asked.has(s.parts.clips.items.find((i) => i.code === c)!.reference)) baselineFirst = false;
      }
    }
  }
  check("orders are deterministic per session", deterministic);
  check("orders differ across sessions", clipCodes.length < 3 || firsts.size > 1);
  if (s.parts.baseline) check("each clip's still is rated before the clip", baselineFirst);

  // 4. blinding: nothing that names a model before the reveal
  check("banned terms are declared", l.banned.length > 0, "set blinding.banned_terms_file");
  const urlHits = [...s.panels.map((p) => p.image), ...s.parts.clips.items.map((i) => i.video)].flatMap((u) => findBanned(u, l.banned).map((h) => `${u}: ${h}`));
  check("no banned term in media URLs", !urlHits.length, urlHits.slice(0, 5).join("; "));
  const studyHits = findBanned(JSON.stringify(s), l.banned);
  check("no banned term in study.json", !studyHits.length, studyHits.join(", "));

  if (o.dist) {
    const files = existsSync(o.dist) ? walk(o.dist) : [];
    check("built site exists", files.length > 0, `nothing at ${o.dist}: run \`blindpanel build\``);
    const reveal = join(o.dist, s.endpoints.reveal.replace(/^\.?\//, ""));
    const hits: string[] = [];
    const secrets: string[] = [];
    const external: string[] = [];
    const allowed = new Set(l.config.media.origins.map((u) => new URL(u).origin));
    for (const f of files) {
      const rel = relative(o.dist, f);
      for (const h of findBanned(rel, l.banned)) hits.push(`filename ${rel}: ${h}`);
      if (SECRET_FILES.test(rel)) secrets.push(rel);
      if (!TEXT.test(f)) continue;
      const text = readFileSync(f, "utf8");
      for (const re of SECRETS) if (re.test(text)) secrets.push(`${rel} ~ ${re.source.slice(0, 12)}…`);
      if (f === reveal) continue; // the declared exemption: fetched only after completion
      for (const h of findBanned(text, l.banned)) hits.push(`${rel}: ${h}`);
      for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
        let origin = "";
        try {
          origin = new URL(m[0]).origin;
        } catch {
          origin = m[0];
        }
        if (!allowed.has(origin)) external.push(`${rel}: ${m[0]}`);
      }
    }
    check("no banned term in the built site (reveal.json exempt)", !hits.length, hits.slice(0, 8).join("; "));
    check("no secrets or secret-like files in the built site", !secrets.length, secrets.join("; "));
    check("no URLs outside media.origins in the built site", !external.length, external.slice(0, 8).join("; "));
    check("reveal.json is present (fetched only after completion)", existsSync(reveal));
  }

  // 5. media: local files exist and match; remote ones with --media
  for (const c of l.checks) {
    if (c.local) {
      const p = join(l.dir, c.local);
      if (!existsSync(p)) {
        check(`media present: ${c.local}`, false, "missing");
        continue;
      }
      if (c.sha256) check(`media sha256: ${c.local}`, sha256(readFileSync(p)) === c.sha256, "hash differs from study.yaml");
    }
  }
  if (o.media) {
    const f = o.fetch ?? fetch;
    const remote = l.checks.filter((c) => !c.local);
    let bad = 0;
    for (const c of remote) {
      try {
        const r = await f(c.url);
        const headerText = [...r.headers].map(([k, v]) => `${k}: ${v}`).join("\n");
        const hdr = findBanned(headerText, l.banned);
        const buf = new Uint8Array(await r.arrayBuffer());
        const ok = r.ok && buf.length > 0 && (!c.sha256 || sha256(buf) === c.sha256) && !hdr.length;
        if (!ok) bad++;
        check(`media reachable and intact: ${c.url}`, ok, !r.ok ? `HTTP ${r.status}` : hdr.length ? `header names a model: ${hdr.join(", ")}` : "sha256 differs");
      } catch (e) {
        bad++;
        check(`media reachable and intact: ${c.url}`, false, (e as Error).message);
      }
    }
    check(`all ${remote.length} remote media reachable, unaltered, and silent in their headers`, bad === 0);
  }

  // 6. wording against the source instrument page, when given
  if (o.instrumentHtml) {
    const html = readFileSync(o.instrumentHtml, "utf8")
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const page = norm(html);
    const strings = [
      ...s.questions.flatMap((q) => [q.text, q.direction ?? "", ...q.notes, ...q.intro_notes]),
      ...Object.values(s.scales).flatMap((x) => x.labels),
      s.parts.clips.watch_note,
    ].filter(Boolean);
    const missing = strings.filter((t) => !page.includes(norm(plainText(t))));
    check(`wording appears verbatim in ${o.instrumentHtml.split("/").pop()}`, !missing.length, missing.map((m) => m.slice(0, 50)).join(" | "));
  }
  return checks;
}
