import { cpSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { exportRows, openStore, report } from "./data.js";
import { serve } from "./dev.js";
import { loadStudy, lockPath, readLock, UsageError } from "./load.js";
import { buildSite, DIST } from "./site.js";
import { verify } from "./verify.js";

const HELP = `blindpanel <command> [study.yaml] [options]

  init <dir>                      copy the synthetic example into <dir> to start a study
  validate <study.yaml>           check the config against the schema
  build <study.yaml> [--out dir]  write the standalone site (default .blindpanel/build/<id>)
  dev <study.yaml> [--port 5173] [--store memory|file]
                                  build, then serve it with /api/submit and /api/tally
  verify <study.yaml> [--dist dir] [--media] [--instrument page.html]
                                  blinding scan, wording lock, orders, media
  lock <study.yaml> [--force]     record the wording's hash in study.lock.json
  export <study.yaml> --out dir [--store file|supabase] [--data dir]
                                  write ratings-V0001.json… and ratings.csv
  report <study.yaml> [--store file|supabase] [--data dir]
                                  crowd agreement against the panel and the metrics
`;

export async function main(argv: string[]): Promise<number> {
  const { values: o, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      dist: { type: "string" },
      port: { type: "string", default: "5173" },
      host: { type: "string", default: "127.0.0.1" },
      store: { type: "string" },
      data: { type: "string" },
      media: { type: "boolean", default: false },
      instrument: { type: "string" },
      force: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [cmd, arg] = positionals;
  if (!cmd || o.help) {
    process.stdout.write(HELP);
    return cmd || o.help ? 0 : 2;
  }
  const need = () => {
    if (!arg) throw new UsageError(`${cmd} needs a study.yaml`);
    return loadStudy(arg);
  };
  const buildDir = (id: string) => resolve(o.out ?? join(".blindpanel", "build", id));

  switch (cmd) {
    case "init": {
      if (!arg) throw new UsageError("init needs a folder");
      if (existsSync(join(arg, "study.yaml"))) throw new UsageError(`${arg}/study.yaml exists already`);
      cpSync(join(DIST, "..", "examples", "synthetic"), arg, { recursive: true });
      console.log(`Started a study in ${arg}. Edit study.yaml, then: blindpanel dev ${join(arg, "study.yaml")}`);
      return 0;
    }
    case "validate": {
      const l = await need();
      console.log(`ok: ${l.study.id}, ${l.study.parts.clips.items.length} clips, ${l.study.panels.length} panels, ${l.study.questions.length} questions`);
      return 0;
    }
    case "build": {
      const l = await need();
      const out = buildSite(l, buildDir(l.study.id));
      console.log(`built ${l.study.id} -> ${out}`);
      return 0;
    }
    case "lock": {
      const l = await need();
      const old = readLock(l);
      if (old && old.text_sha256 !== l.lock.text_sha256 && old.instrument === l.lock.instrument && !o.force) {
        throw new UsageError(`the wording changed but instrument is still ${old.instrument}. Bump instrument in study.yaml (or pass --force for a typo fix before any rating).`);
      }
      writeFileSync(lockPath(l), JSON.stringify(l.lock, null, 1) + "\n");
      console.log(`locked ${l.study.id} instrument ${l.lock.instrument} (${l.lock.text_sha256.slice(0, 12)}…)`);
      return 0;
    }
    case "verify": {
      const l = await need();
      const checks = await verify(l, { dist: o.dist ? resolve(o.dist) : undefined, media: o.media, instrumentHtml: o.instrument });
      for (const c of checks) {
        if (o.media && c.ok && c.name.startsWith("media reachable")) continue; // keep the list short
        console.log(`${c.ok ? "  ✓" : "  ✗"} ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
      }
      const failed = checks.filter((c) => !c.ok).length;
      console.log(failed ? `\n${failed} check(s) failed` : `\nall ${checks.length} checks passed`);
      return failed ? 1 : 0;
    }
    case "dev": {
      const l = await need();
      const out = buildSite(l, buildDir(l.study.id));
      const store = o.store === "file" ? "file" : "memory";
      const { url } = await serve(l, out, { port: Number(o.port), host: o.host!, store, dataDir: o.data });
      console.log(`blindpanel dev: ${l.study.title}\n  ${url}\n  store: ${store}${store === "file" ? ` (${o.data ?? ".blindpanel/data"})` : " (forgotten on exit)"}\n  Ctrl+C to stop`);
      return new Promise<number>(() => {});
    }
    case "export": {
      const l = await need();
      if (!o.out) throw new UsageError("export needs --out <dir>");
      const rows = await openStore(o.store, o.data).rows(l.study.id);
      const n = exportRows(l, rows, o.out);
      console.log(`exported ${n} submission(s) to ${o.out}`);
      return 0;
    }
    case "report": {
      const l = await need();
      console.log(report(l, await openStore(o.store, o.data).rows(l.study.id)));
      return 0;
    }
    default:
      throw new UsageError(`unknown command: ${cmd}\n\n${HELP}`);
  }
}
