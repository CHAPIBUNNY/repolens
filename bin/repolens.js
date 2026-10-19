#!/usr/bin/env node
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const wantsHelp = argv.includes("--help") || argv.includes("-h") || argv[0] === "help";
const wantsVersion = argv.includes("--version") || argv.includes("-v") || argv[0] === "version";

// --version and --help must not load the scanner, publishers, or telemetry.
if (wantsVersion && !wantsHelp) {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  console.log(pkg.version || "0.0.0");
  process.exit(0);
}

if (wantsHelp) {
  const { printHelp } = await import("../src/help.js");
  printHelp();
  process.exit(0);
}

const { runCli } = await import("../src/cli.js");
runCli();
