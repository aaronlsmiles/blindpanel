// Regenerates schema/study.schema.json from the zod schema (run after `npm run build`).
import { writeFileSync } from "node:fs";
import { studyJsonSchema } from "../dist/core/schema.js";

const out = new URL("../schema/study.schema.json", import.meta.url);
writeFileSync(out, JSON.stringify(studyJsonSchema(), null, 2) + "\n");
console.log(`wrote ${out.pathname}`);
