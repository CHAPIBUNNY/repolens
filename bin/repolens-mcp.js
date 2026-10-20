#!/usr/bin/env node
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const wantsHelp = argv.includes("--help") || argv.includes("-h");
const wantsVersion = argv.includes("--version") || argv.includes("-v");

if (wantsVersion && !wantsHelp) {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  console.log(pkg.version || "0.0.0");
  process.exit(0);
}

if (wantsHelp) {
  const { printHelp } = await import("../src/help.js");
  printHelp("mcp");
  process.exit(0);
}

// Stdio MCP owns stdout. Keep RepoLens logs on stderr.
process.env.REPOLENS_LOG_STDERR = "1";
const { startMcpServer } = await import("../src/mcp/server.js");
await startMcpServer();
