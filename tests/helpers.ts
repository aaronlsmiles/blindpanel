import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { compile } from "../src/core/compile.js";
import { StudyConfig } from "../src/core/schema.js";

export async function loadExample(name: "synthetic" | "stilldrawn") {
  const dir = join(import.meta.dirname, "../examples", name);
  const io = {
    readText: (p: string) => readFileSync(join(dir, p), "utf8"),
    listDir: (p: string) => readdirSync(join(dir, p)),
  };
  return { dir, ...(await compile(StudyConfig.parse(parse(io.readText("study.yaml"))), io)) };
}

export const SESSION = "0b8f3c1e-5a2d-4c6b-9e7f-1a2b3c4d5e6f";
