#!/usr/bin/env node
// One-command setup from a clean clone (Node built-ins only).
//
//   npm run setup            install, build, verify both examples, then serve the synthetic study
//   npm run setup -- --ci    the same without the server, then the unit and end-to-end tests
import { spawnSync, spawn } from "node:child_process";

const ci = process.argv.includes("--ci");
const [major] = process.versions.node.split(".").map(Number);
if (major < 22) {
  console.error(`blindpanel needs Node 22 or later (this is ${process.versions.node}).`);
  process.exit(1);
}
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
function run(label, cmd, args) {
  console.log(`\n▸ ${label}\n  $ ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${r.status ?? r.signal}).`);
    process.exit(r.status ?? 1);
  }
}
const bp = (...args) => ["bin/blindpanel.mjs", ...args];

run("Install exact dependencies", npm, ["ci", "--no-audit", "--no-fund"]);
run("Build the kit", npm, ["run", "build"]);
for (const ex of ["synthetic", "stilldrawn"]) {
  run(`Build the ${ex} example`, process.execPath, bp("build", `examples/${ex}/study.yaml`));
  run(`Verify the ${ex} example`, process.execPath, bp("verify", `examples/${ex}/study.yaml`, "--dist", `.blindpanel/build/${ex}`));
}

if (ci) {
  run("Unit, golden and SQL tests", npm, ["test"]);
  run("Browser for the end-to-end tests (skipped if present)", npx, ["playwright", "install", "chromium"]);
  run("End-to-end tests (1440 and 390 px, light and dark)", npm, ["run", "e2e"]);
  console.log("\n✓ setup --ci passed: a clean clone builds, verifies and passes every test.");
} else {
  console.log("\n✓ Set up. Starting the synthetic study (memory store; Ctrl+C to stop).");
  console.log("  For StillDrawn (needs the network for media): node bin/blindpanel.mjs dev examples/stilldrawn/study.yaml\n");
  spawn(process.execPath, bp("dev", "examples/synthetic/study.yaml", "--store", "memory"), { stdio: "inherit" });
}
