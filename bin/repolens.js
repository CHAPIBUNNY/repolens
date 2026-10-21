#!/usr/bin/env node
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const command = argv.find((arg) => !arg.startsWith("-"));
const wantsHelp = argv.includes("--help") || argv.includes("-h") || command === "help";
const wantsVersion = argv.includes("--version") || argv.includes("-v") || command === "version";

// --version, --help, and a bare invocation must not load the scanner,
// publishers, or telemetry. `repolens <command> --help` prints that command.
if (wantsVersion && !wantsHelp) {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  console.log(pkg.version || "0.0.0");
  process.exit(0);
}

if (argv.length === 0 || wantsHelp) {
  const { printHelp } = await import("../src/help.js");
  const topic = wantsHelp && command && command !== "help" ? command : undefined;
  printHelp(topic);
  process.exit(0);
}

const { runCli } = await import("../src/cli.js");
runCli();
