import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { createSubmitHandler, createTallyHandler } from "../server/handlers.js";
import { fileStore } from "../server/stores/file.js";
import { memoryStore } from "../server/stores/memory.js";
import type { Store } from "../server/stores/types.js";
import type { Loaded } from "./load.js";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

export interface DevOptions {
  port: number;
  host: string;
  store: "memory" | "file";
  dataDir?: string;
}

async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) break; // the handler answers 413 well before this
    chunks.push(c as Buffer);
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks);
  return new Request(new URL(req.url ?? "/", origin), { method: req.method, headers, body });
}

async function send(res: ServerResponse, r: Response) {
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}

function serveFile(root: string, req: IncomingMessage, res: ServerResponse) {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const rel = normalize(path === "/" ? "/index.html" : path).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, rel);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  const size = statSync(file).size;
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  const base = { "content-type": type, "accept-ranges": "bytes", "cache-control": "no-cache" };
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "content-range": `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...base, "content-length": size });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
}

/** Serves a built study with /api/submit and /api/tally over a local store. Not for production. */
export function serve(l: Loaded, root: string, o: DevOptions): Promise<{ server: Server; url: string; store: Store }> {
  const store = o.store === "file" ? fileStore({ dir: o.dataDir }) : memoryStore();
  const origins = [`http://localhost:${o.port}`, `http://127.0.0.1:${o.port}`];
  const submit = createSubmitHandler({ study: l.study, store, allowedOrigins: origins });
  const tally = createTallyHandler({ study: l.study, store });
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? "/", "http://x").pathname;
      if (path === l.study.endpoints.submit) return send(res, await submit(await toRequest(req, origins[0])));
      if (path === l.study.endpoints.tally) return send(res, await tally(await toRequest(req, origins[0])));
      serveFile(root, req, res);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" }).end(String(e));
    }
  });
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(o.port, o.host, () => ok({ server, url: `http://${o.host === "127.0.0.1" ? "localhost" : o.host}:${o.port}/`, store }));
  });
}
