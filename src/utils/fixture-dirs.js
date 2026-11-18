// Fixture projects named by the repository's own npm scripts. dorny/test-reporter keeps
// sample .NET, Go, Dart, Jest, and Mocha projects under `reports/` and builds them with
// `dotnet-fixture`, `golang-json-fixture`, ... scripts. Those projects only produce test
// input; they must not put C#, Go, or MSBuild in the tech stack or add a domain.

import fs from "node:fs";
import path from "node:path";

// Folders that hold the product itself, never a fixture tree, even when a fixture script
// mentions them (`node scripts/gen-fixtures.js src/parsers`).
const PRODUCT_TOP_DIRS = new Set([
  "src", "lib", "app", "apps", "packages", "source", "cmd", "internal", "pkg",
  "scripts", "script", "tools", "bin", "dist", "build", "out", "node_modules",
]);

function isDir(file) {
  try {
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
}

function trimQuotes(value) {
  let start = 0;
  let end = value.length;
  while (start < end && (value[start] === "'" || value[start] === '"')) start += 1;
  while (end > start && (value[end - 1] === "'" || value[end - 1] === '"')) end -= 1;
  return value.slice(start, end);
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function pathTokens(command) {
  const tokens = [];
  for (const raw of String(command).split(/[\s|&;()]+/)) {
    let token = trimQuotes(raw);
    if (token.startsWith("./")) token = token.slice(2);
    if (!token || token.startsWith("-") || token.startsWith(".") || token.startsWith("/")) continue;
    if (/[=*$:%<>?]/.test(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

/**
 * `{ dir, script }[]`: up to two-segment directories referenced by root package.json scripts
 * whose name says fixture (`dotnet-fixture`, `fixtures:build`). Only existing directories.
 * @param {string} repoRoot
 */
export function detectScriptFixtureDirs(repoRoot) {
  let pkg;
  try {
    const file = path.join(repoRoot, "package.json");
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 1024 * 1024) return [];
    pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  const scripts = pkg && typeof pkg.scripts === "object" ? pkg.scripts : {};
  const found = new Map();
  for (const [name, command] of Object.entries(scripts)) {
    if (!/fixture/i.test(name) || typeof command !== "string") continue;
    for (const token of pathTokens(command)) {
      const parts = token.split("/").filter(Boolean);
      if (parts.length === 0 || PRODUCT_TOP_DIRS.has(parts[0].toLowerCase())) continue;
      // The first two segments (`reports/dotnet`), or the first one when the second is a
      // file (`fixtures/build.sh`). A path that does not exist (a stale script) marks nothing.
      let dir = null;
      const two = parts.slice(0, 2).join("/");
      if (parts.length >= 2 && isDir(path.join(repoRoot, two))) dir = two;
      else if (parts.length === 1 && isDir(path.join(repoRoot, parts[0]))) dir = parts[0];
      else if (parts.length === 2 && isFile(path.join(repoRoot, two))) dir = parts[0];
      if (dir && !found.has(dir)) found.set(dir, name);
    }
  }
  return [...found.entries()].map(([dir, script]) => ({ dir, script }));
}

/** The fixture entry whose directory holds `file` (a file path or module key), or null. */
export function fixtureDirOf(file, fixtureDirs = []) {
  const normalized = String(file || "").replace(/\\/g, "/");
  return fixtureDirs.find(({ dir }) => normalized === dir || normalized.startsWith(`${dir}/`)) || null;
}

/**
 * Phrase for the npm scripts that build a fixture module. `fixture` is one script name
 * or several joined by ", " (a module that spans more than one fixture dir).
 */
export function describeFixtureScripts(fixture) {
  const scripts = String(fixture || "").split(", ").filter(Boolean).map((name) => `\`${name}\``);
  if (scripts.length <= 1) return `the ${scripts[0] || "fixture"} npm script`;
  return `the ${scripts.slice(0, -1).join(", ")} and ${scripts[scripts.length - 1]} npm scripts`;
}
