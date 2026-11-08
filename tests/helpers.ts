import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { compile } from "../src/core/compile.js";
import { StudyConfig } from "../src/core/schema.js";

export async function loadExample(name: "synthetic" | "stilldrawn" | "choice", edit: (c: any) => void = () => {}) {
  const dir = join(import.meta.dirname, "../examples", name);
  const io = {
    readText: (p: string) => readFileSync(join(dir, p), "utf8"),
    listDir: (p: string) => readdirSync(join(dir, p)),
  };
  const c = parse(io.readText("study.yaml"));
  edit(c);
  return { dir, ...(await compile(StudyConfig.parse(c), io)) };
}

/** An edit for examples/synthetic: box-drift (ref c02) repeated at position 4, in one block of four. */
export const withSyntheticRepeat = (c: any) =>
  Object.assign(c.parts.clips, { extend: false, session_size: 4, repeats: { min_gap: 2, items: [{ of: "box-drift_engine-beta", position: 4 }] } });

export const SESSION = "0b8f3c1e-5a2d-4c6b-9e7f-1a2b3c4d5e6f";
