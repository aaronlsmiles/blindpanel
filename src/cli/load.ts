import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import { compile, type Compiled } from "../core/compile.js";
import { StudyConfig } from "../core/schema.js";

export interface Loaded extends Compiled {
  path: string;
  dir: string;
  config: StudyConfig;
}

export class UsageError extends Error {}

export async function loadStudy(path: string): Promise<Loaded> {
  const file = resolve(path);
  if (!existsSync(file)) throw new UsageError(`no such file: ${path}`);
  const dir = dirname(file);
  let raw: unknown;
  try {
    raw = parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new UsageError(`${path} is not valid YAML: ${(e as Error).message}`);
  }
  const r = StudyConfig.safeParse(raw);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  ${i.path.join(".") || "(top level)"}: ${i.message}`);
    throw new UsageError(`${path} does not match the study schema:\n${lines.join("\n")}`);
  }
  const io = {
    readText: (p: string) => readFileSync(join(dir, p), "utf8"),
    listDir: (p: string) => readdirSync(join(dir, p)),
  };
  return { path: file, dir, config: r.data, ...(await compile(r.data, io)) };
}

export const lockPath = (l: Loaded) => join(l.dir, "study.lock.json");

export function readLock(l: Loaded): { instrument: string; text_sha256: string } | null {
  try {
    return JSON.parse(readFileSync(lockPath(l), "utf8"));
  } catch {
    return null;
  }
}
