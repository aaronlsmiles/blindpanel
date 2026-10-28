#!/usr/bin/env node
import { main } from "../dist/cli/main.js";
import { UsageError } from "../dist/cli/load.js";

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof UsageError ? e.message : e);
    process.exit(e instanceof UsageError ? 2 : 1);
  },
);
